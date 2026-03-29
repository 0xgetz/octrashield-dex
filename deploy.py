import os
import json
import base64
import requests
import time
import subprocess
import sys
import hashlib
from nacl.signing import SigningKey
import nacl.bindings

# Load private key from environment variable
PRIVATE_KEY_B64 = os.getenv("PRIVATE_KEY_B64")
if not PRIVATE_KEY_B64:
    raise EnvironmentError(
        "PRIVATE_KEY_B64 environment variable is not set. "
        "Please set it in your .env file or export it before running this script."
    )
DEPLOYER_ADDRESS = "oct25CVMgbie4Cu6zpAgxpiHy1odbf8GszFxrSqSdBMknx6"
API_URL = "http://165.227.225.79:8080"
FAUCET_URL = "https://faucet-devnet.octra.com"
COMPILER_PATH = "./compiler_asm_64"

# Decode the private key seed (32 bytes)
private_key_seed = base64.b64decode(PRIVATE_KEY_B64)
assert len(private_key_seed) == 32, f"Private key must be 32 bytes, got {len(private_key_seed)}"

# Expand the seed to a full Ed25519 keypair using libsodium
# Create a SigningKey directly from the 32-byte seed
# PyNaCl will internally expand it to 64 bytes as needed
sk = SigningKey(private_key_seed)

def canonical_json(tx_data):
    """
    Build canonical JSON matching the C++ implementation.
    Order: from, to_, amount, nonce, ou, timestamp, op_type, [encrypted_data], [message]
    Numeric values (nonce, timestamp) are not quoted.
    """
    parts = []
    parts.append(f'\"from\":\"{tx_data["from"]}\"')
    parts.append(f'\"to_\":\"{tx_data["to_"]}\"')
    parts.append(f'\"amount\":\"{tx_data["amount"]}\"')
    parts.append(f'\"nonce\":{tx_data["nonce"]}')
    parts.append(f'\"ou\":\"{tx_data["ou"]}\"')
    # Timestamp as number (not quoted)
    ts = tx_data["timestamp"]
    # Format timestamp as JSON number (avoid scientific notation for large values)
    if ts == int(ts):
        ts_str = str(int(ts))
    else:
        ts_str = repr(ts)
    parts.append(f'\"timestamp\":{ts_str}')
    parts.append(f'\"op_type\":\"{tx_data["op_type"]}\"')
    if "encrypted_data" in tx_data and tx_data["encrypted_data"]:
        parts.append(f'\"encrypted_data\":\"{tx_data["encrypted_data"]}\"')
    if "message" in tx_data and tx_data["message"]:
        parts.append(f'\"message\":\"{tx_data["message"]}\"')
    return "{" + ",".join(parts) + "}"

def sign_transaction(tx_data):
    """Sign the transaction using the canonical JSON format."""
    msg = canonical_json(tx_data)
    # Sign using the 64-byte expanded secret key
    # nacl.signing.SigningKey.sign expects the message bytes
    signed = sk.sign(msg.encode('utf-8'))
    signature_b64 = base64.b64encode(signed.signature).decode()
    public_key_b64 = base64.b64encode(sk.verify_key.encode()).decode()
    return signature_b64, public_key_b64

def compile_contract(contract_file):
    print(f"compiling {contract_file}...")
    
    try:
        result = subprocess.run(
            [COMPILER_PATH, "compile", contract_file],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"compilation error: {result.stderr}")
            return None
            
        compiled = json.loads(result.stdout)
        print(f"bytecode: {compiled['bytecode'][:64]}...")
        print(f"size: {compiled['size']} bytes")
        print(f"opcodes: {compiled['opcodes']}")
        print(f"methods: {', '.join(compiled['methods'])}")
        
        return compiled['bytecode']
        
    except Exception as e:
        print(f"error: {e}")
        return None

def check_balance_and_faucet():
    """Check balance and suggest faucet if low."""
    try:
        r = requests.get(f"{API_URL}/balance/{DEPLOYER_ADDRESS}", timeout=5)
        if r.status_code != 200:
            print(f"error getting balance: {r.text}")
            return False
            
        data = r.json()
        balance_raw = int(data.get("balance_raw", "0"))
        balance_oct = balance_raw / 1_000_000_000
        
        print(f"current balance: {balance_oct:.4f} OCT")
        
        if balance_raw < 500_000_000:
            print(f"\nWARNING: Insufficient balance for deployment (need 0.5 OCT)")
            print(f"Get test tokens from faucet: {FAUCET_URL}")
            print(f"(10 OCT every 24 hours)")
            return False
            
        return True
        
    except Exception as e:
        print(f"error checking balance: {e}")
        return False

def get_nonce():
    try:
        r = requests.get(f"{API_URL}/balance/{DEPLOYER_ADDRESS}", timeout=5)
        if r.status_code != 200:
            print(f"error getting balance: {r.text}")
            return None
            
        data = r.json()
        balance_raw = int(data.get("balance_raw", "0"))
        
        if balance_raw < 500_000_000:
            print(f"insufficient balance: {balance_raw} < 500000000")
            print(f"get test tokens from: {FAUCET_URL}")
            return None
            
        return data["nonce"] + 1
        
    except Exception as e:
        print(f"error: {e}")
        return None

def calculate_contract_address(bytecode_b64, deployer, nonce):
    bytecode_raw = base64.b64decode(bytecode_b64)
    unique_data = f"{bytecode_raw.decode('latin-1')}:{deployer}:{nonce}"
    hash_bytes = hashlib.sha256(unique_data.encode('latin-1')).digest()
    
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(hash_bytes, 'big')
    base58_str = ""
    while n > 0:
        n, r = divmod(n, 58)
        base58_str = alphabet[r] + base58_str
    
    base58_part = base58_str[:44]
    if len(base58_part) < 44:
        base58_part = base58_part.ljust(44, '1')
    
    return "oct" + base58_part

def deploy_contract(bytecode, nonce):
    timestamp = time.time()
    
    contract_address = calculate_contract_address(bytecode, DEPLOYER_ADDRESS, nonce)
    
    # Build transaction data for signing (without signature/public_key)
    tx_data = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_address,
        "amount": "0",
        "nonce": nonce,
        "ou": "500",
        "timestamp": timestamp,
        "op_type": "deploy",
        "encrypted_data": bytecode,
        "message": "CONTRACT_DEPLOY"
    }
    
    # Sign using canonical JSON
    signature_b64, public_key_b64 = sign_transaction(tx_data)
    
    # Build final transaction payload
    tx = {
        "from": DEPLOYER_ADDRESS,
        "to_": contract_address,
        "amount": "0",
        "nonce": nonce,
        "ou": "500",
        "timestamp": timestamp,
        "signature": signature_b64,
        "public_key": public_key_b64,
        "message": "CONTRACT_DEPLOY",
        "op_type": "deploy",
        "encrypted_data": bytecode
    }
    
    print(f"sending deploy tx...")
    print(f"contract addr: {contract_address}")
    
    try:
        resp = requests.post(f"{API_URL}/send-tx", json=tx, timeout=10)
        
        if resp.status_code == 200:
            result = resp.json()
            tx_hash = result.get('tx_hash')
            print(f"tx hash: {tx_hash}")
            print(f"status: pending")
            return contract_address, tx_hash
        else:
            print(f"error: {resp.status_code}")
            print(f"response: {resp.text}")
            return None, None
            
    except Exception as e:
        print(f"exception: {e}")
        return None, None

def wait_for_confirmation(tx_hash):
    print(f"waiting for confirmation...")
    
    start_time = time.time()
    
    while time.time() - start_time < 120:
        try:
            resp = requests.get(f"{API_URL}/tx/{tx_hash}", timeout=5)
            
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "unknown")
                
                if status == "confirmed":
                    epoch = data.get("epoch", "?")
                    print(f"confirmed in epoch {epoch}")
                    return True
                    
        except:
            pass
            
        time.sleep(5)
    
    print(f"timeout waiting for confirmation")
    return False

def main():
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <contract.json>")
        sys.exit(1)
    
    contract_file = sys.argv[1]
    
    # Check balance first
    if not check_balance_and_faucet():
        print("\nPlease fund your address and try again.")
        sys.exit(1)
    
    bytecode = compile_contract(contract_file)
    if not bytecode:
        sys.exit(1)
    
    nonce = get_nonce()
    if not nonce:
        sys.exit(1)
    
    contract_address, tx_hash = deploy_contract(bytecode, nonce)
    if not contract_address:
        sys.exit(1)
    
    if wait_for_confirmation(tx_hash):
        print(f"contract deployed at: {contract_address}")
    else:
        print(f"transaction still pending: {tx_hash}")

if __name__ == "__main__":
    main()
