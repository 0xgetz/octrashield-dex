# =============================================================================
# OctraShield DEX — Project Makefile
# =============================================================================
# Usage:
#   make              Build everything
#   make test         Run all tests
#   make lint         Lint all code
#   make docker-up    Start local dev environment
#   make clean        Remove build artifacts
# =============================================================================

.PHONY: all contracts sdk app test test-contracts test-sdk test-app \
        lint lint-rust lint-ts typecheck build docker-build docker-up \
        docker-down clean help

# Default target
all: contracts sdk app

# =============================================================================
# Build Targets
# =============================================================================

contracts:  ## Build Rust contracts (debug)
	cd contracts && cargo build --all

contracts-release:  ## Build Rust contracts (release WASM)
	cd contracts && cargo build --release --target wasm32-unknown-unknown

sdk:  ## Build TypeScript SDK
	cd sdk && pnpm build

app: sdk  ## Build React app (depends on SDK)
	cd app && pnpm build

build: contracts-release sdk app  ## Build everything for production

# =============================================================================
# Test Targets
# =============================================================================

test: test-contracts test-sdk test-app  ## Run all tests

test-contracts:  ## Run Rust contract tests
	cd contracts && cargo test --all --verbose

test-contracts-release:  ## Run Rust contract tests (release)
	cd contracts && cargo test --all --release

test-sdk:  ## Run SDK tests with coverage
	cd sdk && pnpm exec vitest run --coverage

test-app: sdk  ## Run App tests with coverage
	cd app && pnpm exec vitest run --coverage

test-watch-sdk:  ## Run SDK tests in watch mode
	cd sdk && pnpm exec vitest

test-watch-app:  ## Run App tests in watch mode
	cd app && pnpm exec vitest

# =============================================================================
# Lint & Format
# =============================================================================

lint: lint-rust lint-ts  ## Lint everything

lint-rust:  ## Lint Rust code (fmt + clippy)
	cd contracts && cargo fmt --all -- --check
	cd contracts && cargo clippy --all-targets --all-features -- -D warnings

lint-ts:  ## Lint TypeScript code (Biome)
	cd sdk && pnpm exec biome check src/
	cd app && pnpm exec biome check src/

format:  ## Auto-format all code
	cd contracts && cargo fmt --all
	cd sdk && pnpm exec biome check --write src/
	cd app && pnpm exec biome check --write src/

typecheck:  ## TypeScript type checking
	cd sdk && pnpm exec tsc --noEmit
	cd app && pnpm exec tsc --noEmit

# =============================================================================
# Docker
# =============================================================================

docker-build:  ## Build Docker image
	docker build -f docker/Dockerfile -t octrashield-dex:local .

docker-up:  ## Start local dev environment
	docker compose -f docker/docker-compose.yml up -d
	@echo "\n  App:      http://localhost:3000"
	@echo "  RPC:      http://localhost:26657"
	@echo "  REST:     http://localhost:1317"
	@echo "  Redis:    localhost:6379"
	@echo "  AI Svc:   http://localhost:8080\n"

docker-down:  ## Stop local dev environment
	docker compose -f docker/docker-compose.yml down

docker-logs:  ## Tail all container logs
	docker compose -f docker/docker-compose.yml logs -f

# =============================================================================
# Development
# =============================================================================

dev-sdk:  ## Start SDK in watch mode
	cd sdk && pnpm dev

dev-app:  ## Start App dev server
	cd app && pnpm dev

install:  ## Install all dependencies
	pnpm install
	cd contracts && cargo fetch

# =============================================================================
# Clean
# =============================================================================

clean:  ## Remove all build artifacts
	cd contracts && cargo clean
	rm -rf sdk/dist sdk/coverage
	rm -rf app/dist app/coverage
	rm -rf node_modules sdk/node_modules app/node_modules

# =============================================================================
# Help
# =============================================================================

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
