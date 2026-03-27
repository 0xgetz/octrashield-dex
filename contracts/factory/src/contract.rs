//! OctraShieldFactory — Pool Registry & Deployment Contract
//!
//! The factory is the entry point for creating new OctraShield DEX trading pairs.
//! It maintains a registry of all deployed pools and authorises ecosystem integrations
//! (AI engine, router). Every pool address is deterministic: SHA-256(token0||token1||fee_bps).
//!
//! Entry points:
//!   call_create_pool        — deploy a new Pair + ShieldToken and register them
//!   call_enable_fee_tier    — owner adds a new fee tier
//!   call_set_ai_engine      — owner sets the AI fee engine address
//!   call_set_router         — owner sets the router address
//!   call_transfer_ownership — initiate two-step ownership transfer
//!   call_accept_ownership   — pending owner accepts ownership
//!   view_get_pool           — look up a pool by (token0, token1, fee_bps)
//!   view_all_pools          — enumerate all pool records
//!   view_all_fee_tiers      — list enabled fee tiers
//!   view_pool_count         — total number of pools
//!   view_owner              — current owner address

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use octrashield_shared::{
    errors::OctraShieldError,
    ocs01::{CallResult, MethodDescriptor, OCS01Contract, ViewResult},
    types::{OctraAddress, PoolId},
};

use crate::state::{Address, FactoryState, PoolRecord, TokenAddress};

// ---------------------------------------------------------------------------
// OctraShieldFactory
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraShieldFactory {
    pub state: FactoryState,
}

impl OctraShieldFactory {
    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// Deploy a new factory owned by `owner`.
    ///
    /// `pair_code_hash` and `lp_code_hash` are the SHA-256 hashes of the
    /// WASM binaries that will be instantiated for each new pool pair and LP token.
    pub fn new(
        owner: Address,
        pair_code_hash: [u8; 32],
        lp_code_hash: [u8; 32],
    ) -> Self {
        Self {
            state: FactoryState::new(owner, pair_code_hash, lp_code_hash),
        }
    }

    // -----------------------------------------------------------------------
    // call_create_pool
    // -----------------------------------------------------------------------

    /// Deploy a new OctraShieldPair + ShieldToken and register them in the factory.
    ///
    /// Tokens are sorted lexicographically so (A, B) and (B, A) map to the same pool.
    /// The PoolId is SHA-256(token0_bytes || token1_bytes || fee_bps_le_bytes).
    ///
    /// # Arguments
    /// * `token_a` / `token_b` — the two tokens (order does not matter)
    /// * `fee_bps`             — must be in the enabled fee-tier set
    /// * `pair_address`        — address of the already-deployed Pair contract
    /// * `lp_token_address`    — address of the already-deployed ShieldToken contract
    /// * `now`                 — current block timestamp
    ///
    /// # Returns
    /// The canonical `PoolId` of the newly registered pool.
    pub fn call_create_pool(
        &mut self,
        caller: Address,
        token_a: TokenAddress,
        token_b: TokenAddress,
        fee_bps: u32,
        pair_address: Address,
        lp_token_address: Address,
        now: u64,
    ) -> Result<PoolId, OctraShieldError> {
        // Only factory owner may create pools
        if caller != self.state.owner {
            return Err(OctraShieldError::Unauthorized);
        }

        // Validate fee tier
        if !self.state.is_valid_fee_tier(fee_bps) {
            return Err(OctraShieldError::InvalidFeeTier);
        }

        // Canonical token sort (lexicographic on the address bytes)
        let (token0, token1) = sort_tokens(token_a, token_b)?;

        // Duplicate check
        if self.state.pool_exists(&token0, &token1, fee_bps) {
            return Err(OctraShieldError::PoolAlreadyExists);
        }

        // Derive PoolId = SHA-256(token0 || token1 || fee_bps_le)
        let pool_id = compute_pool_id(&token0, &token1, fee_bps);

        let record = PoolRecord {
            pool_id: pool_id.clone(),
            token0: token0.clone(),
            token1: token1.clone(),
            fee_bps,
            pair_address,
            lp_token_address,
            created_at: now,
        };

        // Register in all indices
        self.state.pools.insert(pool_id.clone(), record);
        self.state
            .pool_index
            .insert((token0, token1, fee_bps), pool_id.clone());
        self.state.pool_list.push(pool_id.clone());
        self.state.pool_count += 1;

        Ok(pool_id)
    }

    // -----------------------------------------------------------------------
    // call_enable_fee_tier
    // -----------------------------------------------------------------------

    /// Add a new fee tier to the factory. Owner-only.
    ///
    /// # Arguments
    /// * `fee_bps`      — fee in basis points (1-9999)
    /// * `tick_spacing` — minimum tick spacing for pools at this tier (>= 1)
    pub fn call_enable_fee_tier(
        &mut self,
        caller: Address,
        fee_bps: u32,
        tick_spacing: i32,
    ) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;

        if fee_bps == 0 || fee_bps >= 10_000 {
            return Err(OctraShieldError::InvalidFeeTier);
        }
        if tick_spacing < 1 {
            return Err(OctraShieldError::InvalidTickSpacing);
        }
        if self.state.fee_tiers.contains_key(&fee_bps) {
            return Err(OctraShieldError::FeeTierAlreadyEnabled);
        }

        self.state.fee_tiers.insert(fee_bps, tick_spacing);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_set_ai_engine
    // -----------------------------------------------------------------------

    /// Set or update the AI fee engine address. Owner-only.
    pub fn call_set_ai_engine(
        &mut self,
        caller: Address,
        ai_engine: Address,
    ) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;
        self.state.ai_engine = Some(ai_engine);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_set_router
    // -----------------------------------------------------------------------

    /// Set or update the OctraShieldRouter address. Owner-only.
    pub fn call_set_router(
        &mut self,
        caller: Address,
        router: Address,
    ) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;
        self.state.router = Some(router);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_transfer_ownership (step 1 of 2)
    // -----------------------------------------------------------------------

    /// Initiate a two-step ownership transfer. Stores `new_owner` as pending.
    /// The transfer is not complete until `call_accept_ownership` is called.
    pub fn call_transfer_ownership(
        &mut self,
        caller: Address,
        new_owner: Address,
    ) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;
        if new_owner == self.state.owner {
            return Err(OctraShieldError::InvalidOwner);
        }
        self.state.pending_owner = Some(new_owner);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_accept_ownership (step 2 of 2)
    // -----------------------------------------------------------------------

    /// Complete a pending ownership transfer. Must be called by the pending owner.
    pub fn call_accept_ownership(
        &mut self,
        caller: Address,
    ) -> Result<(), OctraShieldError> {
        match &self.state.pending_owner {
            Some(pending) if pending == &caller => {
                self.state.owner = caller;
                self.state.pending_owner = None;
                Ok(())
            }
            Some(_) => Err(OctraShieldError::Unauthorized),
            None => Err(OctraShieldError::NoPendingOwner),
        }
    }

    // -----------------------------------------------------------------------
    // View methods (5)
    // -----------------------------------------------------------------------

    /// Look up a pool by its token pair and fee tier.
    pub fn view_get_pool(
        &self,
        token_a: &TokenAddress,
        token_b: &TokenAddress,
        fee_bps: u32,
    ) -> Option<&PoolRecord> {
        // Normalise sort order before lookup
        let (token0, token1) = if token_a.as_str() <= token_b.as_str() {
            (token_a, token_b)
        } else {
            (token_b, token_a)
        };

        self.state
            .pool_index
            .get(&(token0.clone(), token1.clone(), fee_bps))
            .and_then(|id| self.state.pools.get(id))
    }

    /// Return all registered pool records (ordered by creation).
    pub fn view_all_pools(&self) -> Vec<&PoolRecord> {
        self.state
            .pool_list
            .iter()
            .filter_map(|id| self.state.pools.get(id))
            .collect()
    }

    /// Return all enabled fee tiers as (fee_bps, tick_spacing) pairs.
    pub fn view_all_fee_tiers(&self) -> Vec<(u32, i32)> {
        let mut tiers: Vec<(u32, i32)> = self
            .state
            .fee_tiers
            .iter()
            .map(|(&bps, &spacing)| (bps, spacing))
            .collect();
        tiers.sort_by_key(|(bps, _)| *bps);
        tiers
    }

    /// Return the total number of pools ever created.
    pub fn view_pool_count(&self) -> u64 {
        self.state.pool_count
    }

    /// Return the current owner address.
    pub fn view_owner(&self) -> &Address {
        &self.state.owner
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_owner(&self, caller: &Address) -> Result<(), OctraShieldError> {
        if caller != &self.state.owner {
            Err(OctraShieldError::Unauthorized)
        } else {
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions
// ---------------------------------------------------------------------------

/// Sort two token addresses lexicographically. Rejects identical tokens.
fn sort_tokens(
    a: TokenAddress,
    b: TokenAddress,
) -> Result<(TokenAddress, TokenAddress), OctraShieldError> {
    if a == b {
        return Err(OctraShieldError::IdenticalTokens);
    }
    if a.as_str() < b.as_str() {
        Ok((a, b))
    } else {
        Ok((b, a))
    }
}

/// Compute PoolId = SHA-256(token0_bytes || token1_bytes || fee_bps_le_bytes).
fn compute_pool_id(token0: &TokenAddress, token1: &TokenAddress, fee_bps: u32) -> PoolId {
    let mut hasher = Sha256::new();
    hasher.update(token0.as_bytes());
    hasher.update(token1.as_bytes());
    hasher.update(fee_bps.to_le_bytes());
    let hash: [u8; 32] = hasher.finalize().into();
    PoolId::from_bytes(hash)
}

// ---------------------------------------------------------------------------
// OCS01Contract trait implementation
// ---------------------------------------------------------------------------

impl OCS01Contract for OctraShieldFactory {
    fn describe_methods(&self) -> Vec<MethodDescriptor> {
        vec![
            MethodDescriptor::call("call_create_pool",        "Deploy and register a new token pair"),
            MethodDescriptor::call("call_enable_fee_tier",    "Enable a new fee tier (owner only)"),
            MethodDescriptor::call("call_set_ai_engine",      "Set AI fee engine address (owner only)"),
            MethodDescriptor::call("call_set_router",         "Set router address (owner only)"),
            MethodDescriptor::call("call_transfer_ownership", "Initiate two-step ownership transfer"),
            MethodDescriptor::call("call_accept_ownership",   "Accept pending ownership transfer"),
            MethodDescriptor::view("view_get_pool",           "Look up pool by token pair + fee"),
            MethodDescriptor::view("view_all_pools",          "Enumerate all registered pools"),
            MethodDescriptor::view("view_all_fee_tiers",      "List enabled fee tiers"),
            MethodDescriptor::view("view_pool_count",         "Total number of pools created"),
            MethodDescriptor::view("view_owner",              "Current factory owner address"),
        ]
    }
}
