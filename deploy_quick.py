"""
OctraShield DEX - Quick Deploy Script (one contract at a time, fast nonce poll)
"""
import os, json, base64, time, requests, sys
from nacl.signing import SigningKey

PRIVATE_KEY_B64  = "hBxugNHrSkU5HYGlmKUMSESrFYLiVRv90feGxiiVuuc="
DEPLOYER_ADDRESS = "oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R"
RPC              = "https://devnet.octrascan.io/rpc"
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
                      headers={"Content-Type":"application/json"}, timeout=20)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"RPC [{method}] error: {d['error']}")
    return d.get("result", {})

def canonical_json(tx):
    op = tx.get("op_type","") or "standard"
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

def get_balance_info():
    d = rpc_call("octra_balance", [DEPLOYER_ADDRESS])
    return float(d["balance"]), int(d["nonce"])

def wait_for_nonce(expected_nonce, timeout=60):
    start = time.time()
    while time.time() - start < timeout:
        _, nonce = get_balance_info()
        if nonce >= expected_nonce:
            return True
        time.sleep(3)
    return False

def deploy_contract(name, aml_file):
    print(f"\n{'='*50}")
    print(f"Deploying: {name}")

    with open(f"{AML_DIR}/{aml_file}") as f:
        source = f.read()

    print("  Compiling...")
    result = rpc_call("octra_compileAml", [source])
    bytecode = result.get("bytecode") or result.get("Bytecode")
    if not bytecode:
        raise RuntimeError(f"No bytecode: {result}")
    print(f"  Bytecode: {len(bytecode)} chars")

    fee_result = rpc_call("octra_recommendedFee", [])
    ou = str(fee_result.get("recommended", "1000"))

    bal, current_nonce = get_balance_info()
    nonce = current_nonce + 1
    timestamp = time.time()

    # Compute contract address
    try:
        addr_result = rpc_call("octra_computeContractAddress", [bytecode, DEPLOYER_ADDRESS, str(nonce)])
        contract_addr = addr_result.get("address") or addr_result.get("contract_address")
    except Exception as e:
        print(f"  computeContractAddress failed: {e}, using deployer as to_")
        contract_addr = DEPLOYER_ADDRESS

    print(f"  Nonce: {nonce} | OU: {ou} | Contract: {contract_addr}")

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

    print("  Submitting...")
    result = rpc_call("octra_submit", [tx_full])
    tx_hash = result.get("tx_hash") or result.get("hash") or str(result)
    print(f"  Submitted! Hash: {tx_hash}")

    print(f"  Waiting for nonce {nonce} to confirm...")
    confirmed = wait_for_nonce(nonce, timeout=60)
    if confirmed:
        print(f"  Confirmed!")
    else:
        print(f"  Timeout - may still confirm")

    return contract_addr, tx_hash

def main():
    contracts = [
        ("shieldToken", "shield_token.aml"),
        ("aiEngine",    "ai_engine.aml"),
        ("factory",     "factory.aml"),
        ("pair",        "pair.aml"),
        ("router",      "router.aml"),
    ]

    # Only deploy the contract specified via argument, or all if none
    target = sys.argv[1] if len(sys.argv) > 1 else "all"

    bal, nonce = get_balance_info()
    print(f"Wallet: {DEPLOYER_ADDRESS}")
    print(f"Balance: {bal} OCT | Nonce: {nonce}")
    print(f"PubKey: {PUBKEY_B64}")

    results = {}
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)

    for label, aml_file in contracts:
        if target != "all" and target != label:
            continue
        addr, tx_hash = deploy_contract(label, aml_file)
        results[label] = {"address": addr, "tx_hash": tx_hash}
        cfg["contracts"][label] = addr
        cfg["contracts"].setdefault("_txHashes", {})[label] = tx_hash

    # Update config
    if results:
        cfg["contracts"]["_note"] = "Deployed to devnet via deploy_quick.py"
        cfg["contracts"]["_deployer"] = DEPLOYER_ADDRESS
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
            f.write("\n")
        print(f"\nConfig updated: {CONFIG_FILE}")

    print(f"\n{'='*50}")
    print("DEPLOYMENT RESULTS:")
    for label, info in results.items():
        print(f"  {label}: {info['address']}")
        print(f"    tx: {info['tx_hash']}")

if __name__ == "__main__":
    main()
