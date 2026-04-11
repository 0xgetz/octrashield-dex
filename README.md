# OctraShield DEX

**Privacy-focused Decentralized Exchange on [Octra Network](https://devnet.octrascan.io)**

OctraShield DEX uses Homomorphic FHE Encryption (HFHE) for private swap amounts and the OCS01 transaction standard on Octra's non-EVM blockchain.

---

## Deployed Contracts (Octra Devnet)

| Contract | Address | Explorer |
|----------|---------|---------|
| Shield Token | `oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM` | [View](https://devnet.octrascan.io/address/oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM) |
| AI Engine | `oct3AJbKUEfSnDvzL8UVtQwzSEH53UMXuEiCSX3m3xkxvfw` | [View](https://devnet.octrascan.io/address/oct3AJbKUEfSnDvzL8UVtQwzSEH53UMXuEiCSX3m3xkxvfw) |
| Factory | `octHuhyCawJ1gpENz11BXiLuhoBt8L4RBVwAw1tdyDpGg1D` | [View](https://devnet.octrascan.io/address/octHuhyCawJ1gpENz11BXiLuhoBt8L4RBVwAw1tdyDpGg1D) |
| Pair (AMM) | `octMNoNQQfc3SjHiS5grPC2faYC1hAf8Lw3gU8c6VV6B9UG` | [View](https://devnet.octrascan.io/address/octMNoNQQfc3SjHiS5grPC2faYC1hAf8Lw3gU8c6VV6B9UG) |
| Router | `oct4dqgWDhkX1cNtYCbWMrGbdPK4keKqkCzpdTVG695zmz8` | [View](https://devnet.octrascan.io/address/oct4dqgWDhkX1cNtYCbWMrGbdPK4keKqkCzpdTVG695zmz8) |

- **Network:** Octra Devnet
- **Explorer:** https://devnet.octrascan.io
- **Deployer Wallet:** `oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R`
- **Deploy Nonces:** 28 (shieldToken), 29 (aiEngine), 30 (factory), 101 (pair), 32 (router)
- **Deployed:** 2026-04-11
- **Deploy TX Hashes:**
  - shieldToken: [c274b8ab1c0f0f10...](https://devnet.octrascan.io/tx/c274b8ab1c0f0f1076ca517f247754ad1157433098775c9e1e724a6e77a9cba4)
  - aiEngine: [2ac1eec0e9309031...](https://devnet.octrascan.io/tx/2ac1eec0e9309031e61159424f01e24290bfffa434aa1671dbefdab81fa9b82c)
  - factory: [f6d3de7f79ed951c...](https://devnet.octrascan.io/tx/f6d3de7f79ed951cd24eb7c810899aa416b26c5a831b77845dca98a8fa97eedb)
  - pair: [c514a6ce9a88f736...](https://devnet.octrascan.io/tx/c514a6ce9a88f736ebc4489129a1fd1682015049d97f464f37e0a13d92bc87e1)
  - router: [c3144e5e51576d23...](https://devnet.octrascan.io/tx/c3144e5e51576d23406142995564d2a996b6e3aedd738034b5859cc485a28dd6)
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
