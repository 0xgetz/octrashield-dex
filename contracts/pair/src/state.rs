//! OctraShieldPair -- Pool & Position State
//!
//! Defines the full mutable state of a concentrated-liquidity AMM pool,
//! the per-position state, per-tick state, and the immutable PairConfig
//! that is set at pool initialisation and never changes afterwards.
//!
//! All reserve and price values are HFHE-encrypted ciphertexts; validators
//! never observe plaintext balances.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use octrashield_shared::{
    constants::{MAX_TICK, MIN_TICK},
    hfhe::EncryptedU64,
    types::{LiquidityDelta, OctraAddress, PoolId},
};

// ---------------------------------------------------------------------------
// Type aliases (local convenience)
// ---------------------------------------------------------------------------

/// An Octra network address used as a token identifier
pub type TokenAddress = OctraAddress;

/// An Octra network address used generically
pub type Address = OctraAddress;

/// Block / unix timestamp (seconds since epoch)
pub type Timestamp = u64;

/// Tick index (signed 32-bit integer)
pub type Tick = i32;

// ---------------------------------------------------------------------------
// PositionKey
// ---------------------------------------------------------------------------

/// Unique identifier for a liquidity position: (owner, lower_tick, upper_tick)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PositionKey {
    pub owner: Address,
    pub tick_lower: Tick,
    pub tick_upper: Tick,
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/// A single concentrated liquidity position held by an LP.
///
/// All monetary amounts are stored as HFHE-encrypted ciphertexts so that
/// on-chain validators cannot observe individual position sizes.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Position {
    /// Encrypted liquidity units contributed by this position
    pub liquidity: EncryptedU64,
    /// Fee growth inside the range at the time of last collection (token0)
    pub fee_growth_inside_last_x128_0: EncryptedU64,
    /// Fee growth inside the range at the time of last collection (token1)
    pub fee_growth_inside_last_x128_1: EncryptedU64,
    /// Uncollected fees owed to the LP in token0
    pub tokens_owed_0: EncryptedU64,
    /// Uncollected fees owed to the LP in token1
    pub tokens_owed_1: EncryptedU64,
    /// Block timestamp when position was created or last updated
    pub last_updated: Timestamp,
}

impl Position {
    /// Create a brand-new zero-liquidity position.
    pub fn new_empty(now: Timestamp) -> Self {
        Self {
            liquidity: EncryptedU64::zero(),
            fee_growth_inside_last_x128_0: EncryptedU64::zero(),
            fee_growth_inside_last_x128_1: EncryptedU64::zero(),
            tokens_owed_0: EncryptedU64::zero(),
            tokens_owed_1: EncryptedU64::zero(),
            last_updated: now,
        }
    }
}

// ---------------------------------------------------------------------------
// TickState
// ---------------------------------------------------------------------------

/// Per-tick state used for concentrated liquidity range management.
///
/// Every initialised tick boundary holds fee-growth accumulators so the
/// protocol can compute earned fees inside any arbitrary [lower, upper] range.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct TickState {
    /// Net liquidity delta when price crosses this tick (signed; can be negative)
    pub liquidity_net: LiquidityDelta,
    /// Gross liquidity referencing this tick (always >= 0, encrypted)
    pub liquidity_gross: EncryptedU64,
    /// Fee growth outside this tick for token0 (Q128.128, encrypted)
    pub fee_growth_outside_x128_0: EncryptedU64,
    /// Fee growth outside this tick for token1 (Q128.128, encrypted)
    pub fee_growth_outside_x128_1: EncryptedU64,
    /// True when at least one position references this tick
    pub initialized: bool,
}

impl TickState {
    /// Construct a zeroed-out, uninitialised tick.
    pub fn new() -> Self {
        Self {
            liquidity_net: LiquidityDelta::zero(),
            liquidity_gross: EncryptedU64::zero(),
            fee_growth_outside_x128_0: EncryptedU64::zero(),
            fee_growth_outside_x128_1: EncryptedU64::zero(),
            initialized: false,
        }
    }
}

impl Default for TickState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// PairConfig  (immutable after call_initialize)
// ---------------------------------------------------------------------------

/// Immutable configuration sealed at pool initialisation.
///
/// Stored alongside mutable `PoolState`; the contract reads both but only
/// ever writes to `PoolState`.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PairConfig {
    /// The lexicographically lesser token address (canonical token0)
    pub token0: TokenAddress,
    /// The lexicographically greater token address (canonical token1)
    pub token1: TokenAddress,
    /// Fee in basis points charged on every swap (e.g. 30 = 0.30 %)
    pub fee_bps: u32,
    /// Minimum tick spacing for concentrated liquidity ranges
    pub tick_spacing: i32,
    /// Address of the ShieldToken (LP token) minted to liquidity providers
    pub lp_token: Address,
    /// Address of the AI fee engine authorised to call call_set_ai_fee
    pub ai_engine: Address,
    /// Address of the OctraShieldFactory that deployed this pair
    pub factory: Address,
    /// Unix timestamp (seconds) when the pool was initialised
    pub created_at: Timestamp,
    /// Unique pool identifier: SHA-256(token0 || token1 || fee_bps)
    pub pool_id: PoolId,
}

// ---------------------------------------------------------------------------
// PoolState  (fully mutable)
// ---------------------------------------------------------------------------

/// Full mutable state of an OctraShield DEX pair (AMM pool).
///
/// All reserve and price values are stored as HFHE-encrypted ciphertexts,
/// meaning validators never observe plaintext balances or swap amounts.
/// The struct is serialised to the Octra contract storage via Borsh.
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolState {
    // ---- Constant-product invariant ----------------------------------------
    /// Encrypted reserve of token0 currently held by this pool
    pub reserve0: EncryptedU64,
    /// Encrypted reserve of token1 currently held by this pool
    pub reserve1: EncryptedU64,
    /// Encrypted virtual constant-product k = reserve0 * reserve1
    /// (maintained for the full-range virtual position)
    pub k_invariant: EncryptedU64,

    // ---- Price / tick ------------------------------------------------------
    /// Encrypted square-root price as Q64.64 fixed-point: sqrt(token1/token0)
    pub sqrt_price_x64: EncryptedU64,
    /// Index of the tick immediately below the current price
    pub current_tick: Tick,

    // ---- Liquidity ---------------------------------------------------------
    /// Total active in-range liquidity summed across all overlapping positions
    pub liquidity: EncryptedU64,

    // ---- Global fee accumulators -------------------------------------------
    /// Cumulative fee growth per unit of liquidity for token0, Q128.128
    pub fee_growth_global_x128_0: EncryptedU64,
    /// Cumulative fee growth per unit of liquidity for token1, Q128.128
    pub fee_growth_global_x128_1: EncryptedU64,
    /// Protocol-owned uncollected fees in token0 (1/6 of LP fees by default)
    pub protocol_fees_0: EncryptedU64,
    /// Protocol-owned uncollected fees in token1
    pub protocol_fees_1: EncryptedU64,

    // ---- AI-driven dynamic fee override ------------------------------------
    /// When Some(bps), the AI engine has overridden the static fee tier.
    /// None means use `config.fee_bps` unchanged.
    pub ai_fee_override_bps: Option<u32>,

    // ---- Positions & ticks -------------------------------------------------
    /// All concentrated-liquidity positions, keyed by (owner, lower, upper)
    pub positions: HashMap<PositionKey, Position>,
    /// Tick-level state for every initialised tick boundary
    pub ticks: HashMap<Tick, TickState>,

    // ---- Control flags -----------------------------------------------------
    /// Reentrancy guard: set to true at the start of every state-mutating call
    /// and cleared before returning. Rejects recursive calls.
    pub locked: bool,
    /// Emergency pause: when true all state-changing entry points revert.
    /// Only the factory owner can set this via call_pause / call_unpause.
    pub paused: bool,
    /// Set to true after call_initialize completes successfully.
    pub initialized: bool,

    // ---- TWAP oracle -------------------------------------------------------
    /// Encrypted cumulative (tick * elapsed_seconds) used to compute TWAPs
    pub tick_cumulative: EncryptedU64,
    /// Unix timestamp of the most recent oracle observation update
    pub last_observation_time: Timestamp,
}

impl PoolState {
    /// Returns the effective swap fee in basis points.
    ///
    /// If the AI engine has set an override, that value is returned;
    /// otherwise falls back to the static fee encoded in `PairConfig`.
    pub fn effective_fee_bps(&self, config: &PairConfig) -> u32 {
        self.ai_fee_override_bps.unwrap_or(config.fee_bps)
    }

    /// Returns `true` if `tick` lies within the valid protocol-defined range
    /// `[MIN_TICK, MAX_TICK]` (inclusive on both ends).
    pub fn tick_in_range(tick: Tick) -> bool {
        tick >= MIN_TICK && tick <= MAX_TICK
    }

    /// Returns `true` if `tick` is a valid multiple of `tick_spacing`.
    pub fn tick_aligned(tick: Tick, tick_spacing: i32) -> bool {
        tick % tick_spacing == 0
    }
}
