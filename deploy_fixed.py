"""
OctraShield DEX - Fixed Deploy Script
Uses correct canonical_json format matching webcli tx_builder.hpp
"""
import os, json, base64, time, hashlib, sys, requests
from nacl.signing import SigningKey

PRIVATE_KEY_B64  = "hBxugNHrSkU5HYGlmKUMSESrFYLiVRv90feGxiiVuuc="
DEPLOYER_ADDRESS = "oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R"
RPC              = "https://devnet.octrascan.io/rpc"
EXPLORER         = "https://devnet.octrascan.io"
AML_DIR          = "/home/nebula/octrashield-dex/contracts/aml"
CONFIG_FILE      = "/home/nebula/octrashield-dex/config/octra-network.json"

seed = base64.b64decode(PRIVATE_KEY_B64)
assert len(seed) == 32
sk = SigningKey(seed)
PUBKEY_B64 = base64.b64encode(sk.verify_key.encode()).decode()

_rpc_id = 0

def rpc_call(method, params):
    global _rpc_id
    _rpc_id += 1
    r = requests.post(RPC, json={"jsonrpc":"2.0","id":_rpc_id,"method":method,"params":params},
                      headers={"Content-Type": "application/json"}, timeout=30)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"RPC [{method}] error: {d['error']}")
    return d.get("result", {})

def format_timestamp(ts):
    """
    Match webcli format_timestamp: nlohmann::json j = ts; return j.dump()
    For a double, nlohmann dumps it with enough precision.
    We need to produce the same float representation Python JSON does.
    """
    import json as _json
    return _json.dumps(ts)

def canonical_json(tx):
    """
    Exact match of webcli lib/tx_builder.hpp canonical_json():
    {"from":"...","to_":"...","amount":"...","nonce":N,"ou":"...","timestamp":T.T,"op_type":"..."}
    Optional: ,"encrypted_data":"..." ,"message":"..."
    Key points:
    - timestamp is a float (not integer-truncated)
    - op_type defaults to "standard" if empty
    """
    op = tx.get("op_type", "") or "standard"
    ts_str = format_timestamp(tx["timestamp"])
    parts = [
        f'"from":"{tx["from"]}"',
        f'"to_":"{tx["to_"]}"',
        f'"amount":"{tx["amount"]}"',
        f'"nonce":{tx["nonce"]}',
        f'"ou":"{tx["ou"]}"',
        f'"timestamp":{ts_str}',
        f'"op_type":"{op}"',
    ]
    if tx.get("encrypted_data"):
        parts.append(f'"encrypted_data":"{tx["encrypted_data"]}"')
    if tx.get("message"):
        parts.append(f'"message":"{tx["message"]}"')
    return "{" + ",".join(parts) + "}"

def sign_tx(tx):
    msg = canonical_json(tx)
    print(f"  [DEBUG] Signing msg (first 120 chars): {msg[:120]}")
    signed = sk.sign(msg.encode("utf-8"))
    return base64.b64encode(signed.signature).decode()

def get_nonce():
    d = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    return int(d.get("nonce", 0)) + 1

def get_fee():
    d = rpc_call("octra_recommendedFee", [])
    return str(d.get("recommended", "1000"))

def compile_aml(source):
    print("  Compiling via octra_compileAml...")
    result = rpc_call("octra_compileAml", [source])
    bc = result.get("bytecode") or result.get("Bytecode") or result.get("data")
    if not bc:
        raise RuntimeError(f"No bytecode in compile result: {result}")
    print(f"  Bytecode length: {len(bc)} chars")
    return bc

def compute_contract_address(bytecode_b64, deployer, nonce):
    try:
        result = rpc_call("octra_computeContractAddress", [bytecode_b64, deployer, str(nonce)])
        addr = result.get("address") or result.get("contract_address")
        if addr:
            return addr
    except Exception as e:
        print(f"  computeContractAddress failed ({e}), falling back to local hash")
    # Fallback: local hash
    raw = base64.b64decode(bytecode_b64 + "==")
    unique = f"{raw.decode('latin-1')}:{deployer}:{nonce}"
    h = hashlib.sha256(unique.encode("latin-1")).digest()
    n = int.from_bytes(h, "big")
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    result = ""
    while n > 0:
        n, r = divmod(n, 58)
        result = alphabet[r] + result
    return "oct" + result[:44]

def deploy_contract(name, bytecode):
    ou = get_fee()
    nonce = get_nonce()
    timestamp = time.time()  # Keep as float!
    contract_addr = compute_contract_address(bytecode, DEPLOYER_ADDRESS, nonce)
    print(f"  Nonce: {nonce} | OU: {ou} | Predicted address: {contract_addr}")
    tx = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_addr,
        "amount": "0",
        "nonce": nonce,
        "ou": ou,
        "timestamp": timestamp,
        "op_type": "deploy",
        "encrypted_data": bytecode,
        "message": "CONTRACT_DEPLOY",
    }
    sig = sign_tx(tx)
    tx_full = {**tx, "signature": sig, "public_key": PUBKEY_B64}
    print("  Submitting deploy tx...")
    result = rpc_call("octra_submit", [tx_full])
    tx_hash = result.get("tx_hash") or result.get("hash") or str(result)
    print(f"  Tx hash: {tx_hash}")
    return contract_addr, tx_hash

def wait_confirm(tx_hash, timeout=90):
    print(f"  Waiting for confirmation (up to {timeout}s)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = rpc_call("octra_transaction", [tx_hash])
            status = r.get("status") or r.get("tx_status") or ""
            if status in ("confirmed", "success", "included"):
                print(f"  Confirmed! Status: {status}")
                return True
            print(f"  Status: {status} ({int(time.time()-start)}s)...")
        except Exception as e:
            print(f"  Polling error: {e}")
        time.sleep(4)
    print("  Timeout — tx may still confirm later")
    return False

def update_config(addresses):
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)
    cfg["contracts"].update(addresses)
    cfg["contracts"]["_note"] = "Deployed to devnet via deploy_fixed.py"
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)
    print("  config/octra-network.json updated")

def deploy_one(label, aml_file):
    print(f"\n{'='*60}")
    print(f"DEPLOYING: {label}  ({aml_file})")
    print(f"{'='*60}")
    with open(f"{AML_DIR}/{aml_file}") as f:
        source = f.read()
    bytecode = compile_aml(source)
    addr, tx_hash = deploy_contract(label, bytecode)
    confirmed = wait_confirm(tx_hash)
    print(f"  Result: {'OK' if confirmed else 'PENDING'} | Address: {addr}")
    return addr, tx_hash, confirmed

def main():
    print(f"\n{'#'*60}")
    print(f"  OctraShield DEX — Full Deploy (Devnet) [FIXED]")
    print(f"  RPC: {RPC}")
    print(f"  Deployer: {DEPLOYER_ADDRESS}")
    print(f"  PubKey: {PUBKEY_B64}")
    print(f"{'#'*60}")

    bal = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    print(f"\nBalance: {bal.get('balance','?')} OCT  |  Nonce: {bal.get('nonce','?')}")

    results = {}

    addr, txh, ok = deploy_one("shield_token", "shield_token.aml")
    results["shieldToken"] = addr
    time.sleep(3)

    addr, txh, ok = deploy_one("ai_engine", "ai_engine.aml")
    results["aiEngine"] = addr
    time.sleep(3)

    addr, txh, ok = deploy_one("factory", "factory.aml")
    results["factory"] = addr
    time.sleep(3)

    addr, txh, ok = deploy_one("pair", "pair.aml")
    results["pair"] = addr
    time.sleep(3)

    addr, txh, ok = deploy_one("router", "router.aml")
    results["router"] = addr

    print(f"\n{'='*60}")
    print("Updating config/octra-network.json with deployed addresses...")
    update_config(results)

    print(f"\n{'#'*60}")
    print("  DEPLOYMENT COMPLETE")
    print(f"{'#'*60}")
    for k, v in results.items():
        print(f"  {k:15s}: {v}")
    print(f"\n  Explorer: {EXPLORER}")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
