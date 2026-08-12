# OctraShield DEX 🛡️✨

<div align="center">

**Privacy-Focused Decentralized Exchange & AI-Powered AMM Protocol on Octra Network**

[![Network](https://img.shields.io/badge/Network-Octra%20Devnet-blue?style=flat-square)](https://devnet.octrascan.io)
[![Smart Contracts](https://img.shields.io/badge/Contracts-AML%20Language-purple?style=flat-square)](https://docs.octra.org)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-cyan?style=flat-square)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Quick Start](#-quick-start) • [Architecture](#-architecture) • [Smart Contracts](#-smart-contracts) • [SDK & Frontend](#-sdk--frontend) • [Security Audit](#-security-audit)

</div>

---

## 📖 Overview

**OctraShield DEX** is a next-generation decentralized exchange built natively on the **Octra Network**. Leveraging Homomorphic FHE Encryption (HFHE) and the OCS01 transaction standard, OctraShield provides privacy-preserving token swaps, automated market-making (AMM), and AI-driven dynamic fee adjustments without relying on EVM compatibility or ECDSA signatures.

---

## 🚀 Deployed Contracts (Octra Devnet)

All smart contracts are deployed and verified on the Octra Devnet using Ed25519 signing and deterministic nonce management:

| Contract | Address | Explorer Link |
| :--- | :--- | :--- |
| **Shield Token** (`shield_token.aml`) | `oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM` | [View on Explorer](https://devnet.octrascan.io/address/oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM) |
| **AI Engine** (`ai_engine.aml`) | `oct3AJbKUEfSnDvzL8UVtQwzSEH53UMXuEiCSX3m3xkxvfw` | [View on Explorer](https://devnet.octrascan.io/address/oct3AJbKUEfSnDvzL8UVtQwzSEH53UMXuEiCSX3m3xkxvfw) |
| **Factory** (`factory.aml`) | `octHuhyCawJ1gpENz11BXiLuhoBt8L4RBVwAw1tdyDpGg1D` | [View on Explorer](https://devnet.octrascan.io/address/octHuhyCawJ1gpENz11BXiLuhoBt8L4RBVwAw1tdyDpGg1D) |
| **Pair AMM** (`pair.aml`) | `octMNoNQQfc3SjHiS5grPC2faYC1hAf8Lw3gU8c6VV6B9UG` | [View on Explorer](https://devnet.octrascan.io/address/octMNoNQQfc3SjHiS5grPC2faYC1hAf8Lw3gU8c6VV6B9UG) |
| **Router** (`router.aml`) | `oct4dqgWDhkX1cNtYCbWMrGbdPK4keKqkCzpdTVG695zmz8` | [View on Explorer](https://devnet.octrascan.io/address/oct4dqgWDhkX1cNtYCbWMrGbdPK4keKqkCzpdTVG695zmz8) |

- **Network:** Octra Devnet (`https://devnet.octrascan.io/rpc`)
- **Deployer Address:** `oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R`
- **Consensus / Signer:** Ed25519 (`pyNaCl`)

---

## 🏗️ Repository Architecture

```text
octrashield-dex/
├── contracts/aml/          # AML smart contracts (Octra Markup Language)
│   ├── shield_token.aml    # Encrypted privacy token (mint/burn/transfer)
│   ├── ai_engine.aml       # AI risk assessment & dynamic fee model
│   ├── factory.aml         # Liquidity pool registry & fee tier mapping
│   ├── pair.aml            # Constant product AMM pair (x * y = k)
│   └── router.aml          # Multi-hop swap routing & liquidity management
├── sdk/                    # TypeScript SDK (@octrashield/dex-sdk)
├── app/                    # React frontend & dashboard (@octrashield/dex-app)
├── config/
│   └── octra-network.json  # Network endpoints & verified contract registry
└── deploy.py               # Secure Python deployment script (Ed25519 signed)
```

---

## ⚡ Quick Start

### Prerequisites

- **Python 3.9+** with `pyNaCl` and `requests`
- **Node.js 18+** and **pnpm 9+**
- Funded Octra Devnet wallet with private key (`PRIVATE_KEY_B64`)

### 1. Smart Contract Deployment

To deploy or redeploy contracts to the Octra Devnet using the secure Python CLI:

```bash
# Install Python dependencies
pip install pyNaCl requests

# Configure deployment environment variables
export PRIVATE_KEY_B64="<your-base64-ed25519-seed>"
export DEPLOYER_ADDRESS="oct5N5eUdrycUBouGyFDaBhhgQvbYkUvLB3HJCD9xNe2g6R"

# Run deployment script
python3 deploy.py
```

### 2. Frontend & SDK Development

```bash
# Clone the repository
git clone https://github.com/0xgetz/octrashield-dex.git
cd octrashield-dex

# Install monorepo dependencies
pnpm install

# Build the TypeScript SDK
cd sdk && pnpm build

# Run the React frontend development server
cd ../app && pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser to access the application.

---

## 🔒 Security & Quality Audit Highlights

Following a comprehensive security audit and codebase hardening session, the repository features:
- **Strict Cryptographic Validation:** Ed25519 signature verification and Mersenne prime field arithmetic (`p = 2^127 - 1`) for all HFHE computations.
- **Fail-Closed Deployment:** The `deploy.py` script validates account nonces and verifies transaction confirmation on-chain before updating contract registries.
- **Robust Test Coverage:** 100% passing test suites across the SDK (`vitest`) and React frontend components (`testing-library`).
- **Strict TypeScript Compliance:** Zero compilation errors across both workspace packages (`tsc --noEmit`).

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
