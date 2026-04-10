"""
OctraShield DEX — Contract Deploy Script
=========================================
Deploys compiled AML contracts to Octra Network via JSON-RPC 2.0.

Octra Network facts (NOT EVM):
  - No numeric chain ID — network identified by version string "v3.0.0-irmin"
  - RPC: JSON-RPC 2.0 POST to OCTRA_RPC_URL
  - Signing: Ed25519 (not ECDSA)
  - Fees: Operation Units (OU), not gas — query via octra_recommendedFee
  - Compile contracts: octra_compileAml RPC method (no local compiler needed)
  - Explorer: https://octrascan.io
  - Faucet: https://faucet.octra.network

Usage:
    export PRIVATE_KEY_B64=<base64-encoded 32-byte Ed25519 seed>
    export OCTRA_RPC_URL=http://46.101.86.250:8080/rpc   # or set in .env
    python deploy.py <contract.aml>
"""
import os
import json
import base64
import time
import hashlib
import sys
from typing import Optional, Tuple

import requests
from nacl.signing import SigningKey

# ---------------------------------------------------------------------------
# Configuration — all values read from environment variables
# ---------------------------------------------------------------------------

# Ed25519 private key seed (32 bytes, base64-encoded)
PRIVATE_KEY_B64: str = os.getenv("PRIVATE_KEY_B64", "")
if not PRIVATE_KEY_B64:
    raise EnvironmentError(
        "PRIVATE_KEY_B64 environment variable is not set.\n"
        "Export your 32-byte Ed25519 seed as base64, e.g.:\n"
        "  export PRIVATE_KEY_B64=$(python -c \"import base64,os; print(base64.b64encode(os.urandom(32)).decode())\")\n"
        "WARNING: Never commit your private key. Add wallet.json and *.key to .gitignore."
    )

# Octra Network RPC endpoint (JSON-RPC 2.0 POST)
# Default: current testnet/mainnet-alpha node
OCTRA_RPC_URL: str = os.getenv("OCTRA_RPC_URL", "http://46.101.86.250:8080/rpc")

# Deployer address (oct-prefixed, 47 chars)
DEPLOYER_ADDRESS: str = os.getenv("DEPLOYER_ADDRESS", "oct25CVMgbie4Cu6zpAgxpiHy1odbf8GszFxrSqSdBMknx6")

# Faucet for testnet tokens
FAUCET_URL = "https://faucet.octra.network"
# Explorer for tx/contract lookup
EXPLORER_URL = "https://octrascan.io"

# ---------------------------------------------------------------------------
# Key setup — Ed25519 via PyNaCl
# ---------------------------------------------------------------------------
private_key_seed = base64.b64decode(PRIVATE_KEY_B64)
assert len(private_key_seed) == 32, (
    f"Private key seed must be exactly 32 bytes, got {len(private_key_seed)}"
)
sk = SigningKey(private_key_seed)


# ---------------------------------------------------------------------------
# JSON-RPC 2.0 helper
# ---------------------------------------------------------------------------
_rpc_id = 0

def rpc_call(method: str, params: list) -> dict:
    """
    Send a JSON-RPC 2.0 POST request to the Octra node.
    Raises on HTTP error or JSON-RPC error response.
    """
    global _rpc_id
    _rpc_id += 1
    payload = {
        "jsonrpc": "2.0",
        "id": _rpc_id,
        "method": method,
        "params": params,
    }
    resp = requests.post(
        OCTRA_RPC_URL,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error [{method}]: {data['error']}")
    return data.get("result", {})


# ---------------------------------------------------------------------------
# Canonical JSON for Ed25519 signing
# ---------------------------------------------------------------------------
def canonical_json(tx_data: dict) -> str:
    """
    Build canonical JSON matching the C++ implementation for Ed25519 signing.
    Field order: from, to_, amount, nonce, ou, timestamp, op_type,
                 [encrypted_data], [message]
    Numeric values (nonce, timestamp) are NOT quoted.
    """
    parts = [
        f'"from":"{tx_data["from"]}"',
        f'"to_":"{tx_data["to_"]}"',
        f'"amount":"{tx_data["amount"]}"',
        f'"nonce":{tx_data["nonce"]}',
        f'"ou":"{tx_data["ou"]}"',
        f'"timestamp":{int(tx_data["timestamp"])}',
        f'"op_type":"{tx_data["op_type"]}"',
    ]
    if tx_data.get("encrypted_data"):
        parts.append(f'"encrypted_data":"{tx_data["encrypted_data"]}"')
    if tx_data.get("message"):
        parts.append(f'"message":"{tx_data["message"]}"')
    return "{" + ",".join(parts) + "}"


def sign_transaction(tx_data: dict) -> Tuple[str, str]:
    """Sign tx using Ed25519 and return (signature_b64, public_key_b64)."""
    msg = canonical_json(tx_data)
    signed = sk.sign(msg.encode("utf-8"))
    signature_b64 = base64.b64encode(signed.signature).decode()
    public_key_b64 = base64.b64encode(sk.verify_key.encode()).decode()
    return signature_b64, public_key_b64


# ---------------------------------------------------------------------------
# Octra RPC operations
# ---------------------------------------------------------------------------
def compile_contract(aml_source: str) -> Optional[dict]:
    """
    Compile AML source code to bytecode using the octra_compileAml RPC method.
    No local compiler needed — compilation happens on the node.

    Returns: {"bytecode": str, "abi": str, "size": int, "version": str}
    """
    print(f"Compiling contract via {OCTRA_RPC_URL} (octra_compileAml)...")
    result = rpc_call("octra_compileAml", [aml_source])
    print(f"  Bytecode: {result.get('bytecode', '')[:64]}...")
    print(f"  Size: {result.get('size', '?')} bytes")
    print(f"  Version: {result.get('version', '?')}")
    return result


def get_recommended_fee(op_type: str = "deploy") -> str:
    """
    Query recommended Operation Units (OU) fee from the node.
    Octra uses OU — NOT gas. Never hardcode fee values.
    """
    result = rpc_call("octra_recommendedFee", [])
    # result shape: {"standard": "200", "stealth": "300", "deploy": "500", "call": "250"}
    fee = result.get(op_type, result.get("standard", "500"))
    print(f"  Recommended OU fee ({op_type}): {fee}")
    return str(fee)


def get_account_info(address: str) -> dict:
    """Get account balance and nonce via octra_balance."""
    return rpc_call("octra_balance", [address])


def check_balance() -> bool:
    """Check deployer balance and warn if below threshold."""
    print(f"Checking balance for {DEPLOYER_ADDRESS}...")
    data = get_account_info(DEPLOYER_ADDRESS)
    balance_raw = int(data.get("balance_raw", "0"))
    balance_oct = balance_raw / 1_000_000
    print(f"  Balance: {balance_oct:.6f} OCT")
    if balance_raw < 500_000:
        print(f"\nWARNING: Balance may be insufficient for deployment.")
        print(f"Get testnet OCT from: {FAUCET_URL}")
        return False
    return True


def get_nonce() -> Optional[int]:
    """Get next nonce for the deployer address."""
    data = get_account_info(DEPLOYER_ADDRESS)
    nonce = data.get("nonce", 0)
    return nonce + 1


def calculate_contract_address(bytecode_b64: str, deployer: str, nonce: int) -> str:
    """
    Derive contract address from bytecode + deployer + nonce.
    Alternatively, use octra_computeContractAddress RPC for authoritative result.
    """
    # Use RPC method for accuracy
    try:
        result = rpc_call("octra_computeContractAddress", [bytecode_b64, deployer, nonce])
        return result.get("address", _local_compute_address(bytecode_b64, deployer, nonce))
    except Exception:
        return _local_compute_address(bytecode_b64, deployer, nonce)


def _local_compute_address(bytecode_b64: str, deployer: str, nonce: int) -> str:
    """Fallback local address computation (mirrors on-chain logic)."""
    bytecode_raw = base64.b64decode(bytecode_b64)
    unique_data = f"{bytecode_raw.decode('latin-1')}:{deployer}:{nonce}"
    hash_bytes = hashlib.sha256(unique_data.encode("latin-1")).digest()
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(hash_bytes, "big")
    base58_str = ""
    while n > 0:
        n, r = divmod(n, 58)
        base58_str = alphabet[r] + base58_str
    base58_part = base58_str[:44].ljust(44, "1")
    return "oct" + base58_part


def deploy_contract(bytecode: str, nonce: int) -> Tuple[Optional[str], Optional[str]]:
    """Submit a deploy transaction and return (contract_address, tx_hash)."""
    # Query recommended OU fee — never hardcode
    ou_fee = get_recommended_fee("deploy")
    timestamp = time.time()
    contract_address = calculate_contract_address(bytecode, DEPLOYER_ADDRESS, nonce)

    tx_data = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_address,
        "amount": "0",
        "nonce": nonce,
        "ou": ou_fee,
        "timestamp": timestamp,
        "op_type": "deploy",
        "encrypted_data": bytecode,
        "message": "CONTRACT_DEPLOY",
    }

    signature_b64, public_key_b64 = sign_transaction(tx_data)

    tx = {
        **tx_data,
        "signature": signature_b64,
        "public_key": public_key_b64,
    }

    print(f"Submitting deploy transaction...")
    print(f"  Contract address: {contract_address}")
    print(f"  OU fee: {ou_fee}")

    # Submit via octra_submit (JSON-RPC 2.0)
    result = rpc_call("octra_submit", [tx])
    tx_hash = result.get("tx_hash") or result.get("hash")
    print(f"  TX hash: {tx_hash}")
    print(f"  View on explorer: {EXPLORER_URL}/tx/{tx_hash}")
    return contract_address, tx_hash


def wait_for_confirmation(tx_hash: str, timeout: int = 120) -> bool:
    """Poll for transaction confirmation via octra_transaction."""
    print(f"Waiting for confirmation (timeout: {timeout}s)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            data = rpc_call("octra_transaction", [tx_hash])
            status = data.get("status", "unknown")
            if status == "confirmed":
                epoch = data.get("epoch", "?")
                print(f"  Confirmed in epoch {epoch}")
                return True
            print(f"  Status: {status}... (polling)")
        except Exception as e:
            print(f"  Poll error: {e}")
        time.sleep(5)
    print("  Timeout waiting for confirmation")
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <contract.aml>")
        print(f"\nEnvironment variables:")
        print(f"  PRIVATE_KEY_B64   — Ed25519 seed (32 bytes, base64)")
        print(f"  OCTRA_RPC_URL     — RPC endpoint (default: {OCTRA_RPC_URL})")
        print(f"  DEPLOYER_ADDRESS  — oct-prefixed deployer address")
        sys.exit(1)

    contract_file = sys.argv[1]

    print(f"\n=== OctraShield DEX — Contract Deployer ===")
    print(f"Network: Octra (v3.0.0-irmin, NOT EVM)")
    print(f"RPC: {OCTRA_RPC_URL}")
    print(f"Explorer: {EXPLORER_URL}")
    print(f"Deployer: {DEPLOYER_ADDRESS}\n")

    # 1. Check balance
    if not check_balance():
        print("\nFund your address and retry.")
        sys.exit(1)

    # 2. Read and compile AML source via RPC
    with open(contract_file, "r") as f:
        aml_source = f.read()
    compiled = compile_contract(aml_source)
    if not compiled:
        sys.exit(1)
    bytecode = compiled["bytecode"]

    # 3. Get nonce
    nonce = get_nonce()
    if nonce is None:
        sys.exit(1)

    # 4. Deploy
    contract_address, tx_hash = deploy_contract(bytecode, nonce)
    if not contract_address:
        sys.exit(1)

    # 5. Wait for confirmation
    if wait_for_confirmation(tx_hash):
        print(f"\n=== Deployment Successful ===")
        print(f"Contract: {contract_address}")
        print(f"TX: {EXPLORER_URL}/tx/{tx_hash}")
        print(f"Contract: {EXPLORER_URL}/contract/{contract_address}")
    else:
        print(f"\nTransaction pending: {EXPLORER_URL}/tx/{tx_hash}")


if __name__ == "__main__":
    main()
