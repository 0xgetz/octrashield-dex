"""
OctraShield DEX - Deploy Script
Uses urllib with proper headers and gzip handling. No external deps except nacl.
"""
import sys, json, base64, time, hashlib, gzip, io

# nacl is available in python3.14 site-packages
sys.path.insert(0, "/usr/local/lib/python3.14/site-packages")
from nacl.signing import SigningKey
from urllib.request import urlopen, Request
from urllib.error import HTTPError

PRIVATE_KEY_B64  = "hBxugNHrSkU5HYGlmKUMSESrFYLiVRv90feGxiiVuuc="
DEPLOYER_ADDRESS = "oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R"
RPC              = "https://devnet.octrascan.io/rpc"
EXPLORER         = "https://devnet.octrascan.io"
AML_DIR          = "/home/nebula/octrashield-dex/contracts/aml"
CONFIG_FILE      = "/home/nebula/octrashield-dex/config/octra-network.json"

seed = base64.b64decode(PRIVATE_KEY_B64)
sk = SigningKey(seed)
PUBKEY_B64 = base64.b64encode(sk.verify_key.encode()).decode()

_rpc_id = 0

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "python-requests/2.31.0",
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

def http_post(url, payload_bytes):
    req = Request(url, data=payload_bytes, headers=HEADERS, method="POST")
    with urlopen(req, timeout=25) as resp:
        raw = resp.read()
        # Handle gzip
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8"))

def rpc_call(method, params):
    global _rpc_id
    _rpc_id += 1
    payload = json.dumps({"jsonrpc":"2.0","id":_rpc_id,"method":method,"params":params}).encode()
    d = http_post(RPC, payload)
    if "error" in d:
        raise RuntimeError(f"RPC [{method}] error: {d['error']}")
    return d.get("result", {})

def canonical_json(tx):
    op = tx.get("op_type", "") or "standard"
    ts_str = json.dumps(tx["timestamp"])
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
    signed = sk.sign(msg.encode("utf-8"))
    return base64.b64encode(signed.signature).decode()

def get_nonce():
    d = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    return int(d.get("nonce", 0)) + 1

def get_fee():
    d = rpc_call("octra_recommendedFee", [])
    return str(d.get("recommended", "1000"))

def compile_aml(source):
    result = rpc_call("octra_compileAml", [source])
    bc = result.get("bytecode") or result.get("Bytecode") or result.get("data")
    if not bc:
        raise RuntimeError(f"No bytecode: {result}")
    return bc

def compute_contract_address(bytecode_b64, deployer, nonce):
    try:
        result = rpc_call("octra_computeContractAddress", [bytecode_b64, deployer, str(nonce)])
        addr = result.get("address") or result.get("contract_address")
        if addr:
            return addr
    except Exception as e:
        print(f"  computeContractAddress failed ({e}), using local hash fallback")
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

def wait_confirm(tx_hash, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = rpc_call("octra_transaction", [tx_hash])
            status = r.get("status") or r.get("tx_status") or ""
            if status in ("confirmed", "success", "included"):
                print(f"  Confirmed! ({status})")
                return True, status
            print(f"  Status: {status!r} ({int(time.time()-start)}s)...")
        except Exception as e:
            print(f"  Poll error: {e}")
        time.sleep(4)
    print("  Not confirmed in 30s -- tx submitted, likely still confirming")
    return False, "pending"

def deploy_one(label, aml_file):
    print(f"\n=== DEPLOYING: {label} ===")
    with open(f"{AML_DIR}/{aml_file}") as f:
        source = f.read()
    bytecode = compile_aml(source)
    print(f"  Bytecode: {len(bytecode)} chars")
    ou = get_fee()
    nonce = get_nonce()
    timestamp = time.time()
    contract_addr = compute_contract_address(bytecode, DEPLOYER_ADDRESS, nonce)
    print(f"  Nonce: {nonce} | OU: {ou} | Addr: {contract_addr}")
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
    result = rpc_call("octra_submit", [tx_full])
    tx_hash = result.get("tx_hash") or result.get("hash") or str(result)
    print(f"  Tx hash: {tx_hash}")
    confirmed, status = wait_confirm(tx_hash, timeout=30)
    print(f"  Done: confirmed={confirmed} addr={contract_addr}")
    return contract_addr, tx_hash, confirmed

def main():
    print(f"\n{'#'*60}")
    print(f"  OctraShield DEX -- Full Deploy (Devnet)")
    print(f"  RPC: {RPC}")
    print(f"  Deployer: {DEPLOYER_ADDRESS}")
    print(f"{'#'*60}")

    bal = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    print(f"\nBalance: {bal.get('balance','?')} OCT  |  Nonce: {bal.get('nonce','?')}")

    contracts = [
        ("shieldToken", "shield_token.aml"),
        ("aiEngine",    "ai_engine.aml"),
        ("factory",     "factory.aml"),
        ("pair",        "pair.aml"),
        ("router",      "router.aml"),
    ]

    results = {}
    tx_hashes = {}

    for key, aml_file in contracts:
        addr, txh, ok = deploy_one(key, aml_file)
        results[key] = addr
        tx_hashes[key] = txh
        time.sleep(2)

    # Update config
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)
    cfg["contracts"].update(results)
    cfg["contracts"]["_note"] = "Deployed to devnet via deploy_fast.py"
    cfg["contracts"]["_deployer"] = DEPLOYER_ADDRESS
    cfg["contracts"]["_txHashes"] = tx_hashes
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)
    print("\nconfig/octra-network.json updated")

    print(f"\n{'#'*60}")
    print("  DEPLOYMENT COMPLETE")
    print(f"{'#'*60}")
    for k, v in results.items():
        print(f"  {k:15s}: {v}")
    print(f"\nExplorer: {EXPLORER}")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
