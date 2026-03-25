//! Core Types for OctraShield DEX
//!
//! Domain types shared across all contracts: addresses, pool state,
//! positions, swap parameters, and execution context.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use crate::hfhe::{EncryptedU64, EncryptedBatch};

// ============================================================================
// Address & Identity
// ============================================================================

/// Octra network address (oct-prefixed Base58)
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraAddress(pub String);

impl OctraAddress {
    pub fn new(addr: &str) -> Self {
        Self(addr.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Validate oct-prefix format
    pub fn is_valid(&self) -> bool {
        self.0.starts_with(crate::constants::ADDR_PREFIX) && self.0.len() >= 40
    }

    /// Zero address — used for burn destination
    pub fn zero() -> Self {
        Self(format!("{}0000000000000000000000000000000000000000", crate::constants::ADDR_PREFIX))
    }
}

impl std::fmt::Display for OctraAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// ============================================================================
// Token & Pool Identifiers
// ============================================================================

/// Unique identifier for a trading pair pool
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolId(pub [u8; 32]);

impl PoolId {
    /// Derive pool ID from token addresses + fee tier (deterministic)
    pub fn derive(token0: &OctraAddress, token1: &OctraAddress, fee_bps: u64) -> Self {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        // Always sort tokens to ensure canonical ordering
        let (a, b) = if token0.0 <= token1.0 {
            (token0, token1)
        } else {
            (token1, token0)
        };
        hasher.update(a.0.as_bytes());
        hasher.update(b.0.as_bytes());
        hasher.update(fee_bps.to_le_bytes());
        let result = hasher.finalize();
        let mut id = [0u8; 32];
        id.copy_from_slice(&result);
        Self(id)
    }

    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

/// Token metadata for display
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct TokenInfo {
    pub address: OctraAddress,
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
}

// ============================================================================
// Pool State (All reserves encrypted)
// ============================================================================

/// Complete state of a liquidity pool — core of OctraShieldPair
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolState {
    /// Pool unique identifier
    pub pool_id: PoolId,

    /// Token addresses (sorted: token0 < token1 lexicographically)
    pub token0: OctraAddress,
    pub token1: OctraAddress,

    /// Fee tier in basis points (public — determines tick spacing)
    pub fee_bps: u64,

    /// ENCRYPTED reserves — the heart of privacy
    pub reserve0: EncryptedU64,
    pub reserve1: EncryptedU64,

    /// ENCRYPTED constant product invariant: k = reserve0 * reserve1
    pub k_last: EncryptedU64,

    /// Current tick index (PUBLIC — needed for routing)
    pub current_tick: i32,

    /// ENCRYPTED sqrt price (Q32.32 fixed point)
    pub sqrt_price: EncryptedU64,

    /// ENCRYPTED total liquidity in the active tick range
    pub liquidity: EncryptedU64,

    /// ENCRYPTED cumulative fees for each token
    pub fee_growth_global0: EncryptedU64,
    pub fee_growth_global1: EncryptedU64,

    /// ENCRYPTED protocol fee accumulator
    pub protocol_fees0: EncryptedU64,
    pub protocol_fees1: EncryptedU64,

    /// LP token contract address
    pub lp_token: OctraAddress,

    /// Pool creation timestamp
    pub created_at: u64,

    /// Whether AI-managed dynamic fees are enabled
    pub ai_fee_enabled: bool,

    /// Current AI-adjusted fee (if ai_fee_enabled)
    pub ai_fee_bps: Option<u64>,

    /// Block number of last swap (for staleness checks)
    pub last_swap_block: u64,

    /// Total number of swaps (public counter for analytics)
    pub swap_count: u64,

    /// Whether the pool is paused (emergency circuit breaker)
    pub paused: bool,
}

// ============================================================================
// Concentrated Liquidity Position
// ============================================================================

/// A user's concentrated liquidity position
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Position {
    /// Position owner
    pub owner: OctraAddress,

    /// Pool this position belongs to
    pub pool_id: PoolId,

    /// Tick range boundaries
    pub tick_lower: i32,
    pub tick_upper: i32,

    /// ENCRYPTED liquidity amount
    pub liquidity: EncryptedU64,

    /// ENCRYPTED fee growth snapshots at position creation
    pub fee_growth_inside0_last: EncryptedU64,
    pub fee_growth_inside1_last: EncryptedU64,

    /// ENCRYPTED uncollected fees
    pub tokens_owed0: EncryptedU64,
    pub tokens_owed1: EncryptedU64,

    /// Position NFT ID (unique identifier)
    pub position_id: u64,

    /// Creation timestamp
    pub created_at: u64,
}

/// Tick state for concentrated liquidity
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct TickState {
    /// Tick index
    pub index: i32,

    /// ENCRYPTED net liquidity delta when this tick is crossed
    pub liquidity_net: EncryptedU64,

    /// ENCRYPTED gross liquidity referencing this tick
    pub liquidity_gross: EncryptedU64,

    /// ENCRYPTED fee growth outside this tick
    pub fee_growth_outside0: EncryptedU64,
    pub fee_growth_outside1: EncryptedU64,

    /// Whether this tick is initialized
    pub initialized: bool,
}

// ============================================================================
// Swap & Transaction Parameters
// ============================================================================

/// Parameters for executing a swap
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SwapParams {
    /// Pool to swap in
    pub pool_id: PoolId,

    /// Direction: true = token0 -> token1, false = token1 -> token0
    pub zero_for_one: bool,

    /// ENCRYPTED input amount
    pub amount_in: EncryptedU64,

    /// ENCRYPTED minimum output (slippage protection)
    pub amount_out_min: EncryptedU64,

    /// Deadline timestamp
    pub deadline: u64,

    /// Recipient address
    pub recipient: OctraAddress,

    /// Optional: price limit (sqrt price bound)
    pub sqrt_price_limit: Option<u64>,
}

/// Parameters for adding liquidity
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AddLiquidityParams {
    pub pool_id: PoolId,
    pub amount0_desired: EncryptedU64,
    pub amount1_desired: EncryptedU64,
    pub amount0_min: EncryptedU64,
    pub amount1_min: EncryptedU64,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub recipient: OctraAddress,
    pub deadline: u64,
}

/// Parameters for removing liquidity
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoveLiquidityParams {
    pub pool_id: PoolId,
    pub position_id: u64,
    pub liquidity_amount: EncryptedU64,
    pub amount0_min: EncryptedU64,
    pub amount1_min: EncryptedU64,
    pub recipient: OctraAddress,
    pub deadline: u64,
}

/// Multi-hop swap route
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SwapRoute {
    /// Ordered list of pools to swap through
    pub hops: Vec<SwapHop>,
    /// ENCRYPTED total input amount
    pub amount_in: EncryptedU64,
    /// ENCRYPTED minimum final output
    pub amount_out_min: EncryptedU64,
    pub recipient: OctraAddress,
    pub deadline: u64,
}

/// Single hop in a multi-hop swap
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SwapHop {
    pub pool_id: PoolId,
    pub zero_for_one: bool,
}

// ============================================================================
// Execution Context (OCS01)
// ============================================================================

/// Transaction execution context provided by the Octra runtime
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecContext {
    /// Transaction sender
    pub sender: OctraAddress,
    /// Contract being called
    pub contract_address: OctraAddress,
    /// Current block number
    pub block_number: u64,
    /// Current block timestamp (Unix seconds)
    pub block_timestamp: u64,
    /// Transaction hash
    pub tx_hash: [u8; 32],
    /// Network public key for HFHE operations
    pub network_pk: Vec<u8>,
    /// Current epoch number (for key rotation)
    pub epoch: u64,
}

// ============================================================================
// Contract Responses
// ============================================================================

/// Generic contract call response
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub events: Vec<ContractEvent>,
}

/// Contract event (emitted during state changes)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContractEvent {
    pub name: String,
    pub data: serde_json::Value,
}

impl ContractEvent {
    pub fn new(name: &str, data: serde_json::Value) -> Self {
        Self {
            name: name.to_string(),
            data,
        }
    }
}

// ============================================================================
// AI Engine Types
// ============================================================================

/// AI fee recommendation from the OctraShieldAI Circle
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiFeeRecommendation {
    pub pool_id: PoolId,
    pub recommended_fee_bps: u64,
    pub confidence: f64,
    pub volatility_score: f64,
    pub volume_trend: f64,
    pub timestamp: u64,
}

/// AI rebalance instruction
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiRebalanceInstruction {
    pub pool_id: PoolId,
    pub new_tick_lower: i32,
    pub new_tick_upper: i32,
    pub urgency: RebalanceUrgency,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum RebalanceUrgency {
    Low,
    Medium,
    High,
    Critical,
}

/// MEV threat assessment
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MevThreatLevel {
    pub sandwich_risk: f64,
    pub frontrun_risk: f64,
    pub overall_risk: f64,
    pub recommended_action: MevAction,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum MevAction {
    /// No threat detected — proceed normally
    Clear,
    /// Minor risk — increase fee slightly
    IncreaseFee(u64),
    /// Moderate risk — delay execution by N blocks
    Delay(u64),
    /// High risk — reject transaction
    Reject,
}