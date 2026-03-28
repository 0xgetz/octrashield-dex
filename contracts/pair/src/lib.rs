//! OctraShieldPair — Concentrated-Liquidity AMM Pair Contract
//!
//! This is the core trading contract of OctraShield DEX. It implements a hybrid
//! constant-product + concentrated-liquidity AMM (Uniswap V3 style) where every
//! numeric value (reserves, amounts, fees, prices) is stored and computed as an
//! HFHE-encrypted ciphertext. Validators never see plaintext balances.
//!
//! Entry points (OCS01 call_ / view_ convention):
//!   call_initialize   — seed the pool with an initial √price
//!   call_swap         — exchange token0 ↔ token1
//!   call_mint         — add concentrated liquidity to a [lower, upper] range
//!   call_burn         — remove liquidity from a position
//!   call_collect      — harvest accrued fees from a position
//!   call_flash        — flash-loan tokens with single-tx repayment
//!   call_set_ai_fee   — AI engine overrides the dynamic fee
//!   call_pause        — factory-only emergency pause
//!   call_unpause      — factory-only resume
//!   view_*            — 11 read-only queries

mod contract;
mod state;
#[cfg(test)]
mod tests;

pub use contract::OctraShieldPair;
pub use state::{
    PairConfig, PoolState, Position, PositionKey, Tick, TickState, Timestamp, TokenAddress,
};
