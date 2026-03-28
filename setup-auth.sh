#!/bin/bash
# setup-auth.sh - Script to configure GitHub authentication for private repositories
# This script helps set up GitHub tokens for accessing octra-labs private repos

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USER="octra-labs"
PRIVATE_REPOS=("octra-hfhe" "octra-sdk")
CONFIG_DIR=".cargo"
CONFIG_FILE="$CONFIG_DIR/config.toml"
ENV_FILE=".env"

echo -e "${BLUE}=== OctraShield DEX GitHub Authentication Setup ===${NC}"
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running in the correct directory
if [ ! -f "README.md" ] || [ ! -d "contracts" ]; then
    print_error "This script must be run from the octrashield-dex root directory"
    exit 1
fi

# Create .cargo directory if it doesn't exist
if [ ! -d "$CONFIG_DIR" ]; then
    print_info "Creating $CONFIG_DIR directory..."
    mkdir -p "$CONFIG_DIR"
fi

# Step 1: Check for existing GitHub token
print_info "Checking for existing GitHub token..."
if [ -n "$GITHUB_TOKEN" ]; then
    print_success "GitHub token found in environment variable GITHUB_TOKEN"
    TOKEN="$GITHUB_TOKEN"
else
    print_warning "No GitHub token found in environment variable GITHUB_TOKEN"
fi

# Step 2: Prompt for GitHub token if not found
if [ -z "$TOKEN" ]; then
    echo ""
    print_info "You need a GitHub Personal Access Token (PAT) to access private repositories."
    echo ""
    echo "To create a token:"
    echo "1. Go to https://github.com/settings/tokens"
    echo "2. Click 'Generate new token (classic)' or 'Generate new token'"
    echo "3. Select scopes: repo (full control of private repositories)"
    echo "4. Generate token and copy it"
    echo ""
    read -p "Enter your GitHub Personal Access Token: " -s TOKEN
    echo ""
    
    if [ -z "$TOKEN" ]; then
        print_error "Token cannot be empty"
        exit 1
    fi
fi

# Step 3: Validate token format (basic check)
if [[ ! "$TOKEN" =~ ^ghp_[a-zA-Z0-9]{36}$ ]] && [[ ! "$TOKEN" =~ ^github_pat_[a-zA-Z0-9_]{22,}$ ]]; then
    print_warning "Token format doesn't match expected GitHub PAT format"
    echo "Expected formats:"
    echo "  - Classic PAT: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    echo "  - Fine-grained PAT: github_pat_xxxxxxxxxxxxxxxxxxxxx..."
    echo "Continuing anyway, but authentication may fail if token is invalid."
fi

# Step 4: Update .cargo/config.toml
print_info "Updating $CONFIG_FILE..."
cat > "$CONFIG_FILE" << EOF
# Cargo configuration for OctraShield DEX
# This file configures Cargo to use GitHub tokens for private repositories

# Global registry configuration
[registries]
crates-io = { index = "https://github.com/rust-lang/crates.io-index" }

# GitHub registry configuration for octra-labs private repos
[registries.octra-labs]
index = "sparse+https://github.com/octra-labs/crates-index"
token = "${TOKEN}"

# HTTP configuration for GitHub authentication
[http]
headers = ["Authorization = \"Bearer ${TOKEN}\""]

# Git configuration for private repositories
[net]
git-fetch-with-cli = true

# Environment variable substitution for GITHUB_TOKEN
# Cargo will automatically substitute \${GITHUB_TOKEN} with the value from environment
EOF

print_success "Updated $CONFIG_FILE with GitHub token"

# Step 5: Update .env file
print_info "Updating $ENV_FILE..."
if [ -f "$ENV_FILE" ]; then
    # Backup existing .env
    cp "$ENV_FILE" "$ENV_FILE.backup"
    print_info "Created backup: $ENV_FILE.backup"
    
    # Remove existing GITHUB_TOKEN line if present
    sed -i '/^GITHUB_TOKEN=/d' "$ENV_FILE"
fi

# Add GITHUB_TOKEN to .env
echo "GITHUB_TOKEN=${TOKEN}" >> "$ENV_FILE"
print_success "Added GITHUB_TOKEN to $ENV_FILE"

# Step 6: Create .netrc file for git authentication (optional)
print_info "Setting up .netrc for git authentication..."
NETRC_FILE="$HOME/.netrc"
if [ -f "$NETRC_FILE" ]; then
    cp "$NETRC_FILE" "$NETRC_FILE.backup"
    print_info "Created backup: $NETRC_FILE.backup"
fi

cat > "$NETRC_FILE" << EOF
machine github.com
login ${TOKEN}
password x-oauth-basic

machine api.github.com
login ${TOKEN}
password x-oauth-basic
EOF

chmod 600 "$NETRC_FILE"
print_success "Created $NETRC_FILE with GitHub credentials"

# Step 7: Configure git to use the token
print_info "Configuring git for GitHub authentication..."
git config --global credential.helper store 2>/dev/null || true
print_success "Git credential helper configured"

# Step 8: Test authentication
print_info "Testing GitHub authentication..."
if curl -s -H "Authorization: token $TOKEN" https://api.github.com/user | grep -q '"login"'; then
    print_success "GitHub authentication successful!"
    
    # Check access to private repos
    for repo in "${PRIVATE_REPOS[@]}"; do
        if curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/$GITHUB_USER/$repo" | grep -q '"name"'; then
            print_success "Access confirmed to $GITHUB_USER/$repo"
        else
            print_warning "Cannot access $GITHUB_USER/$repo - please check token permissions"
        fi
    done
else
    print_error "GitHub authentication failed. Please check your token."
    exit 1
fi

# Step 9: Create instructions file
cat > GITHUB_AUTH_SETUP.md << EOF
# GitHub Authentication Setup for OctraShield DEX

## Overview
This project requires access to private GitHub repositories from \`octra-labs\`:
- \`octra-labs/octra-hfhe\` - HFHE encryption library
- \`octra-labs/octra-sdk\` - TypeScript SDK components

## What Was Configured

### 1. Cargo Configuration (\`.cargo/config.toml\`)
- Configured GitHub token for private crate dependencies
- Set up HTTP headers for authentication

### 2. Environment Variables (\`.env\`)
- Added \`GITHUB_TOKEN\` for application use
- Token is also available via environment variable

### 3. Git Authentication (\`~/.netrc\`)
- Configured git to use token for GitHub operations
- Enables seamless git clone/pull of private repos

## How to Use

### Option 1: Using Environment Variable (Recommended)
\`\`\`bash
# Set the token in your shell
export GITHUB_TOKEN="your_token_here"

# Or add to your shell profile (~/.bashrc, ~/.zshrc)
echo 'export GITHUB_TOKEN="your_token_here"' >> ~/.bashrc
source ~/.bashrc
\`\`\`

### Option 2: Using .env File
The token has been added to your \`.env\` file. Load it with:
\`\`\`bash
set -a
source .env
set +a
\`\`\`

### Option 3: Using .netrc
Git operations will automatically use the stored credentials.

## Creating a GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select these scopes:
   - **repo** (Full control of private repositories)
   - **read:packages** (Download packages from GitHub)
4. Generate token and copy it
5. Run this script again to configure

## Verifying Setup

\`\`\`bash
# Test cargo configuration
cargo check --workspace

# Test git authentication
git ls-remote https://github.com/octra-labs/octra-hfhe.git

# Test API access
curl -H "Authorization: token \$GITHUB_TOKEN" https://api.github.com/user
\`\`\`

## Troubleshooting

### Token Expired or Invalid
- Generate a new token at https://github.com/settings/tokens
- Run this script again to reconfigure

### Permission Denied on Private Repos
- Ensure token has **repo** scope
- Check that you have access to the private repositories
- Contact repository owner for access

### Cargo Build Fails
- Verify token is correctly set in \`.cargo/config.toml\`
- Check that \`GITHUB_TOKEN\` environment variable is set
- Run \`cargo clean\` and rebuild

## Security Notes

- **NEVER** commit your GitHub token to version control
- The token is stored in \`.env\` (git-ignored) and \`~/.netrc\` (mode 600)
- Rotate tokens regularly and revoke unused ones
- Use fine-grained tokens for better security control

## Private Repository Dependencies

The following private dependencies are used in this project:

\`\`\`toml
# In Cargo.toml files:
[dependencies]
octra-hfhe = { git = "https://github.com/octra-labs/octra-hfhe", branch = "main" }
octra-sdk = { git = "https://github.com/octra-labs/octra-sdk", branch = "main" }
\`\`\`

For more information, see the [README.md](README.md) and [PHASE2_SDK.md](PHASE2_SDK.md).
EOF

print_success "Created GITHUB_AUTH_SETUP.md with detailed instructions"

echo ""
print_success "=== GitHub Authentication Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Review GITHUB_AUTH_SETUP.md for detailed instructions"
echo "2. Test your setup: cargo check --workspace"
echo "3. If you encounter issues, see the Troubleshooting section"
echo ""
print_info "Your GitHub token has been configured in:"
echo "   - .cargo/config.toml"
echo "   - .env file"
echo "   - ~/.netrc (for git operations)"
echo ""
print_warning "Remember: Never commit your GitHub token to version control!"
