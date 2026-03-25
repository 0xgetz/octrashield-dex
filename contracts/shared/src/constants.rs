//! Global constants for OctraShield DEX

/// Mersenne prime field: p = 2^127 - 1
pub const MERSENNE_PRIME: u128 = (1u128 << 127) - 1;

/// Fee tier basis points (1 bp = 0.01%)
pub const FEE_TIER_001: u64 = 1;     // 0.01% — stablecoin pairs
pub const FEE_TIER_005: u64 = 5;     // 0.05% — correlated assets
pub const FEE_TIER_030: u64 = 30;    // 0.30% — standard pairs
pub const FEE_TIER_100: u64 = 100;   // 1.00% — exotic/volatile pairs

/// Tick spacing per fee tier
pub const TICK_SPACING_001: i32 = 1;
pub const TICK_SPACING_005: i32 = 10;
pub const TICK_SPACING_030: i32 = 60;
pub const TICK_SPACING_100: i32 = 200;

/// Concentrated liquidity boundaries
pub const MIN_TICK: i32 = -887_272;
pub const MAX_TICK: i32 = 887_272;

/// Minimum liquidity locked forever (prevents division-by-zero)
pub const MINIMUM_LIQUIDITY: u64 = 1_000;

/// Maximum number of hops in a multi-hop swap route
pub const MAX_SWAP_HOPS: usize = 4;

/// HFHE noise budget threshold — operations below this must trigger reencryption
pub const NOISE_BUDGET_THRESHOLD: u32 = 50;

/// Maximum depth for HFHE ciphertext operations before refresh
pub const MAX_HFHE_DEPTH: u32 = 12;

/// AI Engine: EMA smoothing windows
pub const VOLATILITY_EMA_SHORT: u64 = 12;
pub const VOLATILITY_EMA_LONG: u64 = 26;

/// AI Engine: Fee adjustment bounds (basis points)
pub const AI_MIN_FEE_BPS: u64 = 1;
pub const AI_MAX_FEE_BPS: u64 = 500;

/// Protocol fee: 1/6th of LP fees (configurable by governance)
pub const PROTOCOL_FEE_FRACTION: u64 = 6;

/// Contract version identifiers
pub const VERSION_FACTORY: &str = "0.1.0";
pub const VERSION_PAIR: &str = "0.1.0";
pub const VERSION_ROUTER: &str = "0.1.0";
pub const VERSION_AI_ENGINE: &str = "0.1.0";
pub const VERSION_SHIELD_TOKEN: &str = "0.1.0";

/// OCS01 standard method prefixes
pub const OCS01_VIEW_PREFIX: &str = "view_";
pub const OCS01_CALL_PREFIX: &str = "call_";

/// Octra address prefix
pub const ADDR_PREFIX: &str = "oct";

/// Tick spacing lookup
pub fn tick_spacing_for_fee(fee_bps: u64) -> i32 {
    match fee_bps {
        1 => TICK_SPACING_001,
        5 => TICK_SPACING_005,
        30 => TICK_SPACING_030,
        100 => TICK_SPACING_100,
        _ => TICK_SPACING_030, // default
    }
}

/// Validate a fee tier is supported
pub fn is_valid_fee_tier(fee_bps: u64) -> bool {
    matches!(fee_bps, 1 | 5 | 30 | 100)
}
