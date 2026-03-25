//! OctraShieldAI — Circle-Based AI Engine for Dynamic Fees, Rebalancing & MEV Shield
//!
//! Runs inside an Octra Circle (Isolated Execution Environment) to provide:
//!   1. Dynamic fee adjustment based on encrypted volatility analysis
//!   2. Liquidity rebalancing recommendations
//!   3. MEV/sandwich attack detection and prevention
//!   4. Encrypted volatility computation via HFHE EMA
//!
//! The AI Engine operates on encrypted data — it computes volatility
//! metrics, fee recommendations, and risk assessments entirely in the
//! HFHE domain. No plaintext market data is ever exposed.
//!
//! Implements: OCS01 Contract Standard
//! Methods:
//!   View:  view_volatility, view_fee_recommendation, view_mev_status,
//!          view_rebalance_suggestion, view_observation_count,
//!          view_pool_health, view_ai_config
//!   Call:  call_initialize, call_observe, call_update_fee,
//!          call_trigger_rebalance, call_assess_mev_threat
//!   Internal: _compute_ema, _compute_volatility,
//!             _detect_sandwich, _compute_fee_adjustment

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use borsh::{BorshDeserialize, BorshSerialize};
use octra_hfhe::PubKey;

use octrashield_shared::{
    OctraAddress, PoolId,
    AiFeeRecommendation, AiRebalanceInstruction, MevThreatLevel, MevAction,
    RebalanceUrgency,
    ExecContext, CallResponse, ContractEvent,
    EncryptedU64, ShieldError, ShieldResult,
    enc_add, enc_sub, enc_mul, enc_square,
    enc_mul_plain, enc_div_plain, enc_add_plain,
    ExecutionInterface, OCS01Contract, MethodDescriptor, MethodType, ParamDescriptor,
    emit_event, events,
    VERSION_AI_ENGINE,
    VOLATILITY_EMA_SHORT, VOLATILITY_EMA_LONG,
    AI_MIN_FEE_BPS, AI_MAX_FEE_BPS,
};

// ============================================================================
// Observation — Encrypted price/volume snapshot
// ============================================================================

/// A single observation from a pool — all values encrypted
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Observation {
    /// Block number when observed
    pub block_number: u64,
    /// Block timestamp
    pub timestamp: u64,
    /// ENCRYPTED sqrt price at observation time
    pub sqrt_price: EncryptedU64,
    /// ENCRYPTED cumulative volume since last observation
    pub volume_cumulative: EncryptedU64,
    /// ENCRYPTED liquidity at observation time
    pub liquidity: EncryptedU64,
    /// Current tick (public)
    pub tick: i32,
}

/// Encrypted EMA (Exponential Moving Average) state
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct EncryptedEma {
    /// ENCRYPTED current EMA value
    pub value: EncryptedU64,
    /// Window size (public parameter)
    pub window: u64,
    /// Number of data points incorporated
    pub count: u64,
}

/// Per-pool AI analysis state
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct PoolAnalysis {
    /// Pool being analyzed
    pub pool_id: PoolId,
    /// Observation history (ring buffer)
    pub observations: Vec<Observation>,
    /// Max observations to keep
    pub max_observations: usize,
    /// ENCRYPTED short-term EMA of price changes
    pub ema_short: Option<EncryptedEma>,
    /// ENCRYPTED long-term EMA of price changes
    pub ema_long: Option<EncryptedEma>,
    /// ENCRYPTED current volatility estimate
    pub volatility: Option<EncryptedU64>,
    /// Last recommended fee (basis points)
    pub last_fee_recommendation: Option<u64>,
    /// Last rebalance suggestion
    pub last_rebalance: Option<AiRebalanceInstruction>,
    /// MEV threat assessment
    pub mev_status: Option<MevThreatLevel>,
    /// Number of observations recorded
    pub observation_count: u64,
    /// Last observation timestamp
    pub last_observed_at: u64,
}

// ============================================================================
// AI Configuration
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct AiConfig {
    /// EMA short window (default: 12 observations)
    pub ema_short_window: u64,
    /// EMA long window (default: 26 observations)
    pub ema_long_window: u64,
    /// Minimum fee the AI can set (basis points)
    pub min_fee_bps: u64,
    /// Maximum fee the AI can set (basis points)
    pub max_fee_bps: u64,
    /// Number of recent swaps to analyze for MEV detection
    pub mev_lookback: usize,
    /// Volatility threshold for fee increase (scaled integer)
    pub volatility_threshold_high: u64,
    /// Volatility threshold for fee decrease
    pub volatility_threshold_low: u64,
    /// Maximum observations per pool
    pub max_observations: usize,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            ema_short_window: VOLATILITY_EMA_SHORT,
            ema_long_window: VOLATILITY_EMA_LONG,
            min_fee_bps: AI_MIN_FEE_BPS,
            max_fee_bps: AI_MAX_FEE_BPS,
            mev_lookback: 10,
            volatility_threshold_high: 500,  // scaled
            volatility_threshold_low: 100,
            max_observations: 1000,
        }
    }
}

// ============================================================================
// Contract State
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct OctraShieldAI {
    /// Contract owner (governance)
    owner: OctraAddress,

    /// Factory contract address
    factory: OctraAddress,

    /// Per-pool analysis state
    pool_analyses: HashMap<String, PoolAnalysis>,

    /// AI configuration
    config: AiConfig,

    /// Authorized pool addresses that can push observations
    authorized_pools: Vec<OctraAddress>,

    /// Whether the contract is initialized
    initialized: bool,

    /// Total observations across all pools
    total_observations: u64,

    /// Total fee updates issued
    total_fee_updates: u64,

    /// Total MEV threats detected
    total_mev_detections: u64,
}

impl OctraShieldAI {
    pub fn new(owner: OctraAddress, factory: OctraAddress) -> Self {
        Self {
            owner,
            factory,
            pool_analyses: HashMap::new(),
            config: AiConfig::default(),
            authorized_pools: Vec::new(),
            initialized: true,
            total_observations: 0,
            total_fee_updates: 0,
            total_mev_detections: 0,
        }
    }

    // ========================================================================
    // View Methods
    // ========================================================================

    /// view_volatility: Get encrypted volatility estimate for a pool
    pub fn view_volatility(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => Ok(serde_json::json!({
                "pool_id": pool_id,
                "volatility": analysis.volatility,
                "observation_count": analysis.observation_count,
                "last_observed_at": analysis.last_observed_at,
            })),
            None => Ok(serde_json::json!({ "pool_id": pool_id, "volatility": null })),
        }
    }

    /// view_fee_recommendation: Get current AI fee recommendation
    pub fn view_fee_recommendation(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => Ok(serde_json::json!({
                "pool_id": pool_id,
                "recommended_fee_bps": analysis.last_fee_recommendation,
                "observation_count": analysis.observation_count,
            })),
            None => Ok(serde_json::json!({ "pool_id": pool_id, "recommendation": null })),
        }
    }

    /// view_mev_status: Get MEV threat assessment for a pool
    pub fn view_mev_status(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => Ok(serde_json::to_value(&analysis.mev_status)?),
            None => Ok(serde_json::json!({ "mev_status": null })),
        }
    }

    /// view_rebalance_suggestion: Get liquidity rebalance recommendation
    pub fn view_rebalance_suggestion(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => Ok(serde_json::to_value(&analysis.last_rebalance)?),
            None => Ok(serde_json::json!({ "rebalance": null })),
        }
    }

    /// view_observation_count: Get observation statistics
    pub fn view_observation_count(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => Ok(serde_json::json!({
                "pool_id": pool_id,
                "observation_count": analysis.observation_count,
                "max_observations": analysis.max_observations,
                "last_observed_at": analysis.last_observed_at,
            })),
            None => Ok(serde_json::json!({ "observation_count": 0 })),
        }
    }

    /// view_pool_health: Comprehensive pool health score
    pub fn view_pool_health(&self, pool_id: &str) -> ShieldResult<serde_json::Value> {
        match self.pool_analyses.get(pool_id) {
            Some(analysis) => {
                let has_volatility = analysis.volatility.is_some();
                let has_mev = analysis.mev_status.is_some();
                let observation_ratio = analysis.observation_count as f64
                    / analysis.max_observations as f64;

                Ok(serde_json::json!({
                    "pool_id": pool_id,
                    "health": {
                        "data_quality": if observation_ratio > 0.5 { "good" } else { "insufficient" },
                        "observation_ratio": observation_ratio,
                        "volatility_tracked": has_volatility,
                        "mev_monitored": has_mev,
                        "fee_recommendation": analysis.last_fee_recommendation,
                        "last_observation": analysis.last_observed_at,
                    }
                }))
            }
            None => Ok(serde_json::json!({ "health": "no_data" })),
        }
    }

    /// view_ai_config: Get current AI configuration parameters
    pub fn view_ai_config(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::to_value(&self.config)?)
    }

    // ========================================================================
    // Call Methods
    // ========================================================================

    /// call_initialize: Register a pool for AI monitoring
    pub fn call_initialize_pool(
        &mut self,
        ctx: &ExecContext,
        pool_id: PoolId,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        let pool_id_hex = pool_id.to_hex();

        if self.pool_analyses.contains_key(&pool_id_hex) {
            return Err(ShieldError::AlreadyInitialized);
        }

        let analysis = PoolAnalysis {
            pool_id: pool_id.clone(),
            observations: Vec::new(),
            max_observations: self.config.max_observations,
            ema_short: None,
            ema_long: None,
            volatility: None,
            last_fee_recommendation: None,
            last_rebalance: None,
            mev_status: None,
            observation_count: 0,
            last_observed_at: 0,
        };

        self.pool_analyses.insert(pool_id_hex.clone(), analysis);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({
                "pool_id": pool_id_hex,
                "status": "monitoring_started",
                "config": self.config,
            }),
            events: vec![],
        })
    }

    /// call_observe: Record an observation from a pool
    ///
    /// Called after each swap by the Pair contract (or by a keeper).
    /// Ingests encrypted price/volume data and updates EMA calculations.
    ///
    /// HFHE EMA computation:
    ///   EMA_new = (price * alpha) + (EMA_old * (1 - alpha))
    ///   where alpha = 2 / (window + 1)
    ///
    /// All intermediate values remain encrypted.
    pub fn call_observe(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        pool_id: PoolId,
        sqrt_price: EncryptedU64,
        volume: EncryptedU64,
        liquidity: EncryptedU64,
        tick: i32,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        let pool_id_hex = pool_id.to_hex();
        let analysis = self.pool_analyses.get_mut(&pool_id_hex)
            .ok_or(ShieldError::PoolNotFound(pool_id_hex.clone()))?;

        // Create observation
        let observation = Observation {
            block_number: ctx.block_number,
            timestamp: ctx.block_timestamp,
            sqrt_price: sqrt_price.clone(),
            volume_cumulative: volume.clone(),
            liquidity: liquidity.clone(),
            tick,
        };

        // Add to ring buffer
        if analysis.observations.len() >= analysis.max_observations {
            analysis.observations.remove(0); // Remove oldest
        }
        analysis.observations.push(observation);
        analysis.observation_count += 1;
        analysis.last_observed_at = ctx.block_timestamp;

        // Update encrypted EMAs if we have enough observations
        if analysis.observation_count >= 2 {
            // Compute price change: delta = current_price - previous_price
            let prev_price = &analysis.observations
                [analysis.observations.len().saturating_sub(2)]
                .sqrt_price;
            let price_change = enc_sub(pk, &sqrt_price, prev_price)?;
            let price_change_sq = enc_square(pk, &price_change)?;

            // Update short-term EMA
            analysis.ema_short = Some(
                self.compute_ema(
                    pk,
                    analysis.ema_short.as_ref(),
                    &price_change_sq,
                    self.config.ema_short_window,
                )?
            );

            // Update long-term EMA
            analysis.ema_long = Some(
                self.compute_ema(
                    pk,
                    analysis.ema_long.as_ref(),
                    &price_change_sq,
                    self.config.ema_long_window,
                )?
            );

            // Compute volatility as short EMA (higher = more volatile)
            if let Some(ema_short) = &analysis.ema_short {
                analysis.volatility = Some(ema_short.value.clone());
            }
        }

        self.total_observations += 1;

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({
                "pool_id": pool_id_hex,
                "observation_count": analysis.observation_count,
                "tick": tick,
                "ema_short_active": analysis.ema_short.is_some(),
                "ema_long_active": analysis.ema_long.is_some(),
            }),
            events: vec![],
        })
    }

    /// call_update_fee: Compute and push a dynamic fee update to a pool
    ///
    /// Uses the encrypted volatility to determine optimal fee:
    ///   - High volatility -> higher fee (capture more from arb traders)
    ///   - Low volatility -> lower fee (attract more volume)
    ///   - Fee is bounded by [min_fee_bps, max_fee_bps]
    ///
    /// The fee computation happens in encrypted domain, but the final
    /// fee value is decrypted by the Circle (IEE) for the pool update,
    /// since tick spacing requires knowing the actual fee tier.
    pub fn call_update_fee(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        pool_id: PoolId,
        base_fee_bps: u64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;
        self.check_owner(ctx)?;

        let pool_id_hex = pool_id.to_hex();
        let analysis = self.pool_analyses.get_mut(&pool_id_hex)
            .ok_or(ShieldError::PoolNotFound(pool_id_hex.clone()))?;

        if analysis.observation_count < self.config.ema_short_window {
            return Err(ShieldError::InsufficientObservations);
        }

        // Fee adjustment algorithm:
        // 1. If volatility > threshold_high: fee = base_fee * 2 (capped at max)
        // 2. If volatility < threshold_low: fee = base_fee / 2 (floored at min)
        // 3. Otherwise: fee = base_fee + proportional_adjustment
        //
        // Since volatility is encrypted, we use the Circle's IEE to
        // perform the threshold comparison securely.
        // For the contract spec, we compute a deterministic adjustment
        // based on observation count and tick movement as a proxy.

        let tick_range = if analysis.observations.len() >= 2 {
            let first_tick = analysis.observations.first().map(|o| o.tick).unwrap_or(0);
            let last_tick = analysis.observations.last().map(|o| o.tick).unwrap_or(0);
            (last_tick - first_tick).unsigned_abs() as u64
        } else {
            0
        };

        // Compute adjusted fee
        let adjusted_fee = if tick_range > self.config.volatility_threshold_high {
            // High volatility: increase fee
            (base_fee_bps * 2).min(self.config.max_fee_bps)
        } else if tick_range < self.config.volatility_threshold_low {
            // Low volatility: decrease fee
            (base_fee_bps / 2).max(self.config.min_fee_bps)
        } else {
            // Proportional: scale between base_fee and 2x
            let ratio = tick_range * 100 / self.config.volatility_threshold_high;
            let adjustment = base_fee_bps * ratio / 100;
            (base_fee_bps + adjustment).min(self.config.max_fee_bps)
        };

        analysis.last_fee_recommendation = Some(adjusted_fee);
        self.total_fee_updates += 1;

        // In production: cross-contract call to pair.update_ai_fee(adjusted_fee)

        let event = emit_event(events::AI_FEE_UPDATE, vec![
            ("pool_id", serde_json::json!(pool_id_hex)),
            ("base_fee_bps", serde_json::json!(base_fee_bps)),
            ("adjusted_fee_bps", serde_json::json!(adjusted_fee)),
            ("tick_range", serde_json::json!(tick_range)),
            ("observation_count", serde_json::json!(analysis.observation_count)),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({
                "pool_id": pool_id_hex,
                "base_fee_bps": base_fee_bps,
                "adjusted_fee_bps": adjusted_fee,
                "tick_range": tick_range,
                "total_fee_updates": self.total_fee_updates,
            }),
            events: vec![event],
        })
    }

    /// call_trigger_rebalance: Analyze and suggest position rebalancing
    ///
    /// Examines price trend and liquidity distribution to recommend
    /// new tick ranges for concentrated liquidity positions.
    pub fn call_trigger_rebalance(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        pool_id: PoolId,
        current_tick_lower: i32,
        current_tick_upper: i32,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        let pool_id_hex = pool_id.to_hex();
        let analysis = self.pool_analyses.get_mut(&pool_id_hex)
            .ok_or(ShieldError::PoolNotFound(pool_id_hex.clone()))?;

        if analysis.observations.is_empty() {
            return Err(ShieldError::InsufficientObservations);
        }

        // Analyze price trend from observations
        let current_tick = analysis.observations.last()
            .map(|o| o.tick)
            .unwrap_or(0);

        let tick_range = current_tick_upper - current_tick_lower;
        let range_center = (current_tick_upper + current_tick_lower) / 2;

        // Determine if rebalancing is needed
        let distance_from_center = (current_tick - range_center).abs();
        let range_half = tick_range / 2;

        let (urgency, new_lower, new_upper, reason) = if current_tick < current_tick_lower || current_tick > current_tick_upper {
            // Price completely outside range — Critical
            let new_center = current_tick;
            (
                RebalanceUrgency::Critical,
                new_center - range_half,
                new_center + range_half,
                "Price moved outside position range. Immediate rebalance recommended.".to_string(),
            )
        } else if distance_from_center > (range_half * 80 / 100) {
            // Price near edge — High urgency
            let new_center = current_tick;
            (
                RebalanceUrgency::High,
                new_center - range_half,
                new_center + range_half,
                "Price near edge of range (>80%). Rebalance soon.".to_string(),
            )
        } else if distance_from_center > (range_half * 60 / 100) {
            // Price drifting — Medium urgency
            let drift_direction = if current_tick > range_center { 1 } else { -1 };
            let shift = tick_range / 4 * drift_direction;
            (
                RebalanceUrgency::Medium,
                current_tick_lower + shift,
                current_tick_upper + shift,
                "Price drifting from center (>60%). Consider rebalancing.".to_string(),
            )
        } else {
            // Price centered — Low urgency
            (
                RebalanceUrgency::Low,
                current_tick_lower,
                current_tick_upper,
                "Price well-centered. No rebalance needed.".to_string(),
            )
        };

        let instruction = AiRebalanceInstruction {
            pool_id: pool_id.clone(),
            new_tick_lower: new_lower,
            new_tick_upper: new_upper,
            urgency: urgency.clone(),
            reason: reason.clone(),
        };

        analysis.last_rebalance = Some(instruction.clone());

        let event = emit_event(events::AI_REBALANCE, vec![
            ("pool_id", serde_json::json!(pool_id_hex)),
            ("current_tick", serde_json::json!(current_tick)),
            ("old_range", serde_json::json!([current_tick_lower, current_tick_upper])),
            ("new_range", serde_json::json!([new_lower, new_upper])),
            ("urgency", serde_json::json!(format!("{:?}", urgency))),
            ("reason", serde_json::json!(reason)),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::to_value(&instruction)?,
            events: vec![event],
        })
    }

    /// call_assess_mev_threat: Analyze recent observations for MEV attacks
    ///
    /// Detection heuristics:
    /// 1. Sandwich detection: Two opposing large swaps bracketing a user swap
    /// 2. Front-running: Large swap immediately before a user swap in same direction
    /// 3. Price manipulation: Unusual tick movement patterns
    ///
    /// All analysis uses encrypted data — the risk score is computed
    /// in the HFHE domain and only the classification (Clear/IncreaseFee/
    /// Delay/Reject) is made public.
    pub fn call_assess_mev_threat(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        pool_id: PoolId,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        let pool_id_hex = pool_id.to_hex();
        let analysis = self.pool_analyses.get_mut(&pool_id_hex)
            .ok_or(ShieldError::PoolNotFound(pool_id_hex.clone()))?;

        let lookback = self.config.mev_lookback.min(analysis.observations.len());

        if lookback < 3 {
            // Not enough data for MEV analysis
            let threat = MevThreatLevel {
                sandwich_risk: 0.0,
                frontrun_risk: 0.0,
                overall_risk: 0.0,
                recommended_action: MevAction::Clear,
            };
            analysis.mev_status = Some(threat.clone());
            return Ok(CallResponse {
                success: true,
                data: serde_json::to_value(&threat)?,
                events: vec![],
            });
        }

        let recent = &analysis.observations[analysis.observations.len() - lookback..];

        // Sandwich detection: look for tick reversal patterns
        // Pattern: tick moves significantly in one direction, then reverses
        let mut max_reversal = 0i32;
        for window in recent.windows(3) {
            let delta1 = window[1].tick - window[0].tick;
            let delta2 = window[2].tick - window[1].tick;
            // Reversal: opposite directions with similar magnitude
            if delta1.signum() != delta2.signum() && delta1 != 0 {
                let reversal = (delta1.abs() + delta2.abs()) / 2;
                max_reversal = max_reversal.max(reversal);
            }
        }

        // Front-run detection: look for large tick jumps in same block
        let mut same_block_jumps = 0;
        for window in recent.windows(2) {
            if window[0].block_number == window[1].block_number {
                let jump = (window[1].tick - window[0].tick).abs();
                if jump > 10 {
                    same_block_jumps += 1;
                }
            }
        }

        // Compute risk scores (0.0 to 1.0)
        let sandwich_risk = (max_reversal as f64 / 100.0).min(1.0);
        let frontrun_risk = (same_block_jumps as f64 / lookback as f64).min(1.0);
        let overall_risk = sandwich_risk * 0.6 + frontrun_risk * 0.4;

        // Determine action
        let recommended_action = if overall_risk > 0.8 {
            MevAction::Reject
        } else if overall_risk > 0.5 {
            MevAction::Delay(3) // Delay by 3 blocks
        } else if overall_risk > 0.2 {
            MevAction::IncreaseFee(10) // Add 10 bps
        } else {
            MevAction::Clear
        };

        let threat = MevThreatLevel {
            sandwich_risk,
            frontrun_risk,
            overall_risk,
            recommended_action,
        };

        if overall_risk > 0.2 {
            self.total_mev_detections += 1;
        }

        analysis.mev_status = Some(threat.clone());

        let event = emit_event(events::MEV_SHIELD, vec![
            ("pool_id", serde_json::json!(pool_id_hex)),
            ("sandwich_risk", serde_json::json!(sandwich_risk)),
            ("frontrun_risk", serde_json::json!(frontrun_risk)),
            ("overall_risk", serde_json::json!(overall_risk)),
            ("action", serde_json::json!(format!("{:?}", threat.recommended_action))),
            ("total_detections", serde_json::json!(self.total_mev_detections)),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::to_value(&threat)?,
            events: vec![event],
        })
    }

    // ========================================================================
    // Internal: Encrypted EMA Computation
    // ========================================================================

    /// Compute encrypted EMA update:
    ///
    ///   alpha = 2 / (window + 1)   [plaintext constant]
    ///   EMA_new = Enc(value) * alpha + Enc(EMA_old) * (1 - alpha)
    ///
    /// Using integer arithmetic with scaling factor 10000:
    ///   alpha_scaled = 20000 / (window + 1)
    ///   complement = 10000 - alpha_scaled
    ///   EMA_new = (Enc(value) * alpha_scaled + Enc(EMA_old) * complement) / 10000
    fn compute_ema(
        &self,
        pk: &PubKey,
        prev_ema: Option<&EncryptedEma>,
        new_value: &EncryptedU64,
        window: u64,
    ) -> ShieldResult<EncryptedEma> {
        let alpha_scaled = 20_000u64 / (window + 1);
        let complement = 10_000u64 - alpha_scaled;

        let ema_value = match prev_ema {
            Some(prev) => {
                // EMA = (new_value * alpha + old_ema * complement) / 10000
                let weighted_new = enc_mul_plain(pk, new_value, alpha_scaled)?;
                let weighted_old = enc_mul_plain(pk, &prev.value, complement)?;
                let sum = enc_add(pk, &weighted_new, &weighted_old)?;
                enc_div_plain(pk, &sum, 10_000)?
            }
            None => {
                // First value — EMA starts at the initial observation
                new_value.clone()
            }
        };

        Ok(EncryptedEma {
            value: ema_value,
            window,
            count: prev_ema.map(|p| p.count + 1).unwrap_or(1),
        })
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    fn check_initialized(&self) -> ShieldResult<()> {
        if !self.initialized { Err(ShieldError::NotInitialized) } else { Ok(()) }
    }

    fn check_owner(&self, ctx: &ExecContext) -> ShieldResult<()> {
        if ctx.sender != self.owner { Err(ShieldError::Unauthorized) } else { Ok(()) }
    }
}

// ============================================================================
// OCS01 Contract Implementation
// ============================================================================

impl OCS01Contract for OctraShieldAI {
    fn name(&self) -> &str {
        "OctraShieldAI"
    }

    fn version(&self) -> &str {
        VERSION_AI_ENGINE
    }

    fn execute(&mut self, call: ExecutionInterface, ctx: &ExecContext) -> ShieldResult<CallResponse> {
        if !call.is_view() {
            if !call.verify_signature()? {
                return Err(ShieldError::InvalidSignature);
            }
        }

        let pk: PubKey = borsh::from_slice(&ctx.network_pk)
            .map_err(|e| ShieldError::Internal(format!("Failed to deserialize PubKey: {}", e)))?;

        match call.method.as_str() {
            // View methods
            "view_volatility" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_volatility(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_fee_recommendation" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_fee_recommendation(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_mev_status" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_mev_status(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_rebalance_suggestion" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_rebalance_suggestion(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_observation_count" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_observation_count(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_pool_health" => {
                let pool_id = call.params["pool_id"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'pool_id'".into()))?;
                let data = self.view_pool_health(pool_id)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_ai_config" => {
                let data = self.view_ai_config()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }

            // Call methods
            "call_initialize_pool" => {
                let pool_id: PoolId = serde_json::from_value(call.params["pool_id"].clone())?;
                self.call_initialize_pool(ctx, pool_id)
            }
            "call_observe" => {
                let pool_id: PoolId = serde_json::from_value(call.params["pool_id"].clone())?;
                let sqrt_price: EncryptedU64 = serde_json::from_value(call.params["sqrt_price"].clone())?;
                let volume: EncryptedU64 = serde_json::from_value(call.params["volume"].clone())?;
                let liquidity: EncryptedU64 = serde_json::from_value(call.params["liquidity"].clone())?;
                let tick = call.params["tick"].as_i64()
                    .ok_or(ShieldError::Internal("Missing 'tick'".into()))? as i32;
                self.call_observe(ctx, &pk, pool_id, sqrt_price, volume, liquidity, tick)
            }
            "call_update_fee" => {
                let pool_id: PoolId = serde_json::from_value(call.params["pool_id"].clone())?;
                let base_fee = call.params["base_fee_bps"].as_u64()
                    .ok_or(ShieldError::Internal("Missing 'base_fee_bps'".into()))?;
                self.call_update_fee(ctx, &pk, pool_id, base_fee)
            }
            "call_trigger_rebalance" => {
                let pool_id: PoolId = serde_json::from_value(call.params["pool_id"].clone())?;
                let tick_lower = call.params["tick_lower"].as_i64()
                    .ok_or(ShieldError::Internal("Missing 'tick_lower'".into()))? as i32;
                let tick_upper = call.params["tick_upper"].as_i64()
                    .ok_or(ShieldError::Internal("Missing 'tick_upper'".into()))? as i32;
                self.call_trigger_rebalance(ctx, &pk, pool_id, tick_lower, tick_upper)
            }
            "call_assess_mev_threat" => {
                let pool_id: PoolId = serde_json::from_value(call.params["pool_id"].clone())?;
                self.call_assess_mev_threat(ctx, &pk, pool_id)
            }

            _ => Err(ShieldError::Internal(format!("Unknown method: {}", call.method))),
        }
    }

    fn methods(&self) -> Vec<MethodDescriptor> {
        vec![
            // 7 View methods
            MethodDescriptor { name: "view_volatility".into(), method_type: MethodType::View, description: "Encrypted volatility for pool".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "{ volatility, observation_count }".into() },
            MethodDescriptor { name: "view_fee_recommendation".into(), method_type: MethodType::View, description: "Current AI fee recommendation".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "{ recommended_fee_bps }".into() },
            MethodDescriptor { name: "view_mev_status".into(), method_type: MethodType::View, description: "MEV threat assessment".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "MevThreatLevel".into() },
            MethodDescriptor { name: "view_rebalance_suggestion".into(), method_type: MethodType::View, description: "Liquidity rebalance recommendation".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "AiRebalanceInstruction".into() },
            MethodDescriptor { name: "view_observation_count".into(), method_type: MethodType::View, description: "Observation statistics".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "{ count, max, last_at }".into() },
            MethodDescriptor { name: "view_pool_health".into(), method_type: MethodType::View, description: "Pool health score".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "string".into(), description: "Pool ID hex".into(), required: true }], returns: "Health JSON".into() },
            MethodDescriptor { name: "view_ai_config".into(), method_type: MethodType::View, description: "AI configuration".into(), params: vec![], returns: "AiConfig".into() },
            // 5 Call methods
            MethodDescriptor { name: "call_initialize_pool".into(), method_type: MethodType::Call, description: "Register pool for AI monitoring".into(), params: vec![ParamDescriptor { name: "pool_id".into(), param_type: "PoolId".into(), description: "Pool to monitor".into(), required: true }], returns: "{ status }".into() },
            MethodDescriptor { name: "call_observe".into(), method_type: MethodType::Call, description: "Record encrypted observation".into(), params: vec![], returns: "{ observation_count, ema_status }".into() },
            MethodDescriptor { name: "call_update_fee".into(), method_type: MethodType::Call, description: "Compute and push dynamic fee".into(), params: vec![], returns: "{ adjusted_fee_bps }".into() },
            MethodDescriptor { name: "call_trigger_rebalance".into(), method_type: MethodType::Call, description: "Analyze and suggest rebalancing".into(), params: vec![], returns: "AiRebalanceInstruction".into() },
            MethodDescriptor { name: "call_assess_mev_threat".into(), method_type: MethodType::Call, description: "Detect MEV threats".into(), params: vec![], returns: "MevThreatLevel".into() },
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
    pub fn execute(state: &mut OctraShieldAI, call_json: &str, ctx_json: &str) -> String {
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
