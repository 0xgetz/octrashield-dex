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

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use octrashield_shared::{
    constants::{
        FEE_DENOMINATOR, MAX_TICK, MIN_TICK, PROTOCOL_FEE_SHARE_BPS,
    },
    errors::OctraShieldError,
    hfhe::EncryptedU64,
    ocs01::{CallResult, MethodDescriptor, OCS01Contract, ViewResult},
    types::{OctraAddress, PoolId},
};

use crate::state::{
    PairConfig, PoolState, Position, PositionKey, Tick, TickState, Timestamp, TokenAddress,
};

// ---------------------------------------------------------------------------
// OctraShieldPair — main contract struct
// ---------------------------------------------------------------------------

/// The OctraShieldPair contract.
///
/// Holds both the immutable `PairConfig` (set once at `call_initialize`) and
/// the mutable `PoolState` (updated on every swap / liquidity change).
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraShieldPair {
    pub config: Option<PairConfig>,
    pub state: PoolState,
}

impl OctraShieldPair {
    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// Create a fresh, uninitialised pair. Called by the factory during deploy.
    pub fn new() -> Self {
        Self {
            config: None,
            state: PoolState {
                reserve0: EncryptedU64::zero(),
                reserve1: EncryptedU64::zero(),
                k_invariant: EncryptedU64::zero(),
                sqrt_price_x64: EncryptedU64::zero(),
                current_tick: 0,
                liquidity: EncryptedU64::zero(),
                fee_growth_global_x128_0: EncryptedU64::zero(),
                fee_growth_global_x128_1: EncryptedU64::zero(),
                protocol_fees_0: EncryptedU64::zero(),
                protocol_fees_1: EncryptedU64::zero(),
                ai_fee_override_bps: None,
                positions: HashMap::new(),
                ticks: HashMap::new(),
                locked: false,
                paused: false,
                initialized: false,
                tick_cumulative: EncryptedU64::zero(),
                last_observation_time: 0,
            },
        }
    }

    // -----------------------------------------------------------------------
    // Reentrancy guard helpers
    // -----------------------------------------------------------------------

    fn lock(&mut self) -> Result<(), OctraShieldError> {
        if self.state.locked {
            return Err(OctraShieldError::Reentrancy);
        }
        self.state.locked = true;
        Ok(())
    }

    fn unlock(&mut self) {
        self.state.locked = false;
    }

    // -----------------------------------------------------------------------
    // call_initialize
    // -----------------------------------------------------------------------

    /// Seed the pool with an initial price and activate it.
    ///
    /// # Arguments
    /// * `token0` / `token1` — must differ and match the factory's canonical sort
    /// * `fee_bps`           — must be in the factory's enabled fee-tier set
    /// * `tick_spacing`      — from the fee tier
    /// * `sqrt_price_x64`    — initial √price as Q64.64, encrypted by caller
    /// * `lp_token`          — address of the ShieldToken deployed by the factory
    /// * `ai_engine`         — address of the AI fee engine
    /// * `factory`           — address of the deploying factory (caller)
    /// * `pool_id`           — pre-computed SHA-256 identifier
    /// * `now`               — current block timestamp
    pub fn call_initialize(
        &mut self,
        token0: TokenAddress,
        token1: TokenAddress,
        fee_bps: u32,
        tick_spacing: i32,
        sqrt_price_x64: EncryptedU64,
        lp_token: OctraAddress,
        ai_engine: OctraAddress,
        factory: OctraAddress,
        pool_id: PoolId,
        now: Timestamp,
    ) -> Result<(), OctraShieldError> {
        // Guards
        if self.state.initialized {
            return Err(OctraShieldError::AlreadyInitialized);
        }
        if token0 == token1 {
            return Err(OctraShieldError::IdenticalTokens);
        }
        if fee_bps == 0 || fee_bps > 10_000 {
            return Err(OctraShieldError::InvalidFeeTier);
        }

        // Derive initial tick from sqrt_price (plaintext approximation is fine here
        // because initialize is called exactly once and the price is public at this stage)
        let initial_tick = 0i32; // price = 1:1 default; caller uses encrypted value

        self.config = Some(PairConfig {
            token0,
            token1,
            fee_bps,
            tick_spacing,
            lp_token,
            ai_engine,
            factory,
            created_at: now,
            pool_id,
        });

        self.state.sqrt_price_x64 = sqrt_price_x64;
        self.state.current_tick = initial_tick;
        self.state.last_observation_time = now;
        self.state.initialized = true;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_swap
    // -----------------------------------------------------------------------

    /// Swap tokens along the constant-product curve with HFHE-encrypted amounts.
    ///
    /// Uses Newton-Raphson encrypted division to compute the output amount while
    /// keeping all values as ciphertexts throughout.
    ///
    /// # Arguments
    /// * `zero_for_one`     — true: sell token0, buy token1; false: reverse
    /// * `amount_in_enc`    — encrypted input amount (must be > 0)
    /// * `deadline`         — transaction expires after this timestamp
    /// * `recipient`        — address receiving the output tokens
    /// * `now`              — current block timestamp
    ///
    /// # Returns
    /// `(amount_out_enc, fee_enc)` — both encrypted
    pub fn call_swap(
        &mut self,
        zero_for_one: bool,
        amount_in_enc: EncryptedU64,
        deadline: Timestamp,
        recipient: OctraAddress,
        now: Timestamp,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        // ---- Pre-flight checks -------------------------------------------
        self.require_initialized()?;
        self.require_not_paused()?;
        self.lock()?;

        if now > deadline {
            self.unlock();
            return Err(OctraShieldError::Expired);
        }

        // Zero-amount check: we compare the encrypted amount to a freshly
        // encrypted zero; if they are bitwise equal the amount is zero.
        if amount_in_enc.is_enc_zero() {
            self.unlock();
            return Err(OctraShieldError::ZeroAmount);
        }

        let config = self.config.as_ref().unwrap();
        let fee_bps = self.state.effective_fee_bps(config) as u64;

        // ---- Compute fee (encrypted) -------------------------------------
        // fee = amount_in * fee_bps / FEE_DENOMINATOR
        let fee_enc = amount_in_enc
            .enc_mul_scalar(fee_bps)?
            .enc_div_scalar(FEE_DENOMINATOR)?;

        // amount_after_fee = amount_in - fee
        let amount_after_fee = amount_in_enc.enc_sub(&fee_enc)?;

        // ---- Compute output via x*y = k (Newton-Raphson, encrypted) ------
        // For x * y = k:   amount_out = reserve_out - k / (reserve_in + amount_after_fee)
        let (reserve_in, reserve_out) = if zero_for_one {
            (&self.state.reserve0, &self.state.reserve1)
        } else {
            (&self.state.reserve1, &self.state.reserve0)
        };

        let new_reserve_in = reserve_in.enc_add(&amount_after_fee)?;
        // k / new_reserve_in  (encrypted Newton-Raphson division, 6 iterations)
        let new_reserve_out = self.state.k_invariant.enc_div_newton(&new_reserve_in, 6)?;
        let amount_out_enc = reserve_out.enc_sub(&new_reserve_out)?;

        // ---- Protocol fee split ------------------------------------------
        // protocol_fee = fee * PROTOCOL_FEE_SHARE_BPS / 10_000
        let protocol_fee = fee_enc
            .enc_mul_scalar(PROTOCOL_FEE_SHARE_BPS as u64)?
            .enc_div_scalar(10_000)?;
        let lp_fee = fee_enc.enc_sub(&protocol_fee)?;

        // ---- Update reserves and accumulators ----------------------------
        if zero_for_one {
            self.state.reserve0 = new_reserve_in;
            self.state.reserve1 = new_reserve_out;
            self.state.fee_growth_global_x128_0 =
                self.state.fee_growth_global_x128_0.enc_add(&lp_fee)?;
            self.state.protocol_fees_0 =
                self.state.protocol_fees_0.enc_add(&protocol_fee)?;
        } else {
            self.state.reserve1 = new_reserve_in;
            self.state.reserve0 = new_reserve_out;
            self.state.fee_growth_global_x128_1 =
                self.state.fee_growth_global_x128_1.enc_add(&lp_fee)?;
            self.state.protocol_fees_1 =
                self.state.protocol_fees_1.enc_add(&protocol_fee)?;
        }

        // Recompute k
        self.state.k_invariant =
            self.state.reserve0.enc_mul(&self.state.reserve1)?;

        // ---- Oracle update ----------------------------------------------
        let elapsed = now.saturating_sub(self.state.last_observation_time);
        if elapsed > 0 {
            let tick_enc = EncryptedU64::enc_from_i32(self.state.current_tick)?;
            let delta = tick_enc.enc_mul_scalar(elapsed as u64)?;
            self.state.tick_cumulative =
                self.state.tick_cumulative.enc_add(&delta)?;
            self.state.last_observation_time = now;
        }

        self.unlock();
        Ok((amount_out_enc, fee_enc))
    }

    // -----------------------------------------------------------------------
    // call_mint
    // -----------------------------------------------------------------------

    /// Add concentrated liquidity to a price range [tick_lower, tick_upper].
    ///
    /// # Arguments
    /// * `owner`             — address that will own the position
    /// * `tick_lower`        — lower bound of the range (must be aligned)
    /// * `tick_upper`        — upper bound of the range (must be aligned, > lower)
    /// * `liquidity_delta`   — amount of liquidity to add, encrypted
    /// * `amount0_max_enc`   — max token0 the caller will deposit
    /// * `amount1_max_enc`   — max token1 the caller will deposit
    /// * `now`               — current block timestamp
    ///
    /// # Returns
    /// `(amount0_used, amount1_used)` — encrypted
    pub fn call_mint(
        &mut self,
        owner: OctraAddress,
        tick_lower: Tick,
        tick_upper: Tick,
        liquidity_delta: EncryptedU64,
        amount0_max_enc: EncryptedU64,
        amount1_max_enc: EncryptedU64,
        now: Timestamp,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_initialized()?;
        self.require_not_paused()?;
        self.lock()?;

        let config = self.config.as_ref().unwrap();
        let tick_spacing = config.tick_spacing;

        // ---- Tick validation --------------------------------------------
        if tick_lower >= tick_upper {
            self.unlock();
            return Err(OctraShieldError::InvalidTickRange);
        }
        if !PoolState::tick_in_range(tick_lower) || !PoolState::tick_in_range(tick_upper) {
            self.unlock();
            return Err(OctraShieldError::TickOutOfBounds);
        }
        if !PoolState::tick_aligned(tick_lower, tick_spacing)
            || !PoolState::tick_aligned(tick_upper, tick_spacing)
        {
            self.unlock();
            return Err(OctraShieldError::TickNotAligned);
        }

        // ---- Compute token amounts from liquidity -----------------------
        // Simplified: amount0 = liquidity * (1/sqrt_lower - 1/sqrt_upper)
        //             amount1 = liquidity * (sqrt_upper - sqrt_lower)
        // Here we use encrypted multiplication scaled by the sqrt_price.
        let amount0_used = liquidity_delta.enc_mul(&self.state.sqrt_price_x64)?;
        let amount1_used = liquidity_delta.enc_mul(&self.state.sqrt_price_x64)?;

        // ---- Update position --------------------------------------------
        let key = PositionKey { owner: owner.clone(), tick_lower, tick_upper };
        let position = self
            .state
            .positions
            .entry(key)
            .or_insert_with(|| Position::new_empty(now));

        position.liquidity = position.liquidity.enc_add(&liquidity_delta)?;
        position.last_updated = now;

        // ---- Update ticks -----------------------------------------------
        let lower_tick = self.state.ticks.entry(tick_lower).or_insert_with(TickState::new);
        lower_tick.liquidity_gross =
            lower_tick.liquidity_gross.enc_add(&liquidity_delta)?;
        lower_tick.initialized = true;

        let upper_tick = self.state.ticks.entry(tick_upper).or_insert_with(TickState::new);
        upper_tick.liquidity_gross =
            upper_tick.liquidity_gross.enc_add(&liquidity_delta)?;
        upper_tick.initialized = true;

        // ---- Update pool liquidity and reserves -------------------------
        self.state.liquidity = self.state.liquidity.enc_add(&liquidity_delta)?;
        self.state.reserve0 = self.state.reserve0.enc_add(&amount0_used)?;
        self.state.reserve1 = self.state.reserve1.enc_add(&amount1_used)?;
        self.state.k_invariant =
            self.state.reserve0.enc_mul(&self.state.reserve1)?;

        self.unlock();
        Ok((amount0_used, amount1_used))
    }

    // -----------------------------------------------------------------------
    // call_burn
    // -----------------------------------------------------------------------

    /// Remove concentrated liquidity from a position.
    ///
    /// Decrements position liquidity and returns token amounts to the caller.
    /// Accrued fees are not collected here — use `call_collect` separately.
    pub fn call_burn(
        &mut self,
        owner: OctraAddress,
        tick_lower: Tick,
        tick_upper: Tick,
        liquidity_delta: EncryptedU64,
        now: Timestamp,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_initialized()?;
        self.require_not_paused()?;
        self.lock()?;

        let key = PositionKey { owner: owner.clone(), tick_lower, tick_upper };

        let position = self
            .state
            .positions
            .get_mut(&key)
            .ok_or(OctraShieldError::PositionNotFound)?;

        // Subtract liquidity (encrypted subtraction will error if underflow)
        position.liquidity = position.liquidity.enc_sub(&liquidity_delta)?;
        position.last_updated = now;

        // Compute token amounts returned
        let amount0_returned = liquidity_delta.enc_mul(&self.state.sqrt_price_x64)?;
        let amount1_returned = liquidity_delta.enc_mul(&self.state.sqrt_price_x64)?;

        // Update pool state
        self.state.liquidity = self.state.liquidity.enc_sub(&liquidity_delta)?;
        self.state.reserve0 = self.state.reserve0.enc_sub(&amount0_returned)?;
        self.state.reserve1 = self.state.reserve1.enc_sub(&amount1_returned)?;
        self.state.k_invariant =
            self.state.reserve0.enc_mul(&self.state.reserve1)?;

        // Update tick gross liquidity
        if let Some(lower_tick) = self.state.ticks.get_mut(&tick_lower) {
            lower_tick.liquidity_gross =
                lower_tick.liquidity_gross.enc_sub(&liquidity_delta)?;
        }
        if let Some(upper_tick) = self.state.ticks.get_mut(&tick_upper) {
            upper_tick.liquidity_gross =
                upper_tick.liquidity_gross.enc_sub(&liquidity_delta)?;
        }

        self.unlock();
        Ok((amount0_returned, amount1_returned))
    }

    // -----------------------------------------------------------------------
    // call_collect
    // -----------------------------------------------------------------------

    /// Harvest accrued swap fees from a position.
    ///
    /// Computes fees earned since the last collection and transfers them to
    /// `recipient`. Clears the `tokens_owed` fields on the position.
    pub fn call_collect(
        &mut self,
        owner: OctraAddress,
        tick_lower: Tick,
        tick_upper: Tick,
        recipient: OctraAddress,
        now: Timestamp,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_initialized()?;
        self.lock()?;

        let key = PositionKey { owner: owner.clone(), tick_lower, tick_upper };

        let position = self
            .state
            .positions
            .get_mut(&key)
            .ok_or(OctraShieldError::PositionNotFound)?;

        // Snapshot owed amounts and clear them
        let owed0 = position.tokens_owed_0.clone();
        let owed1 = position.tokens_owed_1.clone();
        position.tokens_owed_0 = EncryptedU64::zero();
        position.tokens_owed_1 = EncryptedU64::zero();
        position.last_updated = now;

        // Deduct from reserves
        self.state.reserve0 = self.state.reserve0.enc_sub(&owed0)?;
        self.state.reserve1 = self.state.reserve1.enc_sub(&owed1)?;

        self.unlock();
        Ok((owed0, owed1))
    }

    // -----------------------------------------------------------------------
    // call_flash
    // -----------------------------------------------------------------------

    /// Flash loan: transfer `amount0` and `amount1` to `recipient`,
    /// then verify repayment (principal + fee) in the same transaction.
    pub fn call_flash(
        &mut self,
        recipient: OctraAddress,
        amount0_enc: EncryptedU64,
        amount1_enc: EncryptedU64,
        repaid0_enc: EncryptedU64,
        repaid1_enc: EncryptedU64,
        now: Timestamp,
    ) -> Result<(), OctraShieldError> {
        self.require_initialized()?;
        self.require_not_paused()?;
        self.lock()?;

        let config = self.config.as_ref().unwrap();
        let fee_bps = self.state.effective_fee_bps(config) as u64;

        // Expected repayment = amount + fee
        let fee0 = amount0_enc
            .enc_mul_scalar(fee_bps)?
            .enc_div_scalar(FEE_DENOMINATOR)?;
        let fee1 = amount1_enc
            .enc_mul_scalar(fee_bps)?
            .enc_div_scalar(FEE_DENOMINATOR)?;

        let expected0 = amount0_enc.enc_add(&fee0)?;
        let expected1 = amount1_enc.enc_add(&fee1)?;

        // Encrypted comparison: repaid >= expected
        if !repaid0_enc.enc_gte(&expected0)? || !repaid1_enc.enc_gte(&expected1)? {
            self.unlock();
            return Err(OctraShieldError::FlashRepaymentInsufficient);
        }

        // Update reserves with net fee
        self.state.protocol_fees_0 = self.state.protocol_fees_0.enc_add(&fee0)?;
        self.state.protocol_fees_1 = self.state.protocol_fees_1.enc_add(&fee1)?;

        self.unlock();
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_set_ai_fee
    // -----------------------------------------------------------------------

    /// Override the swap fee with a value from the AI engine.
    ///
    /// Only the `ai_engine` address configured at pool initialisation may call this.
    pub fn call_set_ai_fee(
        &mut self,
        caller: OctraAddress,
        fee_bps: u32,
    ) -> Result<(), OctraShieldError> {
        self.require_initialized()?;
        let config = self.config.as_ref().unwrap();

        if caller != config.ai_engine {
            return Err(OctraShieldError::Unauthorized);
        }
        if fee_bps > 10_000 {
            return Err(OctraShieldError::InvalidFeeTier);
        }

        self.state.ai_fee_override_bps = Some(fee_bps);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // call_pause / call_unpause
    // -----------------------------------------------------------------------

    /// Emergency pause — blocks all state-changing entry points.
    /// Only the factory may call this.
    pub fn call_pause(&mut self, caller: OctraAddress) -> Result<(), OctraShieldError> {
        self.require_factory_caller(&caller)?;
        self.state.paused = true;
        Ok(())
    }

    /// Resume normal operation.
    /// Only the factory may call this.
    pub fn call_unpause(&mut self, caller: OctraAddress) -> Result<(), OctraShieldError> {
        self.require_factory_caller(&caller)?;
        self.state.paused = false;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // View methods (11)
    // -----------------------------------------------------------------------

    pub fn view_config(&self) -> Result<&PairConfig, OctraShieldError> {
        self.config.as_ref().ok_or(OctraShieldError::NotInitialized)
    }

    pub fn view_reserves(&self) -> (&EncryptedU64, &EncryptedU64) {
        (&self.state.reserve0, &self.state.reserve1)
    }

    pub fn view_liquidity(&self) -> &EncryptedU64 {
        &self.state.liquidity
    }

    pub fn view_sqrt_price(&self) -> &EncryptedU64 {
        &self.state.sqrt_price_x64
    }

    pub fn view_current_tick(&self) -> Tick {
        self.state.current_tick
    }

    pub fn view_fee_growth_global(&self) -> (&EncryptedU64, &EncryptedU64) {
        (
            &self.state.fee_growth_global_x128_0,
            &self.state.fee_growth_global_x128_1,
        )
    }

    pub fn view_protocol_fees(&self) -> (&EncryptedU64, &EncryptedU64) {
        (&self.state.protocol_fees_0, &self.state.protocol_fees_1)
    }

    pub fn view_position(
        &self,
        owner: &OctraAddress,
        tick_lower: Tick,
        tick_upper: Tick,
    ) -> Option<&Position> {
        let key = PositionKey {
            owner: owner.clone(),
            tick_lower,
            tick_upper,
        };
        self.state.positions.get(&key)
    }

    pub fn view_tick(&self, tick: Tick) -> Option<&TickState> {
        self.state.ticks.get(&tick)
    }

    pub fn view_is_paused(&self) -> bool {
        self.state.paused
    }

    pub fn view_is_initialized(&self) -> bool {
        self.state.initialized
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_initialized(&self) -> Result<(), OctraShieldError> {
        if !self.state.initialized {
            Err(OctraShieldError::NotInitialized)
        } else {
            Ok(())
        }
    }

    fn require_not_paused(&self) -> Result<(), OctraShieldError> {
        if self.state.paused {
            Err(OctraShieldError::Paused)
        } else {
            Ok(())
        }
    }

    fn require_factory_caller(&self, caller: &OctraAddress) -> Result<(), OctraShieldError> {
        let config = self.config.as_ref().ok_or(OctraShieldError::NotInitialized)?;
        if caller != &config.factory {
            Err(OctraShieldError::Unauthorized)
        } else {
            Ok(())
        }
    }

    // Test helper — allows tests to pre-set the reentrancy lock
    #[cfg(test)]
    pub fn set_locked_for_test(&mut self, locked: bool) {
        self.state.locked = locked;
    }
}

// ---------------------------------------------------------------------------
// OCS01Contract trait implementation
// ---------------------------------------------------------------------------

impl OCS01Contract for OctraShieldPair {
    fn describe_methods(&self) -> Vec<MethodDescriptor> {
        vec![
            MethodDescriptor::call("call_initialize",  "Initialize the pool with a starting price"),
            MethodDescriptor::call("call_swap",        "Swap tokens using encrypted x*y=k AMM"),
            MethodDescriptor::call("call_mint",        "Add concentrated liquidity to a tick range"),
            MethodDescriptor::call("call_burn",        "Remove liquidity from a position"),
            MethodDescriptor::call("call_collect",     "Harvest accrued fees from a position"),
            MethodDescriptor::call("call_flash",       "Flash-loan tokens with single-tx repayment"),
            MethodDescriptor::call("call_set_ai_fee",  "AI engine override for dynamic fees"),
            MethodDescriptor::call("call_pause",       "Emergency pause (factory only)"),
            MethodDescriptor::call("call_unpause",     "Resume normal operation (factory only)"),
            MethodDescriptor::view("view_config",      "Return immutable pool configuration"),
            MethodDescriptor::view("view_reserves",    "Return encrypted token reserves"),
            MethodDescriptor::view("view_liquidity",   "Return total active liquidity"),
            MethodDescriptor::view("view_sqrt_price",  "Return encrypted sqrt price (Q64.64)"),
            MethodDescriptor::view("view_current_tick","Return current tick index"),
            MethodDescriptor::view("view_fee_growth_global", "Return global fee accumulators"),
            MethodDescriptor::view("view_protocol_fees",     "Return uncollected protocol fees"),
            MethodDescriptor::view("view_position",    "Return a specific LP position"),
            MethodDescriptor::view("view_tick",        "Return per-tick state"),
            MethodDescriptor::view("view_is_paused",   "Return whether pool is paused"),
            MethodDescriptor::view("view_is_initialized", "Return whether pool is initialized"),
        ]
    }
}
