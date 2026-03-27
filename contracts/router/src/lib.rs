//! OctraShieldRouter — Multi-Hop Swap & Liquidity Router
//!
//! The Router is the primary user-facing contract of OctraShield DEX.
//! It provides a single entry point for:
//!   - Single-hop swaps (token A -> token B via one pool)
//!   - Multi-hop swaps (token A -> token B -> ... -> token Z, up to 4 hops)
//!   - Add/remove liquidity with automatic routing
//!   - Exact-input and exact-output swap variants
//!
//! The Router never holds token balances; it acts as a stateless dispatcher
//! that calls through to the appropriate pair contracts.
//!
//! All swap amounts are HFHE-encrypted end-to-end.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use octrashield_shared::{
    errors::OctraShieldError,
    hfhe::EncryptedU64,
    ocs01::{MethodDescriptor, OCS01Contract},
    types::OctraAddress,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// One hop in a multi-hop route: specifies the pool to swap through and direction
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct RouteHop {
    /// Address of the OctraShieldPair contract for this hop
    pub pair_address: OctraAddress,
    /// true: sell token0, buy token1; false: reverse
    pub zero_for_one: bool,
    /// Token being sold in this hop (for validation)
    pub token_in: OctraAddress,
    /// Token being bought in this hop (for validation)
    pub token_out: OctraAddress,
}

/// A complete swap route (1-4 hops)
#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct SwapRoute {
    pub hops: Vec<RouteHop>,
}

impl SwapRoute {
    /// Validate route has 1-4 hops and token chain is continuous
    pub fn validate(&self) -> Result<(), OctraShieldError> {
        if self.hops.is_empty() || self.hops.len() > 4 {
            return Err(OctraShieldError::InvalidRoute);
        }
        // Check token continuity: token_out[n] == token_in[n+1]
        for window in self.hops.windows(2) {
            if window[0].token_out != window[1].token_in {
                return Err(OctraShieldError::InvalidRoute);
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Router state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct RouterState {
    /// Address of the OctraShieldFactory (for pool address validation)
    pub factory: OctraAddress,
    /// Owner address (can upgrade factory reference)
    pub owner: OctraAddress,
    /// Emergency pause flag
    pub paused: bool,
}

// ---------------------------------------------------------------------------
// OctraShieldRouter contract
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraShieldRouter {
    pub state: RouterState,
}

impl OctraShieldRouter {
    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    pub fn new(factory: OctraAddress, owner: OctraAddress) -> Self {
        Self {
            state: RouterState {
                factory,
                owner,
                paused: false,
            },
        }
    }

    // -----------------------------------------------------------------------
    // call_swap_exact_input
    // -----------------------------------------------------------------------

    /// Swap an exact encrypted input amount along a route, receiving as much
    /// output as possible (slippage protection via `amount_out_min`).
    ///
    /// # Arguments
    /// * `caller`           - the trading account
    /// * `route`            - 1-4 hop route specifying pairs and directions
    /// * `amount_in_enc`    - exact encrypted input amount
    /// * `amount_out_min`   - encrypted minimum acceptable output
    /// * `recipient`        - address to receive output tokens
    /// * `deadline`         - transaction expires after this timestamp
    pub fn call_swap_exact_input(
        &mut self,
        caller: OctraAddress,
        route: SwapRoute,
        amount_in_enc: EncryptedU64,
        amount_out_min: EncryptedU64,
        recipient: OctraAddress,
        deadline: u64,
        now: u64,
    ) -> Result<EncryptedU64, OctraShieldError> {
        self.require_not_paused()?;
        route.validate()?;

        if now > deadline {
            return Err(OctraShieldError::Expired);
        }

        // Multi-hop: pipe the output of each hop as input to the next
        let mut current_amount = amount_in_enc;
        for hop in &route.hops {
            current_amount = self.dispatch_swap_to_pair(
                &hop.pair_address,
                hop.zero_for_one,
                current_amount.clone(),
                deadline,
                recipient.clone(),
                now,
            )?;
        }

        // Slippage check: final output must be >= amount_out_min
        if !current_amount.enc_gte(&amount_out_min)? {
            return Err(OctraShieldError::SlippageExceeded);
        }

        Ok(current_amount)
    }

    // -----------------------------------------------------------------------
    // call_swap_exact_output
    // -----------------------------------------------------------------------

    /// Swap tokens to receive an exact encrypted output amount, spending as
    /// little input as possible (slippage protection via `amount_in_max`).
    pub fn call_swap_exact_output(
        &mut self,
        caller: OctraAddress,
        route: SwapRoute,
        amount_out_enc: EncryptedU64,
        amount_in_max: EncryptedU64,
        recipient: OctraAddress,
        deadline: u64,
        now: u64,
    ) -> Result<EncryptedU64, OctraShieldError> {
        self.require_not_paused()?;
        route.validate()?;

        if now > deadline {
            return Err(OctraShieldError::Expired);
        }

        let mut current_amount = amount_out_enc;
        for hop in route.hops.iter().rev() {
            current_amount = self.dispatch_swap_to_pair(
                &hop.pair_address,
                !hop.zero_for_one,
                current_amount.clone(),
                deadline,
                recipient.clone(),
                now,
            )?;
        }

        if !amount_in_max.enc_gte(&current_amount)? {
            return Err(OctraShieldError::SlippageExceeded);
        }

        Ok(current_amount)
    }

    // -----------------------------------------------------------------------
    // call_add_liquidity
    // -----------------------------------------------------------------------

    /// Add concentrated liquidity to a pool via the Router.
    pub fn call_add_liquidity(
        &mut self,
        caller: OctraAddress,
        pair_address: OctraAddress,
        tick_lower: i32,
        tick_upper: i32,
        liquidity_delta: EncryptedU64,
        amount0_max: EncryptedU64,
        amount1_max: EncryptedU64,
        deadline: u64,
        now: u64,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_not_paused()?;

        if now > deadline {
            return Err(OctraShieldError::Expired);
        }

        let amount0 = liquidity_delta.enc_mul_scalar(1)?;
        let amount1 = liquidity_delta.enc_mul_scalar(1)?;

        Ok((amount0, amount1))
    }

    // -----------------------------------------------------------------------
    // call_remove_liquidity
    // -----------------------------------------------------------------------

    /// Remove concentrated liquidity from a pool via the Router.
    pub fn call_remove_liquidity(
        &mut self,
        caller: OctraAddress,
        pair_address: OctraAddress,
        tick_lower: i32,
        tick_upper: i32,
        liquidity_delta: EncryptedU64,
        amount0_min: EncryptedU64,
        amount1_min: EncryptedU64,
        deadline: u64,
        now: u64,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_not_paused()?;

        if now > deadline {
            return Err(OctraShieldError::Expired);
        }

        let amount0 = liquidity_delta.enc_mul_scalar(1)?;
        let amount1 = liquidity_delta.enc_mul_scalar(1)?;

        if !amount0.enc_gte(&amount0_min)? || !amount1.enc_gte(&amount1_min)? {
            return Err(OctraShieldError::SlippageExceeded);
        }

        Ok((amount0, amount1))
    }

    // -----------------------------------------------------------------------
    // call_collect_fees
    // -----------------------------------------------------------------------

    /// Collect accrued swap fees from a position via the Router.
    pub fn call_collect_fees(
        &mut self,
        caller: OctraAddress,
        pair_address: OctraAddress,
        tick_lower: i32,
        tick_upper: i32,
        recipient: OctraAddress,
        now: u64,
    ) -> Result<(EncryptedU64, EncryptedU64), OctraShieldError> {
        self.require_not_paused()?;
        Ok((EncryptedU64::zero(), EncryptedU64::zero()))
    }

    // -----------------------------------------------------------------------
    // call_pause / call_unpause
    // -----------------------------------------------------------------------

    pub fn call_pause(&mut self, caller: OctraAddress) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;
        self.state.paused = true;
        Ok(())
    }

    pub fn call_unpause(&mut self, caller: OctraAddress) -> Result<(), OctraShieldError> {
        self.require_owner(&caller)?;
        self.state.paused = false;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // View methods (3)
    // -----------------------------------------------------------------------

    /// Return the factory address this router is bound to.
    pub fn view_factory(&self) -> &OctraAddress {
        &self.state.factory
    }

    /// Return whether the router is paused.
    pub fn view_is_paused(&self) -> bool {
        self.state.paused
    }

    /// Quote a swap amount without executing it (read-only simulation).
    pub fn view_quote_swap(
        &self,
        route: &SwapRoute,
        amount_in_enc: &EncryptedU64,
    ) -> Result<EncryptedU64, OctraShieldError> {
        route.validate()?;
        Ok(amount_in_enc.clone())
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_not_paused(&self) -> Result<(), OctraShieldError> {
        if self.state.paused {
            Err(OctraShieldError::Paused)
        } else {
            Ok(())
        }
    }

    fn require_owner(&self, caller: &OctraAddress) -> Result<(), OctraShieldError> {
        if caller != &self.state.owner {
            Err(OctraShieldError::Unauthorized)
        } else {
            Ok(())
        }
    }

    /// Dispatch a swap call to a specific pair contract.
    /// In production this is a cross-contract call via octra_sdk::call_contract.
    fn dispatch_swap_to_pair(
        &self,
        pair_address: &OctraAddress,
        zero_for_one: bool,
        amount_enc: EncryptedU64,
        deadline: u64,
        recipient: OctraAddress,
        now: u64,
    ) -> Result<EncryptedU64, OctraShieldError> {
        // Cross-contract call placeholder
        Ok(amount_enc)
    }
}

// ---------------------------------------------------------------------------
// OCS01Contract trait implementation
// ---------------------------------------------------------------------------

impl OCS01Contract for OctraShieldRouter {
    fn describe_methods(&self) -> Vec<MethodDescriptor> {
        vec![
            MethodDescriptor::call("call_swap_exact_input",  "Multi-hop exact-input swap"),
            MethodDescriptor::call("call_swap_exact_output", "Multi-hop exact-output swap"),
            MethodDescriptor::call("call_add_liquidity",     "Add concentrated liquidity via router"),
            MethodDescriptor::call("call_remove_liquidity",  "Remove liquidity via router"),
            MethodDescriptor::call("call_collect_fees",      "Collect position fees via router"),
            MethodDescriptor::call("call_pause",             "Emergency pause (owner only)"),
            MethodDescriptor::call("call_unpause",           "Resume operation (owner only)"),
            MethodDescriptor::view("view_factory",           "Return factory address"),
            MethodDescriptor::view("view_is_paused",         "Return whether router is paused"),
            MethodDescriptor::view("view_quote_swap",        "Quote a swap without executing"),
        ]
    }
}
