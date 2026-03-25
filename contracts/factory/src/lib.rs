//! OctraShieldFactory — Pool Registry & Deployer
//!
//! Central registry that creates and tracks all OctraShield liquidity pools.
//! Each unique (token0, token1, fee_tier) triple maps to exactly one pool.
//!
//! Implements: OCS01 Contract Standard
//! Methods:
//!   View:  view_get_pool, view_all_pools, view_all_fee_tiers,
//!          view_pool_count, view_owner
//!   Call:  call_create_pool, call_enable_fee_tier,
//!          call_set_ai_engine, call_transfer_ownership

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use borsh::{BorshDeserialize, BorshSerialize};
use octra_hfhe::PubKey;

use octrashield_shared::{
    OctraAddress, PoolId, ExecContext, CallResponse, ContractEvent,
    EncryptedU64, ShieldError, ShieldResult,
    ExecutionInterface, OCS01Contract, MethodDescriptor, MethodType, ParamDescriptor,
    emit_event, events,
    is_valid_fee_tier, tick_spacing_for_fee,
    VERSION_FACTORY, FEE_TIER_001, FEE_TIER_005, FEE_TIER_030, FEE_TIER_100,
};

// ============================================================================
// Pool Registry Entry
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolEntry {
    pub pool_id: PoolId,
    pub token0: OctraAddress,
    pub token1: OctraAddress,
    pub fee_bps: u64,
    pub tick_spacing: i32,
    pub pair_contract: OctraAddress,
    pub lp_token: OctraAddress,
    pub created_at: u64,
    pub created_by: OctraAddress,
}

// ============================================================================
// Fee Tier Configuration
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct FeeTier {
    pub fee_bps: u64,
    pub tick_spacing: i32,
    pub enabled: bool,
}

// ============================================================================
// Contract State
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraShieldFactory {
    /// Contract owner (governance)
    owner: OctraAddress,

    /// All pools indexed by PoolId
    pools: HashMap<String, PoolEntry>,

    /// Pool lookup: (token0, token1, fee) -> PoolId
    pool_index: HashMap<String, String>,

    /// Enabled fee tiers
    fee_tiers: Vec<FeeTier>,

    /// AI Engine contract address
    ai_engine: Option<OctraAddress>,

    /// Router contract address
    router: Option<OctraAddress>,

    /// Total pool count
    pool_count: u64,

    /// Whether the factory is initialized
    initialized: bool,
}

impl OctraShieldFactory {
    pub fn new(owner: OctraAddress) -> Self {
        // Initialize with default fee tiers
        let fee_tiers = vec![
            FeeTier { fee_bps: FEE_TIER_001, tick_spacing: 1, enabled: true },
            FeeTier { fee_bps: FEE_TIER_005, tick_spacing: 10, enabled: true },
            FeeTier { fee_bps: FEE_TIER_030, tick_spacing: 60, enabled: true },
            FeeTier { fee_bps: FEE_TIER_100, tick_spacing: 200, enabled: true },
        ];

        Self {
            owner,
            pools: HashMap::new(),
            pool_index: HashMap::new(),
            fee_tiers,
            ai_engine: None,
            router: None,
            pool_count: 0,
            initialized: true,
        }
    }

    // ========================================================================
    // View Methods
    // ========================================================================

    /// view_get_pool: Lookup a pool by token pair and fee tier
    pub fn view_get_pool(
        &self,
        token0: &str,
        token1: &str,
        fee_bps: u64,
    ) -> ShieldResult<serde_json::Value> {
        let key = Self::pool_key(token0, token1, fee_bps);
        match self.pool_index.get(&key) {
            Some(pool_id_hex) => {
                let pool = self.pools.get(pool_id_hex)
                    .ok_or(ShieldError::PoolNotFound(pool_id_hex.clone()))?;
                Ok(serde_json::to_value(pool)?)
            }
            None => Ok(serde_json::json!({ "pool": null })),
        }
    }

    /// view_all_pools: List all registered pools
    pub fn view_all_pools(&self) -> ShieldResult<serde_json::Value> {
        let pools: Vec<&PoolEntry> = self.pools.values().collect();
        Ok(serde_json::to_value(pools)?)
    }

    /// view_all_fee_tiers: List all configured fee tiers
    pub fn view_all_fee_tiers(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::to_value(&self.fee_tiers)?)
    }

    /// view_pool_count: Total number of pools created
    pub fn view_pool_count(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::json!({ "pool_count": self.pool_count }))
    }

    /// view_owner: Current factory owner
    pub fn view_owner(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::json!({ "owner": self.owner.as_str() }))
    }

    // ========================================================================
    // Call Methods
    // ========================================================================

    /// call_create_pool: Deploy a new liquidity pool for a token pair
    ///
    /// 1. Validates tokens are different and fee tier is enabled
    /// 2. Checks no pool exists for this (token0, token1, fee) triple
    /// 3. Deploys OctraShieldPair contract
    /// 4. Deploys ShieldToken LP token
    /// 5. Registers pool in the factory
    ///
    /// Returns: Pool details including contract addresses
    pub fn call_create_pool(
        &mut self,
        ctx: &ExecContext,
        token0: OctraAddress,
        token1: OctraAddress,
        fee_bps: u64,
    ) -> ShieldResult<CallResponse> {
        // Validate: tokens must be different
        if token0 == token1 {
            return Err(ShieldError::IdenticalTokens);
        }

        // Validate: token addresses
        if !token0.is_valid() || !token1.is_valid() {
            return Err(ShieldError::InvalidAddress(
                format!("{}, {}", token0, token1)
            ));
        }

        // Validate: fee tier must be enabled
        let fee_tier = self.fee_tiers.iter()
            .find(|t| t.fee_bps == fee_bps && t.enabled)
            .ok_or(ShieldError::InvalidFeeTier(fee_bps))?;
        let tick_spacing = fee_tier.tick_spacing;

        // Sort tokens canonically (token0 < token1)
        let (sorted_token0, sorted_token1) = if token0.as_str() <= token1.as_str() {
            (token0, token1)
        } else {
            (token1, token0)
        };

        // Check pool doesn't already exist
        let key = Self::pool_key(sorted_token0.as_str(), sorted_token1.as_str(), fee_bps);
        if self.pool_index.contains_key(&key) {
            return Err(ShieldError::PoolAlreadyExists);
        }

        // Derive deterministic pool ID
        let pool_id = PoolId::derive(&sorted_token0, &sorted_token1, fee_bps);
        let pool_id_hex = pool_id.to_hex();

        // In production: these addresses come from the Octra runtime's
        // contract deployment mechanism. Here we derive deterministic
        // addresses from the pool ID for the spec.
        let pair_contract = Self::derive_contract_address(&pool_id_hex, "pair");
        let lp_token = Self::derive_contract_address(&pool_id_hex, "lp");

        // Create pool entry
        let pool_entry = PoolEntry {
            pool_id: pool_id.clone(),
            token0: sorted_token0.clone(),
            token1: sorted_token1.clone(),
            fee_bps,
            tick_spacing,
            pair_contract: pair_contract.clone(),
            lp_token: lp_token.clone(),
            created_at: ctx.block_timestamp,
            created_by: ctx.sender.clone(),
        };

        // Register in factory state
        self.pools.insert(pool_id_hex.clone(), pool_entry.clone());
        self.pool_index.insert(key, pool_id_hex.clone());
        self.pool_count += 1;

        // Emit PoolCreated event
        let event = emit_event(events::POOL_CREATED, vec![
            ("pool_id", serde_json::json!(pool_id_hex)),
            ("token0", serde_json::json!(sorted_token0.as_str())),
            ("token1", serde_json::json!(sorted_token1.as_str())),
            ("fee_bps", serde_json::json!(fee_bps)),
            ("tick_spacing", serde_json::json!(tick_spacing)),
            ("pair_contract", serde_json::json!(pair_contract.as_str())),
            ("lp_token", serde_json::json!(lp_token.as_str())),
            ("creator", serde_json::json!(ctx.sender.as_str())),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::to_value(&pool_entry)?,
            events: vec![event],
        })
    }

    /// call_enable_fee_tier: Add or enable a new fee tier
    /// RESTRICTED: Owner only
    pub fn call_enable_fee_tier(
        &mut self,
        ctx: &ExecContext,
        fee_bps: u64,
        tick_spacing: i32,
    ) -> ShieldResult<CallResponse> {
        self.check_owner(ctx)?;

        // Check if tier already exists
        if let Some(tier) = self.fee_tiers.iter_mut().find(|t| t.fee_bps == fee_bps) {
            tier.tick_spacing = tick_spacing;
            tier.enabled = true;
        } else {
            self.fee_tiers.push(FeeTier {
                fee_bps,
                tick_spacing,
                enabled: true,
            });
        }

        let event = emit_event(events::FEE_TIER_ENABLED, vec![
            ("fee_bps", serde_json::json!(fee_bps)),
            ("tick_spacing", serde_json::json!(tick_spacing)),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({
                "fee_bps": fee_bps,
                "tick_spacing": tick_spacing,
                "enabled": true
            }),
            events: vec![event],
        })
    }

    /// call_set_ai_engine: Set the AI Engine contract address
    /// RESTRICTED: Owner only
    pub fn call_set_ai_engine(
        &mut self,
        ctx: &ExecContext,
        ai_engine: OctraAddress,
    ) -> ShieldResult<CallResponse> {
        self.check_owner(ctx)?;
        self.ai_engine = Some(ai_engine.clone());

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "ai_engine": ai_engine.as_str() }),
            events: vec![],
        })
    }

    /// call_transfer_ownership: Transfer factory ownership
    /// RESTRICTED: Owner only
    pub fn call_transfer_ownership(
        &mut self,
        ctx: &ExecContext,
        new_owner: OctraAddress,
    ) -> ShieldResult<CallResponse> {
        self.check_owner(ctx)?;
        let old_owner = self.owner.clone();
        self.owner = new_owner.clone();

        let event = emit_event(events::OWNERSHIP_TRANSFERRED, vec![
            ("old_owner", serde_json::json!(old_owner.as_str())),
            ("new_owner", serde_json::json!(new_owner.as_str())),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "new_owner": new_owner.as_str() }),
            events: vec![event],
        })
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    fn check_owner(&self, ctx: &ExecContext) -> ShieldResult<()> {
        if ctx.sender != self.owner {
            Err(ShieldError::Unauthorized)
        } else {
            Ok(())
        }
    }

    /// Canonical pool key for index lookup
    fn pool_key(token0: &str, token1: &str, fee_bps: u64) -> String {
        let (a, b) = if token0 <= token1 {
            (token0, token1)
        } else {
            (token1, token0)
        };
        format!("{}:{}:{}", a, b, fee_bps)
    }

    /// Derive a deterministic contract address from pool ID + salt
    fn derive_contract_address(pool_id_hex: &str, salt: &str) -> OctraAddress {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(pool_id_hex.as_bytes());
        hasher.update(salt.as_bytes());
        let result = hasher.finalize();
        let addr = bs58::encode(&result[..32]).into_string();
        OctraAddress::new(&format!("oct{}", addr))
    }
}

// ============================================================================
// OCS01 Contract Implementation
// ============================================================================

impl OCS01Contract for OctraShieldFactory {
    fn name(&self) -> &str {
        "OctraShieldFactory"
    }

    fn version(&self) -> &str {
        VERSION_FACTORY
    }

    fn execute(&mut self, call: ExecutionInterface, ctx: &ExecContext) -> ShieldResult<CallResponse> {
        if !call.is_view() {
            if !call.verify_signature()? {
                return Err(ShieldError::InvalidSignature);
            }
        }

        match call.method.as_str() {
            // View methods
            "view_get_pool" => {
                let token0 = call.params["token0"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'token0'".into()))?;
                let token1 = call.params["token1"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'token1'".into()))?;
                let fee_bps = call.params["fee_bps"].as_u64()
                    .ok_or(ShieldError::Internal("Missing 'fee_bps'".into()))?;
                let data = self.view_get_pool(token0, token1, fee_bps)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_all_pools" => {
                let data = self.view_all_pools()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_all_fee_tiers" => {
                let data = self.view_all_fee_tiers()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_pool_count" => {
                let data = self.view_pool_count()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_owner" => {
                let data = self.view_owner()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }

            // Call methods
            "call_create_pool" => {
                let token0: OctraAddress = serde_json::from_value(call.params["token0"].clone())?;
                let token1: OctraAddress = serde_json::from_value(call.params["token1"].clone())?;
                let fee_bps = call.params["fee_bps"].as_u64()
                    .ok_or(ShieldError::Internal("Missing 'fee_bps'".into()))?;
                self.call_create_pool(ctx, token0, token1, fee_bps)
            }
            "call_enable_fee_tier" => {
                let fee_bps = call.params["fee_bps"].as_u64()
                    .ok_or(ShieldError::Internal("Missing 'fee_bps'".into()))?;
                let tick_spacing = call.params["tick_spacing"].as_i64()
                    .ok_or(ShieldError::Internal("Missing 'tick_spacing'".into()))? as i32;
                self.call_enable_fee_tier(ctx, fee_bps, tick_spacing)
            }
            "call_set_ai_engine" => {
                let ai_engine: OctraAddress = serde_json::from_value(call.params["ai_engine"].clone())?;
                self.call_set_ai_engine(ctx, ai_engine)
            }
            "call_transfer_ownership" => {
                let new_owner: OctraAddress = serde_json::from_value(call.params["new_owner"].clone())?;
                self.call_transfer_ownership(ctx, new_owner)
            }

            _ => Err(ShieldError::Internal(format!("Unknown method: {}", call.method))),
        }
    }

    fn methods(&self) -> Vec<MethodDescriptor> {
        vec![
            MethodDescriptor {
                name: "view_get_pool".into(),
                method_type: MethodType::View,
                description: "Lookup pool by token pair and fee tier".into(),
                params: vec![
                    ParamDescriptor { name: "token0".into(), param_type: "string".into(), description: "First token address".into(), required: true },
                    ParamDescriptor { name: "token1".into(), param_type: "string".into(), description: "Second token address".into(), required: true },
                    ParamDescriptor { name: "fee_bps".into(), param_type: "u64".into(), description: "Fee tier in basis points".into(), required: true },
                ],
                returns: "PoolEntry | null".into(),
            },
            MethodDescriptor {
                name: "view_all_pools".into(),
                method_type: MethodType::View,
                description: "List all registered pools".into(),
                params: vec![],
                returns: "Vec<PoolEntry>".into(),
            },
            MethodDescriptor {
                name: "view_all_fee_tiers".into(),
                method_type: MethodType::View,
                description: "List all configured fee tiers".into(),
                params: vec![],
                returns: "Vec<FeeTier>".into(),
            },
            MethodDescriptor {
                name: "view_pool_count".into(),
                method_type: MethodType::View,
                description: "Get total number of pools".into(),
                params: vec![],
                returns: "{ pool_count: u64 }".into(),
            },
            MethodDescriptor {
                name: "view_owner".into(),
                method_type: MethodType::View,
                description: "Get factory owner address".into(),
                params: vec![],
                returns: "{ owner: string }".into(),
            },
            MethodDescriptor {
                name: "call_create_pool".into(),
                method_type: MethodType::Call,
                description: "Create a new liquidity pool for a token pair".into(),
                params: vec![
                    ParamDescriptor { name: "token0".into(), param_type: "OctraAddress".into(), description: "First token".into(), required: true },
                    ParamDescriptor { name: "token1".into(), param_type: "OctraAddress".into(), description: "Second token".into(), required: true },
                    ParamDescriptor { name: "fee_bps".into(), param_type: "u64".into(), description: "Fee tier (1, 5, 30, or 100)".into(), required: true },
                ],
                returns: "PoolEntry".into(),
            },
            MethodDescriptor {
                name: "call_enable_fee_tier".into(),
                method_type: MethodType::Call,
                description: "Enable a new fee tier (owner only)".into(),
                params: vec![
                    ParamDescriptor { name: "fee_bps".into(), param_type: "u64".into(), description: "Fee in basis points".into(), required: true },
                    ParamDescriptor { name: "tick_spacing".into(), param_type: "i32".into(), description: "Tick spacing for this tier".into(), required: true },
                ],
                returns: "{ fee_bps, tick_spacing, enabled }".into(),
            },
            MethodDescriptor {
                name: "call_set_ai_engine".into(),
                method_type: MethodType::Call,
                description: "Set AI Engine contract address (owner only)".into(),
                params: vec![
                    ParamDescriptor { name: "ai_engine".into(), param_type: "OctraAddress".into(), description: "AI Engine contract".into(), required: true },
                ],
                returns: "{ ai_engine: string }".into(),
            },
            MethodDescriptor {
                name: "call_transfer_ownership".into(),
                method_type: MethodType::Call,
                description: "Transfer factory ownership (owner only)".into(),
                params: vec![
                    ParamDescriptor { name: "new_owner".into(), param_type: "OctraAddress".into(), description: "New owner address".into(), required: true },
                ],
                returns: "{ new_owner: string }".into(),
            },
        ]
    }
}

// ============================================================================
// WASM Entry Point
// ============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use octra_sdk::wasm_export;

    #[wasm_export]
    pub fn execute(state: &mut OctraShieldFactory, call_json: &str, ctx_json: &str) -> String {
        let call: ExecutionInterface = match serde_json::from_str(call_json) {
            Ok(c) => c,
            Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
        };
        let ctx: ExecContext = match serde_json::from_str(ctx_json) {
            Ok(c) => c,
            Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
        };

        match state.execute(call, &ctx) {
            Ok(response) => serde_json::to_string(&response).unwrap_or_default(),
            Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
        }
    }
}
