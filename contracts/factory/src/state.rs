//! OctraShieldFactory -- Factory State
//!
//! Defines the full persistent state of the OctraShieldFactory contract:
//! pool registry, fee-tier configuration, ecosystem integration addresses,
//! and WASM code hashes used for deterministic pair/LP-token deployments.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use octrashield_shared::types::{OctraAddress, PoolId};

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

/// An Octra network address used as a token identifier
pub type TokenAddress = OctraAddress;

/// An Octra network address used generically
pub type Address = OctraAddress;

// ---------------------------------------------------------------------------
// PoolRecord
// ---------------------------------------------------------------------------

/// All metadata stored for a single registered trading pair.
///
/// Inserted into `FactoryState::pools` when a new pool is created via
/// `call_create_pool` and never mutated afterwards.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolRecord {
    /// Canonical pool identifier: SHA-256(token0 || token1 || fee_bps)
    pub pool_id: PoolId,
    /// The lexicographically lesser token address (canonical token0)
    pub token0: TokenAddress,
    /// The lexicographically greater token address (canonical token1)
    pub token1: TokenAddress,
    /// Fee tier in basis points (e.g. 30 = 0.30 %)
    pub fee_bps: u32,
    /// On-chain address of the deployed OctraShieldPair contract
    pub pair_address: Address,
    /// On-chain address of the associated ShieldToken (LP token) contract
    pub lp_token_address: Address,
    /// Unix timestamp (seconds) of pool creation
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// FactoryState
// ---------------------------------------------------------------------------

/// Full persistent state of the OctraShieldFactory contract.
///
/// Serialised to Octra contract storage via Borsh. The factory is the
/// single source of truth for all deployed pools, supported fee tiers,
/// and ecosystem integration addresses.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct FactoryState {
    // ---- Ownership ---------------------------------------------------------
    /// Current owner -- may enable fee tiers, set the AI engine, and initiate
    /// two-step ownership transfers.
    pub owner: Address,
    /// Pending new owner during a two-step ownership transfer.
    /// `None` when no transfer is in progress.
    pub pending_owner: Option<Address>,

    // ---- Pool registry -----------------------------------------------------
    /// Primary index: PoolId -> full PoolRecord
    pub pools: HashMap<PoolId, PoolRecord>,
    /// Secondary index: (token0, token1, fee_bps) -> PoolId
    /// Used for O(1) duplicate detection when creating a new pool.
    pub pool_index: HashMap<(TokenAddress, TokenAddress, u32), PoolId>,
    /// Insertion-ordered list of PoolIds for enumeration / iteration.
    pub pool_list: Vec<PoolId>,
    /// Total number of pools ever created (mirrors pool_list.len() but
    /// stored explicitly to avoid recomputing length on-chain).
    pub pool_count: u64,

    // ---- Fee tiers ---------------------------------------------------------
    /// Enabled fee tiers: fee_bps -> tick_spacing.
    ///
    /// Bootstrapped at deployment with four default tiers:
    ///   1   bps ->   1  tick spacing  (0.01 % -- stable pairs)
    ///   5   bps ->  10  tick spacing  (0.05 % -- correlated assets)
    ///   30  bps ->  60  tick spacing  (0.30 % -- standard volatile)
    ///   100 bps -> 200  tick spacing  (1.00 % -- exotic pairs)
    ///
    /// Additional tiers may be added by the owner via `call_enable_fee_tier`.
    pub fee_tiers: HashMap<u32, i32>,

    // ---- Ecosystem integrations --------------------------------------------
    /// Address of the AI engine contract authorised to set dynamic fees on
    /// individual pools. `None` until set post-deployment.
    pub ai_engine: Option<Address>,
    /// Address of the OctraShieldRouter contract. `None` until set
    /// post-deployment (router is deployed after the factory).
    pub router: Option<Address>,

    // ---- WASM code hashes --------------------------------------------------
    /// SHA-256 hash of the OctraShieldPair WASM binary.
    /// Used to verify the integrity of pair contracts on deployment.
    pub pair_code_hash: [u8; 32],
    /// SHA-256 hash of the ShieldToken (LP token) WASM binary.
    pub lp_code_hash: [u8; 32],
}

impl FactoryState {
    /// Construct the initial factory state with the four default fee tiers.
    ///
    /// `pair_code_hash` and `lp_code_hash` are supplied at deployment time
    /// and correspond to the WASM binaries that will be instantiated for
    /// each new pool.
    pub fn new(owner: Address, pair_code_hash: [u8; 32], lp_code_hash: [u8; 32]) -> Self {
        let mut fee_tiers = HashMap::new();
        fee_tiers.insert(1u32,   1i32);   // 0.01 % -- stable pairs
        fee_tiers.insert(5u32,  10i32);   // 0.05 % -- correlated assets
        fee_tiers.insert(30u32, 60i32);   // 0.30 % -- standard volatile
        fee_tiers.insert(100u32, 200i32); // 1.00 % -- exotic pairs

        Self {
            owner,
            pending_owner: None,
            pools: HashMap::new(),
            pool_index: HashMap::new(),
            pool_list: Vec::new(),
            pool_count: 0,
            fee_tiers,
            ai_engine: None,
            router: None,
            pair_code_hash,
            lp_code_hash,
        }
    }

    /// Returns `true` if the given fee tier (in basis points) is enabled.
    pub fn is_valid_fee_tier(&self, fee_bps: u32) -> bool {
        self.fee_tiers.contains_key(&fee_bps)
    }

    /// Returns the tick spacing for a given fee tier, or `None` if not enabled.
    pub fn tick_spacing_for_fee(&self, fee_bps: u32) -> Option<i32> {
        self.fee_tiers.get(&fee_bps).copied()
    }

    /// Returns `true` if a pool with the given token pair and fee tier already
    /// exists in the registry.
    pub fn pool_exists(&self, token0: &TokenAddress, token1: &TokenAddress, fee_bps: u32) -> bool {
        self.pool_index
            .contains_key(&(token0.clone(), token1.clone(), fee_bps))
    }
}
