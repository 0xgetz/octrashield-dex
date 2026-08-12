"""Deploy OctraShield contracts to an Octra network.

The deployer is intentionally configuration-driven: credentials and paths are
read from environment variables instead of being embedded in source code.
The script also fails closed when a deployment transaction is not confirmed,
because predicting the next contract address from an unconfirmed nonce is
unsafe.
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from nacl.signing import SigningKey

ROOT_DIR = Path(__file__).resolve().parent
AML_DIR = Path(os.getenv("AML_DIR", str(ROOT_DIR / "contracts" / "aml")))
CONFIG_FILE = Path(os.getenv("CONFIG_FILE", str(ROOT_DIR / "config" / "octra-network.json")))
RPC = os.getenv("OCTRA_RPC_URL", "https://devnet.octrascan.io/rpc")
EXPLORER = os.getenv("OCTRA_EXPLORER_URL", "https://devnet.octrascan.io")
DEPLOYER_ADDRESS = os.getenv("DEPLOYER_ADDRESS", "").strip()
PRIVATE_KEY_B64 = os.getenv("PRIVATE_KEY_B64", "").strip()

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "octrashield-deployer/1.0",
}
_rpc_id = 0


def load_signing_key() -> SigningKey:
    if not PRIVATE_KEY_B64:
        raise RuntimeError(
            "PRIVATE_KEY_B64 is required. Export it through a secret manager or a local .env file."
        )
    if not DEPLOYER_ADDRESS:
        raise RuntimeError("DEPLOYER_ADDRESS is required.")
    try:
        seed = base64.b64decode(PRIVATE_KEY_B64, validate=True)
    except Exception as exc:
        raise RuntimeError("PRIVATE_KEY_B64 is not valid base64.") from exc
    if len(seed) != 32:
        raise RuntimeError(f"PRIVATE_KEY_B64 must decode to exactly 32 bytes, got {len(seed)}.")
    return SigningKey(seed)


SIGNING_KEY = load_signing_key()
PUBLIC_KEY_B64 = base64.b64encode(SIGNING_KEY.verify_key.encode()).decode()


def http_post(url: str, payload: bytes) -> dict[str, Any]:
    request = Request(url, data=payload, headers=HEADERS, method="POST")
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"RPC request failed: {exc}") from exc
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("RPC returned an invalid JSON response.") from exc


def rpc_call(method: str, params: list[Any]) -> dict[str, Any]:
    global _rpc_id
    _rpc_id += 1
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": _rpc_id, "method": method, "params": params},
        separators=(",", ":"),
    ).encode("utf-8")
    response = http_post(RPC, payload)
    if "error" in response:
        raise RuntimeError(f"RPC [{method}] error: {response['error']}")
    result = response.get("result", {})
    if not isinstance(result, dict):
        raise RuntimeError(f"RPC [{method}] returned an unexpected result.")
    return result


def canonical_json(tx: dict[str, Any]) -> str:
    """Build the canonical transaction JSON used by the Octra signer."""
    op = tx.get("op_type") or "standard"
    parts = [
        f'"from":{json.dumps(tx["from"], separators=(",", ":"))}',
        f'"to_":{json.dumps(tx["to_"], separators=(",", ":"))}',
        f'"amount":{json.dumps(str(tx["amount"]), separators=(",", ":"))}',
        f'"nonce":{tx["nonce"]}',
        f'"ou":{json.dumps(str(tx["ou"]), separators=(",", ":"))}',
        f'"timestamp":{json.dumps(tx["timestamp"], separators=(",", ":"))}',
        f'"op_type":{json.dumps(op, separators=(",", ":"))}',
    ]
    for field in ("encrypted_data", "message"):
        if tx.get(field):
            parts.append(f'{json.dumps(field)}:{json.dumps(tx[field], separators=(",", ":"))}')
    return "{" + ",".join(parts) + "}"


def sign_tx(tx: dict[str, Any]) -> str:
    signature = SIGNING_KEY.sign(canonical_json(tx).encode("utf-8")).signature
    return base64.b64encode(signature).decode()


def get_next_nonce() -> int:
    balance = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    pending = int(balance.get("pending_nonce", balance.get("nonce", 0)))
    return pending + 1


def compile_aml(source: str) -> str:
    result = rpc_call("octra_compileAml", [source])
    bytecode = result.get("bytecode") or result.get("Bytecode") or result.get("data")
    if not isinstance(bytecode, str) or not bytecode:
        raise RuntimeError(f"No bytecode returned by compiler: {result}")
    return bytecode


def compute_contract_address(bytecode_b64: str, nonce: int) -> str:
    result = rpc_call(
        "octra_computeContractAddress",
        [bytecode_b64, DEPLOYER_ADDRESS, str(nonce)],
    )
    address = result.get("address") or result.get("contract_address")
    if not isinstance(address, str) or not address:
        raise RuntimeError(f"Could not compute contract address: {result}")
    return address


def wait_confirm(tx_hash: str, timeout: int = 90) -> str:
    start = time.time()
    while time.time() - start < timeout:
        result = rpc_call("octra_transaction", [tx_hash])
        status = result.get("status") or result.get("tx_status") or ""
        if status in ("confirmed", "success", "included"):
            return str(status)
        if status in ("rejected", "dropped"):
            raise RuntimeError(f"Transaction {tx_hash} failed with status {status}: {result}")
        time.sleep(4)
    raise TimeoutError(f"Transaction {tx_hash} was not confirmed within {timeout} seconds.")


def deploy_one(label: str, aml_file: str) -> tuple[str, str]:
    source_path = AML_DIR / aml_file
    if not source_path.is_file():
        raise FileNotFoundError(f"AML source not found: {source_path}")
    bytecode = compile_aml(source_path.read_text(encoding="utf-8"))
    nonce = get_next_nonce()
    contract_address = compute_contract_address(bytecode, nonce)
    tx: dict[str, Any] = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_address,
        "amount": "0",
        "nonce": nonce,
        "ou": os.getenv("DEPLOY_OU", "1000"),
        "timestamp": time.time(),
        "op_type": "deploy",
        "encrypted_data": bytecode,
        "message": "CONTRACT_DEPLOY",
    }
    result = rpc_call(
        "octra_submit",
        [{**tx, "signature": sign_tx(tx), "public_key": PUBLIC_KEY_B64}],
    )
    tx_hash = result.get("tx_hash") or result.get("hash")
    if not isinstance(tx_hash, str) or not tx_hash:
        raise RuntimeError(f"Deployment of {label} returned no transaction hash: {result}")
    wait_confirm(tx_hash)
    print(f"{label}: {contract_address} ({EXPLORER}/tx/{tx_hash})")
    return contract_address, tx_hash


def main() -> None:
    contracts = [
        ("shieldToken", "shield_token.aml"),
        ("aiEngine", "ai_engine.aml"),
        ("factory", "factory.aml"),
        ("pair", "pair.aml"),
        ("router", "router.aml"),
    ]
    results: dict[str, str] = {}
    tx_hashes: dict[str, str] = {}
    for key, source_name in contracts:
        results[key], tx_hashes[key] = deploy_one(key, source_name)
        time.sleep(3)

    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    config.setdefault("contracts", {}).update(results)
    config["contracts"].update(
        {
            "_deployer": DEPLOYER_ADDRESS,
            "_txHashes": tx_hashes,
            "_deployedAt": time.strftime("%Y-%m-%d"),
        }
    )
    CONFIG_FILE.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, TimeoutError, FileNotFoundError, OSError) as exc:
        print(f"Deployment aborted: {exc}", file=sys.stderr)
        raise SystemExit(1)
