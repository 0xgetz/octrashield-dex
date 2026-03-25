//! Error types for OctraShield DEX contracts

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ShieldError {
    // ===== HFHE Errors =====
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("HFHE arithmetic error: {0}")]
    ArithmeticError(String),

    #[error("Ciphertext depth exceeded maximum: {0} > MAX_DEPTH")]
    DepthExceeded(u32),

    #[error("Noise budget exhausted — ciphertext needs refresh")]
    NoiseBudgetExhausted,

    #[error("Ciphertext refresh failed: {0}")]
    RefreshFailed(String),

    #[error("Key generation failed: {0}")]
    KeygenFailed(String),

    #[error("Division by zero in encrypted arithmetic")]
    DivisionByZero,

    // ===== Pool Errors =====
    #[error("Pool not found: {0}")]
    PoolNotFound(String),

    #[error("Pool already exists for this token pair and fee tier")]
    PoolAlreadyExists,

    #[error("Pool is paused — emergency circuit breaker active")]
    PoolPaused,

    #[error("Invalid fee tier: {0} bps")]
    InvalidFeeTier(u64),

    #[error("Identical token addresses")]
    IdenticalTokens,

    #[error("Invalid token address: {0}")]
    InvalidAddress(String),

    // ===== Swap Errors =====
    #[error("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[error("Transaction deadline expired")]
    DeadlineExpired,

    #[error("Insufficient liquidity for this swap")]
    InsufficientLiquidity,

    #[error("Swap would violate constant product invariant")]
    InvariantViolation,

    #[error("Price limit reached")]
    PriceLimitReached,

    #[error("Maximum swap hops exceeded: {0}")]
    MaxHopsExceeded(usize),

    #[error("Zero input amount")]
    ZeroAmount,

    // ===== Liquidity Errors =====
    #[error("Invalid tick range: lower={0}, upper={1}")]
    InvalidTickRange(i32, i32),

    #[error("Tick {0} is not aligned to spacing {1}")]
    TickNotAligned(i32, i32),

    #[error("Tick out of bounds: {0}")]
    TickOutOfBounds(i32),

    #[error("Position not found: {0}")]
    PositionNotFound(u64),

    #[error("Insufficient liquidity in position")]
    InsufficientPositionLiquidity,

    #[error("Minimum liquidity not met")]
    MinimumLiquidityNotMet,

    // ===== Token Errors =====
    #[error("Insufficient encrypted balance")]
    InsufficientBalance,

    #[error("Transfer to zero address not allowed")]
    TransferToZero,

    #[error("Allowance exceeded")]
    AllowanceExceeded,

    #[error("Token already initialized")]
    AlreadyInitialized,

    // ===== Auth Errors =====
    #[error("Unauthorized: caller is not the owner")]
    Unauthorized,

    #[error("Invalid Ed25519 signature")]
    InvalidSignature,

    #[error("Caller is not the factory contract")]
    NotFactory,

    #[error("Caller is not the router contract")]
    NotRouter,

    #[error("Caller is not the AI engine")]
    NotAiEngine,

    // ===== AI Engine Errors =====
    #[error("AI fee recommendation out of bounds: {0} bps")]
    AiFeeOutOfBounds(u64),

    #[error("AI Circle execution failed: {0}")]
    AiCircleError(String),

    #[error("Insufficient observation history for AI analysis")]
    InsufficientObservations,

    // ===== General =====
    #[error("Contract not initialized")]
    NotInitialized,

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<serde_json::Error> for ShieldError {
    fn from(e: serde_json::Error) -> Self {
        ShieldError::SerializationError(e.to_string())
    }
}

impl From<borsh::io::Error> for ShieldError {
    fn from(e: borsh::io::Error) -> Self {
        ShieldError::SerializationError(e.to_string())
    }
}

/// Result type alias for OctraShield operations
pub type ShieldResult<T> = Result<T, ShieldError>;
