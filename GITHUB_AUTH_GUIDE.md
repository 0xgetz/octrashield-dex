# GitHub Authentication Setup Guide for OctraShield DEX

## Overview

This guide explains how to configure GitHub authentication to access private repositories required by the OctraShield DEX project.

## Required Private Repositories

The project depends on two private repositories from `octra-labs`:

1. **octra-labs/octra-hfhe** - Hypergraph Fully Homomorphic Encryption library (Rust)
2. **octra-labs/octra-sdk** - TypeScript SDK components

## Quick Start

### Step 1: Generate a GitHub Personal Access Token

1. Go to **https://github.com/settings/tokens**
2. Click **"Generate new token (classic)"**
3. Give your token a descriptive name (e.g., "OctraShield DEX")
4. Select the following scopes:
   - ✅ **repo** - Full control of private repositories
   - ✅ **read:packages** - Download packages from GitHub Package Registry
5. Click **"Generate token"** at the bottom
6. **Copy the token immediately** - you won't be able to see it again!

### Step 2: Run the Setup Script

```bash
cd /home/sprite/octrashield-dex
./setup-auth.sh
```

The script will:
- Prompt you to enter your GitHub token (if not already in environment)
- Configure `.cargo/config.toml` for Rust dependencies
- Update your `.env` file with the token
- Set up `~/.netrc` for git authentication
- Test your authentication
- Generate this documentation

### Step 3: Verify Setup

```bash
# Test cargo configuration
cargo check --workspace

# Test git authentication
git ls-remote https://github.com/octra-labs/octra-hfhe.git

# Test API access
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

## Manual Configuration (Alternative)

If you prefer to configure manually, follow these steps:

### 1. Set Environment Variable

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

### 2. Update .env File

Create or edit `.env` in the project root:

```bash
# GitHub authentication token
GITHUB_TOKEN=ghp_your_token_here

# Other environment variables...
VITE_RPC_URL=http://165.225.79:8080
```

### 3. Configure Cargo

Create `.cargo/config.toml`:

```toml
[registries.octra-labs]
index = "sparse+https://github.com/octra-labs/crates-index"
token = "ghp_your_token_here"

[http]
headers = ["Authorization = \"Bearer ghp_your_token_here\""]

[net]
git-fetch-with-cli = true
```

### 4. Configure Git (Optional)

Create or update `~/.netrc`:

```
machine github.com
login ghp_your_token_here
password x-oauth-basic

machine api.github.com
login ghp_your_token_here
password x-oauth-basic
```

Set secure permissions:
```bash
chmod 600 ~/.netrc
```

## Using Fine-Grained Personal Access Tokens

Fine-grained tokens offer better security control:

1. Go to **https://github.com/settings/tokens**
2. Click **"Generate new token"** (not classic)
3. Select resource owner: **octra-labs** (if you're a member)
4. Set expiration (recommended: 30-90 days)
5. Under **Repository access**, select:
   - **octra-hfhe** and **octra-sdk** (or "All repositories" if available)
6. Under **Permissions**, set:
   - **Contents**: Read-only
   - **Metadata**: Read-only
7. Generate and copy the token

Fine-grained tokens start with `github_pat_` instead of `ghp_`.

## Troubleshooting

### Token Not Working

1. **Check token format**:
   - Classic PAT: `ghp_` followed by 36 alphanumeric characters
   - Fine-grained PAT: `github_pat_` followed by 22+ alphanumeric characters

2. **Verify token scopes**:
   ```bash
   curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
   ```
   Should return your user info.

3. **Test repo access**:
   ```bash
   curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/octra-labs/octra-hfhe
   ```
   Should return repository info (not 404).

### Cargo Build Fails

1. **Clean cargo cache**:
   ```bash
   cargo clean
   ```

2. **Verify .cargo/config.toml**:
   - Ensure token is correctly placed
   - Check for typos in repository URLs

3. **Check environment variable**:
   ```bash
   echo $GITHUB_TOKEN
   ```
   Should output your token (or part of it).

### Git Operations Fail

1. **Check .netrc permissions**:
   ```bash
   ls -la ~/.netrc
   ```
   Should be `-rw-------` (600).

2. **Test git authentication**:
   ```bash
   git ls-remote https://github.com/octra-labs/octra-hfhe.git
   ```

3. **Clear git credential cache**:
   ```bash
   git credential reject
   # Then paste: protocol=https
   # host=github.com
   # (empty line)
   ```

### Permission Denied Errors

- Ensure you have been granted access to the private repositories
- Contact the repository owner (likely @0xgetz or Octra Labs team)
- Verify your token has the **repo** scope

## Security Best Practices

1. **Never commit tokens** to version control
   - `.env` is git-ignored ✅
   - `~/.netrc` is not tracked ✅
   - `.cargo/config.toml` should be in `.gitignore` ✅

2. **Use token expiration**
   - Set tokens to expire in 30-90 days
   - Rotate tokens regularly

3. **Use fine-grained tokens** when possible
   - More granular permissions
   - Repository-specific access
   - Easier to audit and revoke

4. **Revoke unused tokens**
   - Regularly review tokens at https://github.com/settings/tokens
   - Delete tokens you no longer use

## CI/CD Integration

For GitHub Actions, use GitHub Secrets:

1. Go to your repository **Settings > Secrets and variables > Actions**
2. Click **"New repository secret"**
3. Name: `GITHUB_TOKEN`
4. Value: Your personal access token
5. Use in workflows:
   ```yaml
   env:
     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

## Additional Resources

- [GitHub Personal Access Tokens Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Cargo Configuration](https://doc.rust-lang.org/cargo/reference/config.html)
- [Git Credentials](https://git-scm.com/docs/gitcredentials)
- [OctraShield DEX README](README.md)

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review the generated `GITHUB_AUTH_SETUP.md`
3. Open an issue in the repository
4. Contact the OctraShield team

---

**Last Updated**: 2026-03-28
**Project**: OctraShield DEX (ShieldSwap)
**Version**: 1.0
