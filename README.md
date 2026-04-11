# OctraShield DEX

**Privacy-focused Decentralized Exchange on [Octra Network](https://devnet.octrascan.io)**

OctraShield DEX uses Homomorphic FHE Encryption (HFHE) for private swap amounts and the OCS01 transaction standard on Octra's non-EVM blockchain.

---

## Deployed Contracts (Octra Devnet)

| Contract | Address | Explorer |
|----------|---------|---------|
| Shield Token | `octKLfoHEACuWXe3MTW5QiiFKcwYoma1iCvWFSDboErXiG2` | [View](https://devnet.octrascan.io/address/octKLfoHEACuWXe3MTW5QiiFKcwYoma1iCvWFSDboErXiG2) |
| AI Engine | `oct8YBmmS7o2rM5UxmKEsWS2nir9j8tB22u7iY8twkjDESW` | [View](https://devnet.octrascan.io/address/oct8YBmmS7o2rM5UxmKEsWS2nir9j8tB22u7iY8twkjDESW) |
| Factory | `octyVu2gYWCCqvVd8binnhCegbmkb5mxDDFJVLasKqFnuhE` | [View](https://devnet.octrascan.io/address/octyVu2gYWCCqvVd8binnhCegbmkb5mxDDFJVLasKqFnuhE) |
| Pair (AMM) | `oct5uSwzUdgWoVUadZuwA5MHqwmAjtdDYYpVbfWSLUXknhW` | [View](https://devnet.octrascan.io/address/oct5uSwzUdgWoVUadZuwA5MHqwmAjtdDYYpVbfWSLUXknhW) |
| Router | `octEQqBhqDno7oYPzc5pcbitmVxkNKE1XWaZJcztgooSy1W` | [View](https://devnet.octrascan.io/address/octEQqBhqDno7oYPzc5pcbitmVxkNKE1XWaZJcztgooSy1W) |

- **Network:** Octra Devnet
- **Explorer:** https://devnet.octrascan.io
- **Deployer Wallet:** `oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R`
- **Deploy Nonces:** 65 (shieldToken), 66 (aiEngine), 67 (factory), 68 (pair), 69 (router)
- **Deployed:** 2026-04-11

---

## Project Structure

```
octrashield-dex/
├── contracts/aml/          # AML smart contracts (Octra Markup Language)
│   ├── shield_token.aml    # Privacy token (mint/burn)
│   ├── ai_engine.aml       # AI-powered dynamic fee engine
│   ├── factory.aml         # Pool registry & fee tiers
│   ├── pair.aml            # AMM constant-product pair (x*y=k)
│   └── router.aml          # Swap routing & liquidity management
├── sdk/                    # TypeScript SDK (@octrashield/dex-sdk)
├── app/                    # React frontend (@octrashield/dex-app)
├── config/
│   └── octra-network.json  # Network config & deployed addresses
└── deploy.py               # Python deploy script (Ed25519 signing)
```

## Technology Stack

- **Smart Contracts:** AML (Octra Markup Language) — NOT Solidity/EVM
- **Signing:** Ed25519 (not ECDSA)
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS
- **SDK:** TypeScript with @noble/ed25519 and HFHE encryption
- **Package Manager:** pnpm v9 (monorepo workspace)

---

## Getting Started

### Prerequisites

- Python 3.9+ with `pyNaCl` and `requests`
- Node.js 18+ and pnpm 9+
- Funded Octra devnet wallet

### Deploy Smart Contracts

```bash
# Install Python dependencies
pip install pyNaCl requests

# Edit deploy.py: set PRIVATE_KEY_B64 and DEPLOYER_ADDRESS
python3 deploy.py
```

The deploy script will:
1. Check wallet balance and current nonce
2. Compile each AML contract via the Octra RPC
3. Sign and submit deploy transactions (Ed25519)
4. Wait for on-chain confirmation
5. Update `config/octra-network.json` with deployed addresses

### Build & Run Frontend

```bash
# Install all dependencies
pnpm install

# Build SDK first (app depends on it)
cd sdk && pnpm build

# Start dev server
cd ../app && pnpm dev
# Opens at http://localhost:5173
```

### Production Build

```bash
cd app
pnpm build   # Output: app/dist/
```

---

## Features

- **Privacy Swaps:** Encrypted swap amounts via HFHE
- **AI Fee Engine:** Dynamic fee adjustment based on market volatility
- **OCS01 Standard:** Octra's native transaction format
- **AMM Liquidity:** Constant-product formula (x*y=k) pools
- **React Hooks:** `useSwap`, `usePool`, `useLiquidity`, `useAI`, `useToken`

---

## Network Configuration

```json
{
  "name": "Octra Devnet",
  "rpcUrl": "https://devnet.octrascan.io/rpc",
  "explorerUrl": "https://devnet.octrascan.io",
  "chainType": "non-evm"
}
```

---

## License

MIT — see [LICENSE](./LICENSE)
