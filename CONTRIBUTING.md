# Contributing to OctraShield DEX

Welcome! This guide covers how to set up your development environment,
run tests, and deploy contracts to Octra Network testnet.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Running Tests](#running-tests)
5. [Code Quality & Linting](#code-quality--linting)
6. [Octra Network Context](#octra-network-context)
7. [Deploying to Octra Testnet](#deploying-to-octra-testnet)
8. [Pre-commit Hooks](#pre-commit-hooks)
9. [CI/CD Pipeline](#cicd-pipeline)
10. [Getting Help](#getting-help)

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | nightly-2024-12-01 or later | Smart contracts (compiled to OVM bytecode) |
| Node.js | >= 20 | SDK + App frontend |
| pnpm | >= 9 | Package manager |
| Python | >= 3.9 | Deploy script |
| PyNaCl | latest | Ed25519 signing in deploy.py |

Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup toolchain install nightly-2024-12-01
rustup default nightly-2024-12-01
rustup component add rustfmt clippy
```

Install Node + pnpm:
```bash
# Using nvm (recommended)
nvm install 20 && nvm use 20
npm install -g pnpm@9
```

Install Python dependencies for deploy.py:
```bash
pip install requests pynacl python-dotenv
```

---

## Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/0xgetz/octrashield-dex
cd octrashield-dex
```

### 2. Install Node dependencies

```bash
pnpm install
```

This installs all workspace dependencies including `@biomejs/biome`, `vitest`,
`husky`, and `lefthook` for all packages.

### 3. Set up pre-commit hooks

```bash
pnpm exec husky
npx lefthook install
```

### 4. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```bash
# Ed25519 private key seed — 32 bytes, base64-encoded
# WARNING: Never commit this value. wallet.json and *.key are in .gitignore.
PRIVATE_KEY_B64=<your-base64-ed25519-seed>

# Octra Network RPC endpoint (JSON-RPC 2.0 POST)
# See config/octra-network.json for full network config
OCTRA_RPC_URL=http://46.101.86.250:8080/rpc

# Your oct-prefixed deployer address (47 chars)
DEPLOYER_ADDRESS=oct<your-address>
```

Generate a new wallet for testing:

```bash
# Using octra-labs wallet generator
git clone https://github.com/octra-labs/wallet-gen
cd wallet-gen && python gen.py
# Output: address, private key seed (base64), public key
```

### 5. Build the SDK

```bash
cd sdk && pnpm build
```

### 6. Start the App (development)

```bash
cd app && pnpm dev
```

---

## Project Structure

```
octrashield-dex/
  contracts/           # Rust smart contracts (AML / OVM bytecode)
    shared/            # Shared types and constants
    factory/           # Pair factory contract
    pair/              # Concentrated liquidity pair
    router/            # Multi-hop swap router
    ai_engine/         # AI-powered dynamic fee engine
    shield_token/      # SHIELD governance token
  sdk/                 # TypeScript SDK for interacting with contracts
    src/
      clients/         # Contract client wrappers
      core/            # Types, constants, OCS01 interface
      hooks/           # React hooks
      utils/           # Math, routing, formatting helpers
      __tests__/       # Vitest unit tests
  app/                 # React frontend (Vite)
    src/
      providers/       # WalletProvider, OctraProvider
      components/      # UI components
  config/
    octra-network.json # Octra Network configuration (RPC, explorer, token info)
  deploy.py            # Contract deployment script (JSON-RPC 2.0, Ed25519)
  examples/            # Usage examples
  .github/workflows/   # CI/CD pipelines
```

---

## Running Tests

### Rust contract tests

```bash
cd contracts
cargo test --all --verbose
```

Run with Octra RPC URL for integration tests:

```bash
OCTRA_RPC_URL=http://46.101.86.250:8080/rpc cargo test --all
```

### SDK unit tests (vitest)

```bash
cd sdk
pnpm test           # run once
pnpm test:watch     # watch mode
pnpm test:coverage  # with coverage report
```

### App tests (vitest)

```bash
cd app
pnpm test
```

### Run all tests

```bash
# From repo root
pnpm --filter @octrashield/dex-sdk test
pnpm --filter @octrashield/dex-app test
cd contracts && cargo test --all
```

---

## Code Quality & Linting

This project uses **Biome** for TypeScript linting and formatting, and
**rustfmt + clippy** for Rust.

### Check everything

```bash
# TypeScript (SDK)
cd sdk && pnpm exec biome check src/

# TypeScript (App)
cd app && pnpm exec biome check src/

# Rust formatting check
cd contracts && cargo fmt --all -- --check

# Rust clippy
cd contracts && cargo clippy --all-targets --all-features -- -D warnings
```

### Auto-fix

```bash
# Fix TypeScript
cd sdk && pnpm exec biome check --write src/
cd app && pnpm exec biome check --write src/

# Fix Rust formatting
cd contracts && cargo fmt --all
```

---

## Octra Network Context

> **Important:** Octra Network is NOT EVM-compatible. Do not use `ethers.js`,
> `web3.js`, MetaMask, or any EVM toolchain.

| Concept | Octra Network | EVM (Ethereum) |
|---------|--------------|----------------|
| Chain ID | String: `"v3.0.0-irmin"` | Numeric: `1`, `137`, etc. |
| Signing | Ed25519 | ECDSA / secp256k1 |
| Fees | Operation Units (OU) | Gas (gwei) |
| RPC | JSON-RPC 2.0 POST | JSON-RPC 2.0 (eth_*) |
| Compile | `octra_compileAml` RPC | Local Solidity compiler |
| Address | `oct...` prefix, 47 chars | `0x...` prefix, 42 chars |
| FHE | Built-in (HFHE) | Not available natively |

### Key RPC methods

```bash
# Check node status / protocol version
curl -s -X POST http://46.101.86.250:8080/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"node_status","params":[]}'

# Get account balance + nonce
curl -s -X POST http://46.101.86.250:8080/rpc \
  -d '{"jsonrpc":"2.0","id":1,"method":"octra_balance","params":["<address>"]}'

# Get recommended OU fee
curl -s -X POST http://46.101.86.250:8080/rpc \
  -d '{"jsonrpc":"2.0","id":1,"method":"octra_recommendedFee","params":[]}'

# Compile AML contract
curl -s -X POST http://46.101.86.250:8080/rpc \
  -d '{"jsonrpc":"2.0","id":1,"method":"octra_compileAml","params":["contract MyContract { ... }"]}'
```

Full network config: [`config/octra-network.json`](./config/octra-network.json)

Full API docs: https://octrascan.io/docs.html

---

## Deploying to Octra Testnet

### 1. Get testnet OCT

Visit https://faucet.octra.network — provides 10 OCT per 24 hours.

### 2. Set environment variables

```bash
export PRIVATE_KEY_B64=<your-base64-seed>
export OCTRA_RPC_URL=http://46.101.86.250:8080/rpc
export DEPLOYER_ADDRESS=oct<your-address>
```

Or use a `.env` file (never commit it — it is in `.gitignore`).

### 3. Register your public key (first time only)

Before you can receive funds, your Ed25519 public key must be registered:

```bash
curl -s -X POST http://46.101.86.250:8080/rpc \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "octra_registerPublicKey",
    "params": ["<base64-public-key>", "<your-address>"]
  }'
```

### 4. Write your AML contract

Contracts are written in **AML (AppliedML)**, the native Octra smart contract
language. Example:

```aml
contract SimpleStore {
  state {
    value: u64,
    owner: address,
  }

  constructor(initial: u64) {
    state.owner = caller;
    state.value = initial;
  }

  fn set(new_value: u64) {
    require(caller == state.owner, "not owner");
    state.value = new_value;
  }

  view fn get() -> u64 {
    return state.value;
  }
}
```

Contract examples: https://github.com/octra-labs/contract-examples

### 5. Deploy via deploy.py

```bash
python deploy.py contracts/my_contract.aml
```

The script will:
1. Check your balance
2. Compile the AML source via `octra_compileAml` RPC (no local compiler needed)
3. Query the recommended OU fee via `octra_recommendedFee`
4. Sign the deploy transaction with your Ed25519 key
5. Submit via `octra_submit`
6. Poll for confirmation via `octra_transaction`

On success, the contract address and explorer link are printed.

### 6. Verify deployment

```bash
# Check contract metadata
curl -s -X POST http://46.101.86.250:8080/rpc \
  -d '{"jsonrpc":"2.0","id":1,"method":"vm_contract","params":["<contract-address>"]}'

# Or open in explorer
open https://octrascan.io/contract/<contract-address>
```

### 7. Test with ocs01-test (optional)

```bash
git clone https://github.com/octra-labs/ocs01-test
cd ocs01-test
# Configure wallet.json with your key
cargo build --release
./target/release/ocs01-test
```

---

## Pre-commit Hooks

Pre-commit hooks run automatically on `git commit` via **husky** + **lefthook**.
They enforce:

- `biome check` — TypeScript lint (SDK + App)
- `biome format` — TypeScript formatting check
- `cargo fmt --check` — Rust formatting check

If a check fails, the commit is blocked. Fix the issues and retry.

To run hooks manually:

```bash
npx lefthook run pre-commit
```

To skip hooks in an emergency (not recommended):

```bash
git commit --no-verify -m "emergency fix"
```

---

## CI/CD Pipeline

The GitHub Actions CI pipeline (`.github/workflows/ci.yml`) runs on every push
and PR. Jobs:

| Job | What it does |
|-----|-------------|
| `lint` | Rust fmt + clippy, Biome lint + format check |
| `typecheck` | TypeScript `tsc --noEmit` for SDK and App |
| `test-contracts` | `cargo test --all` with `OCTRA_RPC_URL` set |
| `test-sdk` | `vitest run --coverage` for the SDK |
| `test-app` | `vitest run --coverage` for the App |
| `build` | WASM contract build + SDK build + App build |

All jobs cache Cargo registry/target and pnpm node_modules for speed.

The `OCTRA_RPC_URL=http://46.101.86.250:8080/rpc` env var is set globally
in the CI workflow.

---

## Getting Help

- **Octra developer docs**: https://docs.octra.org
- **Octra API reference**: https://octrascan.io/docs.html
- **Octra explorer**: https://octrascan.io
- **Octra Telegram**: https://t.me/octra_chat_en
- **Octra dev email**: dev@octra.org
- **Issue tracker**: https://github.com/0xgetz/octrashield-dex/issues
