"""
OctraShield DEX - Deploy Script (Fixed)
Root cause of contract_address_mismatch: 
  - Old code used confirmed_nonce + 1 for TX, but pending_nonce may differ
  - octra_computeContractAddress must receive the SAME nonce used in the TX
  - The pair contract constructor requires fee >= 1 (fixed in pair.aml)

Fix:
  1. Always fetch pending_nonce from chain and use pending_nonce + 1 for TX
  2. Pass that SAME nonce to octra_computeContractAddress
  3. Wait and verify each TX is not rejected before proceeding
"""
import sys, json, base64, time, hashlib, gzip, io

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

def get_next_nonce():
    """FIX: Use pending_nonce + 1 (not confirmed_nonce + 1)"""
    d = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    pending = int(d.get("pending_nonce", d.get("nonce", 0)))
    return pending + 1

def compile_aml(source):
    result = rpc_call("octra_compileAml", [source])
    bc = result.get("bytecode") or result.get("Bytecode") or result.get("data")
    if not bc:
        raise RuntimeError(f"No bytecode: {result}")
    return bc

def compute_contract_address(bytecode_b64, deployer, nonce):
    """FIX: Always pass the actual TX nonce to ensure address matches"""
    result = rpc_call("octra_computeContractAddress", [bytecode_b64, deployer, str(nonce)])
    addr = result.get("address") or result.get("contract_address")
    if addr:
        return addr
    raise RuntimeError(f"Could not compute contract address: {result}")

def wait_confirm(tx_hash, timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = rpc_call("octra_transaction", [tx_hash])
            status = r.get("status") or r.get("tx_status") or ""
            error = r.get("error", {})
            if status in ("confirmed", "success", "included"):
                print(f"  Confirmed!")
                return True, status, None
            if status == "rejected":
                print(f"  REJECTED: {error}")
                return False, "rejected", error
            print(f"  Status: {status!r} ({int(time.time()-start)}s)...")
        except Exception as e:
            print(f"  Poll error: {e}")
        time.sleep(4)
    print("  Not confirmed in timeout -- may still be processing")
    return False, "pending", None

def deploy_one(label, aml_file):
    print(f"\n=== DEPLOYING: {label} ===")
    with open(f"{AML_DIR}/{aml_file}") as f:
        source = f.read()
    bytecode = compile_aml(source)
    print(f"  Bytecode: {len(bytecode)} chars")
    
    # FIX: Get fresh pending_nonce for each deploy and use it consistently
    nonce = get_next_nonce()
    timestamp = time.time()
    contract_addr = compute_contract_address(bytecode, DEPLOYER_ADDRESS, nonce)
    print(f"  Nonce: {nonce} | Addr: {contract_addr}")
    
    tx = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_addr,
        "amount": "0",
        "nonce": nonce,
        "ou": "1000",
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
    
    # FIX: Verify TX is not rejected before proceeding
    confirmed, status, error = wait_confirm(tx_hash, timeout=60)
    if status == "rejected":
        raise RuntimeError(f"Deploy of {label} rejected: {error}")
    
    print(f"  Done: status={status} addr={contract_addr}")
    return contract_addr, tx_hash, confirmed

def main():
    print(f"\n{'#'*60}")
    print(f"  OctraShield DEX -- Full Deploy (Devnet)")
    print(f"  RPC: {RPC}")
    print(f"  Deployer: {DEPLOYER_ADDRESS}")
    print(f"{'#'*60}")

    bal = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    nonce = int(bal.get("nonce", 0))
    pending = int(bal.get("pending_nonce", nonce))
    print(f"\nBalance: {bal.get('balance','?')} OCT  |  Nonce: {nonce}  |  Pending: {pending}")
    print(f"Next TX nonce will be: {pending + 1}")

    contracts = [
        ("shieldToken", "shield_token.aml"),
        ("aiEngine",    "ai_engine.aml"),
        ("factory",     "factory.aml"),
        ("pair",        "pair.aml"),   # pair.aml has fee default fix: if fee==0 set fee=30
        ("router",      "router.aml"),
    ]

    results = {}
    tx_hashes = {}

    for key, aml_file in contracts:
        addr, txh, ok = deploy_one(key, aml_file)
        results[key] = addr
        tx_hashes[key] = txh
        time.sleep(3)  # Brief pause between deploys

    # Update config
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)
    cfg["contracts"].update(results)
    cfg["contracts"]["_deployer"] = DEPLOYER_ADDRESS
    cfg["contracts"]["_txHashes"] = tx_hashes
    cfg["contracts"]["_deployedAt"] = time.strftime("%Y-%m-%d")
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)
    print("\nconfig/octra-network.json updated")

    print(f"\n{'#'*60}")
    print("  DEPLOYMENT COMPLETE")
    print(f"{'#'*60}")
    for k, v in results.items():
        print(f"  {k:15s}: {v}")
        print(f"  {'':15s}  {EXPLORER}/tx/{tx_hashes[k]}")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
