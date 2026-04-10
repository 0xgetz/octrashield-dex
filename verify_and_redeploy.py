"""
OctraShield DEX - Verify existing deployments & re-deploy any failed contracts
"""
import json, base64, time, requests, sys
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
                      headers={"Content-Type":"application/json"}, timeout=30)
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
    return float(d.get("balance", 0)), int(d.get("nonce", 0))

def check_tx(tx_hash):
    """Check if a transaction is confirmed."""
    try:
        r = rpc_call("octra_transaction", [tx_hash])
        status = r.get("status") or r.get("tx_status") or ""
        return status, r
    except Exception as e:
        return f"error:{e}", {}

def check_contract(address):
    """Check if a contract is deployed at address."""
    try:
        r = rpc_call("octra_getContract", [address])
        if r and (r.get("bytecode") or r.get("code") or r.get("state") is not None):
            return True, r
        return False, r
    except Exception as e:
        return False, str(e)

def deploy_contract(name, aml_file):
    print(f"\n{'='*55}")
    print(f"  DEPLOYING: {name}")
    print(f"{'='*55}")

    with open(f"{AML_DIR}/{aml_file}") as f:
        source = f.read()

    print("  Compiling AML...")
    result = rpc_call("octra_compileAml", [source])
    bytecode = result.get("bytecode") or result.get("Bytecode") or result.get("data")
    if not bytecode:
        raise RuntimeError(f"No bytecode in compile result: {result}")
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
        if not contract_addr:
            raise ValueError("No address returned")
    except Exception as e:
        print(f"  computeContractAddress failed: {e}, using deployer as to_")
        contract_addr = DEPLOYER_ADDRESS

    print(f"  Nonce: {nonce} | OU: {ou}")
    print(f"  Contract addr: {contract_addr}")

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

    print("  Submitting deploy transaction...")
    result = rpc_call("octra_submit", [tx_full])
    tx_hash = result.get("tx_hash") or result.get("hash") or str(result)
    print(f"  TX Hash: {tx_hash}")

    # Wait for confirmation via nonce poll
    print(f"  Waiting for confirmation (nonce {nonce})...")
    start = time.time()
    confirmed = False
    for _ in range(30):  # up to 90s
        time.sleep(3)
        _, cur_nonce = get_balance_info()
        if cur_nonce >= nonce:
            confirmed = True
            elapsed = int(time.time() - start)
            print(f"  Confirmed in {elapsed}s!")
            break
        print(f"  Waiting... current nonce={cur_nonce} ({int(time.time()-start)}s)")

    if not confirmed:
        print("  WARNING: Confirmation timeout, checking tx status...")
        status, _ = check_tx(tx_hash)
        print(f"  TX status: {status}")

    return contract_addr, tx_hash, confirmed

def main():
    print(f"\n{'#'*60}")
    print(f"  OctraShield DEX - Verify & Re-Deploy")
    print(f"  RPC   : {RPC}")
    print(f"  Wallet: {DEPLOYER_ADDRESS}")
    print(f"  Pubkey: {PUBKEY_B64}")
    print(f"{'#'*60}")

    # Check wallet balance
    bal, nonce = get_balance_info()
    print(f"\nWallet Balance: {bal} OCT  |  Current Nonce: {nonce}")

    if bal < 10:
        print(f"WARNING: Low balance ({bal} OCT). Deployment may fail.")

    # Load existing config
    with open(CONFIG_FILE) as f:
        cfg = json.load(f)

    existing = cfg.get("contracts", {})
    tx_hashes = existing.get("_txHashes", {})

    print(f"\n{'='*60}")
    print("  VERIFYING EXISTING DEPLOYMENTS")
    print(f"{'='*60}")

    contracts_to_deploy = [
        ("shieldToken", "shield_token.aml"),
        ("aiEngine",    "ai_engine.aml"),
        ("factory",     "factory.aml"),
        ("pair",        "pair.aml"),
        ("router",      "router.aml"),
    ]

    needs_redeploy = []
    verified_ok = []

    for label, aml_file in contracts_to_deploy:
        addr = existing.get(label)
        tx_hash = tx_hashes.get(label)
        print(f"\n  [{label}]")
        print(f"    Address : {addr}")
        print(f"    TX Hash : {tx_hash}")

        if not addr:
            print(f"    Status  : NOT DEPLOYED - will deploy")
            needs_redeploy.append((label, aml_file))
            continue

        # Check tx status
        if tx_hash:
            status, tx_data = check_tx(tx_hash)
            print(f"    TX Status: {status}")
            if status in ("confirmed", "success", "included"):
                print(f"    -> OK (tx confirmed)")
                verified_ok.append(label)
                continue
        
        # Check contract state
        deployed, contract_data = check_contract(addr)
        if deployed:
            print(f"    -> OK (contract exists on-chain)")
            verified_ok.append(label)
        else:
            print(f"    -> FAILED or MISSING - will re-deploy")
            print(f"    Contract data: {str(contract_data)[:100]}")
            needs_redeploy.append((label, aml_file))

    print(f"\n{'='*60}")
    print(f"  Verified OK  : {len(verified_ok)} contracts")
    print(f"  Need Deploy  : {len(needs_redeploy)} contracts")
    print(f"{'='*60}")

    if not needs_redeploy:
        print("\nALL CONTRACTS ALREADY DEPLOYED AND CONFIRMED!")
        print("\nFinal Contract Addresses:")
        for label, _ in contracts_to_deploy:
            addr = existing.get(label, "N/A")
            print(f"  {label:15s}: {addr}")
            print(f"               {EXPLORER}/address/{addr}")
        return True

    # Re-deploy missing/failed contracts
    print(f"\nDeploying {len(needs_redeploy)} contract(s)...")
    new_results = {}
    all_ok = True

    for label, aml_file in needs_redeploy:
        try:
            addr, tx_hash, confirmed = deploy_contract(label, aml_file)
            new_results[label] = {"address": addr, "tx_hash": tx_hash, "confirmed": confirmed}
            cfg["contracts"][label] = addr
            if "_txHashes" not in cfg["contracts"]:
                cfg["contracts"]["_txHashes"] = {}
            cfg["contracts"]["_txHashes"][label] = tx_hash
            if not confirmed:
                all_ok = False
        except Exception as e:
            print(f"\n  ERROR deploying {label}: {e}")
            new_results[label] = {"error": str(e)}
            all_ok = False
        time.sleep(2)

    # Update config
    cfg["contracts"]["_note"] = "Deployed/verified via verify_and_redeploy.py"
    cfg["contracts"]["_deployer"] = DEPLOYER_ADDRESS
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print(f"\nConfig updated: {CONFIG_FILE}")

    # Final summary
    print(f"\n{'#'*60}")
    print("  FINAL DEPLOYMENT SUMMARY")
    print(f"{'#'*60}")
    for label, _ in contracts_to_deploy:
        addr = cfg["contracts"].get(label, "N/A")
        status_str = "OK (pre-existing)" if label in verified_ok else \
                     ("OK (newly deployed)" if label in new_results and "error" not in new_results.get(label, {}) else "FAILED")
        print(f"  {label:15s}: {addr}")
        print(f"  {'':15s}  Status: {status_str}")
        print(f"  {'':15s}  {EXPLORER}/address/{addr}")
    
    return all_ok

if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
