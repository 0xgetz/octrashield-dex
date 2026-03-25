# =============================================================================
# OctraShield DEX — Multi-Stage Docker Build
# =============================================================================
# Stage 1: Rust builder (WASM contracts)
# Stage 2: Node builder (SDK + React app)
# Stage 3: Nginx runtime (static serving)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build Rust contracts to WASM
# ---------------------------------------------------------------------------
FROM rust:1.82-bookworm AS rust-builder

RUN rustup target add wasm32-unknown-unknown \
 && rustup component add rustfmt clippy

WORKDIR /build/contracts

# Cache dependency builds
COPY contracts/Cargo.toml contracts/Cargo.lock ./
COPY contracts/shared/Cargo.toml shared/Cargo.toml
COPY contracts/pair/Cargo.toml pair/Cargo.toml
COPY contracts/factory/Cargo.toml factory/Cargo.toml
COPY contracts/ai_engine/Cargo.toml ai_engine/Cargo.toml
COPY contracts/shield_token/Cargo.toml shield_token/Cargo.toml

# Create dummy source files for dependency caching
RUN mkdir -p shared/src pair/src factory/src ai_engine/src shield_token/src \
 && echo 'pub fn dummy() {}' > shared/src/lib.rs \
 && echo 'pub fn dummy() {}' > pair/src/lib.rs \
 && echo 'pub fn dummy() {}' > factory/src/lib.rs \
 && echo 'pub fn dummy() {}' > ai_engine/src/lib.rs \
 && echo 'pub fn dummy() {}' > shield_token/src/lib.rs \
 && cargo build --release --target wasm32-unknown-unknown 2>/dev/null || true

# Copy real source and build
COPY contracts/ ./
RUN cargo build --release --target wasm32-unknown-unknown \
 && cargo test --all

# ---------------------------------------------------------------------------
# Stage 2: Build TypeScript SDK + React App
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS node-builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /build

# Copy workspace config for dependency caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY sdk/package.json sdk/package.json
COPY app/package.json app/package.json

RUN pnpm install --frozen-lockfile

# Copy SDK source and build
COPY sdk/ sdk/
RUN cd sdk && pnpm build

# Copy App source and build
COPY app/ app/

# Build args for environment configuration
ARG VITE_NETWORK=mainnet
ARG VITE_FACTORY_ADDRESS=
ARG VITE_ROUTER_ADDRESS=
ARG VITE_AI_ENGINE_ADDRESS=
ARG VITE_RPC_URL=https://rpc.octrachain.io

ENV VITE_NETWORK=$VITE_NETWORK
ENV VITE_FACTORY_ADDRESS=$VITE_FACTORY_ADDRESS
ENV VITE_ROUTER_ADDRESS=$VITE_ROUTER_ADDRESS
ENV VITE_AI_ENGINE_ADDRESS=$VITE_AI_ENGINE_ADDRESS
ENV VITE_RPC_URL=$VITE_RPC_URL

RUN cd app && pnpm build

# ---------------------------------------------------------------------------
# Stage 3: Production Runtime (Nginx)
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="OctraShield DEX"
LABEL org.opencontainers.image.description="Privacy-first DEX with HFHE and AI-powered fee optimization"
LABEL org.opencontainers.image.source="https://github.com/octrashield/dex"

# Copy built app
COPY --from=node-builder /build/app/dist /usr/share/nginx/html

# Copy WASM contracts (for reference / verification)
COPY --from=rust-builder /build/contracts/target/wasm32-unknown-unknown/release/*.wasm /usr/share/nginx/html/wasm/

# Nginx config for SPA routing
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.octrachain.io wss://*.octrachain.io; img-src 'self' data: https:;" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/wasm;
    gzip_min_length 1000;

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # SPA fallback — all routes to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
