module octrashield::ai_engine {
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use std::vector;
    use sui::event;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;

    // ============================================================================
    // Structs
    // ============================================================================

    /// Main AI Engine object that manages pool analysis and fee calculations
    public struct AIEngine has key, store {
        id: UID,
        /// Owner of the AI Engine (governance)
        owner: address,
        /// Factory address that this AI Engine serves
        factory: address,
        /// Map of pool IDs to their analysis data
        pool_analyses: vector<PoolAnalysis>,
        /// Configuration parameters
        config: AIConfig,
        /// Total observations recorded across all pools
        total_observations: u64,
        /// Total fee updates issued
        total_fee_updates: u64,
        /// Total MEV threats detected
        total_mev_detections: u64,
    }

    /// Per-pool analysis state
    public struct PoolAnalysis has key, store {
        id: UID,
        /// Pool identifier
        pool_id: String,
        /// Observation history (ring buffer)
        observations: vector<Observation>,
        /// Maximum observations to keep
        max_observations: u64,
        /// Short-term EMA of price changes
        ema_short: Option<EMAData>,
        /// Long-term EMA of price changes
        ema_long: Option<EMAData>,
        /// Current volatility estimate (basis points scaled)
        volatility: u64,
        /// Last recommended fee in basis points
        last_fee_recommendation: Option<u64>,
        /// Last rebalance suggestion
        last_rebalance: Option<RebalanceInstruction>,
        /// MEV threat assessment
        mev_status: Option<MevThreatLevel>,
        /// Number of observations recorded
        observation_count: u64,
        /// Last observation timestamp
        last_observed_at: u64,
    }

    /// A single observation from a pool
    public struct Observation has key, store {
        id: UID,
        /// Block number when observed
        block_number: u64,
        /// Block timestamp
        timestamp: u64,
        /// Price (scaled integer, e.g., 1e12)
        sqrt_price: u64,
        /// Cumulative volume since last observation
        volume_cumulative: u64,
        /// Liquidity at observation time
        liquidity: u64,
        /// Current tick
        tick: i64,
    }

    /// EMA (Exponential Moving Average) data
    public struct EMAData has key, store {
        id: UID,
        /// Current EMA value
        value: u64,
        /// Window size
        window: u64,
        /// Number of data points incorporated
        count: u64,
    }

    /// AI Configuration parameters
    public struct AIConfig has key, store {
        id: UID,
        /// EMA short window (default: 12 observations)
        ema_short_window: u64,
        /// EMA long window (default: 26 observations)
        ema_long_window: u64,
        /// Minimum fee the AI can set (basis points)
        min_fee_bps: u64,
        /// Maximum fee the AI can set (basis points)
        max_fee_bps: u64,
        /// Number of recent swaps to analyze for MEV detection
        mev_lookback: u64,
        /// Volatility threshold for fee increase (basis points)
        volatility_threshold_high: u64,
        /// Volatility threshold for fee decrease
        volatility_threshold_low: u64,
        /// Maximum observations per pool
        max_observations: u64,
    }

    /// Rebalance instruction for liquidity positions
    public struct RebalanceInstruction has key, store {
        id: UID,
        pool_id: String,
        new_tick_lower: i64,
        new_tick_upper: i64,
        urgency: u8, // 0=Low, 1=Medium, 2=High, 3=Critical
        reason: String,
    }

    /// MEV threat level assessment
    public struct MevThreatLevel has key, store {
        id: UID,
        sandwich_risk: u64, // scaled 0-10000
        frontrun_risk: u64, // scaled 0-10000
        overall_risk: u64,  // scaled 0-10000
        recommended_action: u8, // 0=Clear, 1=IncreaseFee, 2=Delay, 3=Reject
    }

    // ============================================================================
    // Events
    // ============================================================================

    /// Emitted when a pool is initialized for monitoring
    public struct PoolInitializedEvent has copy, drop {
        pool_id: String,
        timestamp: u64,
        config_min_fee: u64,
        config_max_fee: u64,
    }

    /// Emitted when an observation is recorded
    public struct ObservationRecordedEvent has copy, drop {
        pool_id: String,
        observation_count: u64,
        tick: i64,
        timestamp: u64,
    }

    /// Emitted when a fee update is computed
    public struct FeeUpdateEvent has copy, drop {
        pool_id: String,
        base_fee_bps: u64,
        adjusted_fee_bps: u64,
        tick_range: u64,
        observation_count: u64,
    }

    /// Emitted when a rebalance suggestion is generated
    public struct RebalanceSuggestionEvent has copy, drop {
        pool_id: String,
        current_tick: i64,
        new_tick_lower: i64,
        new_tick_upper: i64,
        urgency: u8,
        reason: String,
    }

    /// Emitted when MEV threat is assessed
    public struct MevThreatAssessmentEvent has copy, drop {
        pool_id: String,
        sandwich_risk: u64,
        frontrun_risk: u64,
        overall_risk: u64,
        action: u8,
        total_detections: u64,
    }

    // ============================================================================
    // Constants
    // ============================================================================

    const VOLATILITY_EMA_SHORT: u64 = 12;
    const VOLATILITY_EMA_LONG: u64 = 26;
    const AI_MIN_FEE_BPS: u64 = 5;
    const AI_MAX_FEE_BPS: u64 = 100;
    const SCALE_FACTOR: u64 = 10000;
    const EMA_SCALE: u64 = 10000;

    // ============================================================================
    // Entry Functions
    // ============================================================================

    /// Initialize a new AI Engine
    public entry fun init_ai_engine(
        owner: address,
        factory: address,
        ctx: &mut TxContext
    ) {
        let config = AIConfig {
            id: object::new(ctx),
            ema_short_window: VOLATILITY_EMA_SHORT,
            ema_long_window: VOLATILITY_EMA_LONG,
            min_fee_bps: AI_MIN_FEE_BPS,
            max_fee_bps: AI_MAX_FEE_BPS,
            mev_lookback: 10,
            volatility_threshold_high: 500,
            volatility_threshold_low: 100,
            max_observations: 1000,
        };

        let engine = AIEngine {
            id: object::new(ctx),
            owner,
            factory,
            pool_analyses: vector::empty(),
            config,
            total_observations: 0,
            total_fee_updates: 0,
            total_mev_detections: 0,
        };

        transfer::public_transfer(engine, tx_context::sender(ctx));
    }

    /// Initialize monitoring for a specific pool
    public entry fun initialize_pool(
        engine: &mut AIEngine,
        pool_id: String,
        ctx: &mut TxContext
    ) {
        assert!(address::from(tx_context::sender(ctx)) == engine.owner, 1001);

        // Check if pool already exists
        let exists = vector::contains(&engine.pool_analyses, &pool_id);
        assert!(!exists, 1002);

        let analysis = PoolAnalysis {
            id: object::new(ctx),
            pool_id: string::copy(&pool_id),
            observations: vector::empty(),
            max_observations: engine.config.max_observations,
            ema_short: option::none(),
            ema_long: option::none(),
            volatility: 0,
            last_fee_recommendation: option::none(),
            last_rebalance: option::none(),
            mev_status: option::none(),
            observation_count: 0,
            last_observed_at: 0,
        };

        vector::push_back(&mut engine.pool_analyses, analysis);

        event::emit(PoolInitializedEvent {
            pool_id,
            timestamp: tx_context::epoch(ctx),
            config_min_fee: engine.config.min_fee_bps,
            config_max_fee: engine.config.max_fee_bps,
        });
    }

    /// Record an observation from a pool
    public entry fun observe(
        engine: &mut AIEngine,
        pool_id: String,
        sqrt_price: u64,
        volume: u64,
        liquidity: u64,
        tick: i64,
        ctx: &mut TxContext
    ) {
        let analysis = get_pool_analysis_mut(engine, &pool_id);
        assert!(option::is_some(analysis), 2001);

        let analysis_ref = option::borrow_mut(analysis);

        // Create observation
        let observation = Observation {
            id: object::new(ctx),
            block_number: tx_context::epoch(ctx),
            timestamp: tx_context::epoch(ctx),
            sqrt_price,
            volume_cumulative: volume,
            liquidity,
            tick,
        };

        // Add to ring buffer
        if (vector::length(&analysis_ref->observations) >= analysis_ref->max_observations) {
            vector::remove(&mut analysis_ref->observations, 0);
        }
        vector::push_back(&mut analysis_ref->observations, observation);
        analysis_ref->observation_count = analysis_ref->observation_count + 1;
        analysis_ref->last_observed_at = tx_context::epoch(ctx);

        // Update EMAs if we have enough observations
        if (analysis_ref->observation_count >= 2) {
            let obs_len = vector::length(&analysis_ref->observations);
            let prev_obs = vector::borrow(&analysis_ref->observations, obs_len - 2);
            let curr_obs = vector::borrow(&analysis_ref->observations, obs_len - 1);

            // Compute price change (squared for volatility)
            let price_change = if (curr_obs.sqrt_price > prev_obs.sqrt_price) {
                curr_obs.sqrt_price - prev_obs.sqrt_price
            } else {
                prev_obs.sqrt_price - curr_obs.sqrt_price
            };
            let price_change_sq = (price_change * price_change) / SCALE_FACTOR;

            // Update short-term EMA
            update_ema(analysis_ref, price_change_sq, engine.config.ema_short_window, true);
            // Update long-term EMA
            update_ema(analysis_ref, price_change_sq, engine.config.ema_long_window, false);

            // Update volatility from short EMA
            if (option::is_some(&analysis_ref->ema_short)) {
                let ema_short = option::borrow(&analysis_ref->ema_short);
                analysis_ref->volatility = ema_short.value;
            }
        }

        engine.total_observations = engine.total_observations + 1;

        event::emit(ObservationRecordedEvent {
            pool_id,
            observation_count: analysis_ref->observation_count,
            tick,
            timestamp: tx_context::epoch(ctx),
        });
    }

    /// Update dynamic fee for a pool based on volatility
    public entry fun update_fee(
        engine: &mut AIEngine,
        pool_id: String,
        base_fee_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(address::from(tx_context::sender(ctx)) == engine.owner, 1001);

        let analysis = get_pool_analysis_mut(engine, &pool_id);
        assert!(option::is_some(analysis), 2001);
        let analysis_ref = option::borrow_mut(analysis);

        assert!(analysis_ref->observation_count >= engine.config.ema_short_window, 2002);

        // Calculate tick range as proxy for volatility
        let tick_range = calculate_tick_range(analysis_ref);

        // Compute adjusted fee based on volatility
        let adjusted_fee = if (tick_range > engine.config.volatility_threshold_high) {
            // High volatility: increase fee
            std::cmp::min(base_fee_bps * 2, engine.config.max_fee_bps)
        } else if (tick_range < engine.config.volatility_threshold_low) {
            // Low volatility: decrease fee
            std::cmp::max(base_fee_bps / 2, engine.config.min_fee_bps)
        } else {
            // Proportional adjustment
            let ratio = (tick_range * 100) / engine.config.volatility_threshold_high;
            let adjustment = (base_fee_bps * ratio) / 100;
            std::cmp::min(base_fee_bps + adjustment, engine.config.max_fee_bps)
        };

        analysis_ref->last_fee_recommendation = option::some(adjusted_fee);
        engine.total_fee_updates = engine.total_fee_updates + 1;

        event::emit(FeeUpdateEvent {
            pool_id,
            base_fee_bps,
            adjusted_fee_bps: adjusted_fee,
            tick_range,
            observation_count: analysis_ref->observation_count,
        });
    }

    /// Trigger rebalance analysis for a pool
    public entry fun trigger_rebalance(
        engine: &mut AIEngine,
        pool_id: String,
        current_tick_lower: i64,
        current_tick_upper: i64,
        ctx: &mut TxContext
    ) {
        let analysis = get_pool_analysis_mut(engine, &pool_id);
        assert!(option::is_some(analysis), 2001);
        let analysis_ref = option::borrow_mut(analysis);

        assert!(vector::length(&analysis_ref->observations) > 0, 2003);

        let current_tick = vector::borrow(&analysis_ref->observations, vector::length(&analysis_ref->observations) - 1).tick;
        let tick_range = current_tick_upper - current_tick_lower;
        let range_center = (current_tick_upper + current_tick_lower) / 2;
        let distance_from_center = if (current_tick > range_center) {
            current_tick - range_center
        } else {
            range_center - current_tick
        };
        let range_half = tick_range / 2;

        let (urgency, new_lower, new_upper, reason) = if (current_tick < current_tick_lower || current_tick > current_tick_upper) {
            // Price completely outside range - Critical
            (3, current_tick - range_half, current_tick + range_half, 
             string::utf8(b"Price moved outside position range. Immediate rebalance recommended."))
        } else if (distance_from_center > (range_half * 80 / 100)) {
            // Price near edge - High urgency
            (2, current_tick - range_half, current_tick + range_half,
             string::utf8(b"Price near edge of range (>80%). Rebalance soon."))
        } else if (distance_from_center > (range_half * 60 / 100)) {
            // Price drifting - Medium urgency
            let drift_direction = if (current_tick > range_center) { 1 } else { -1 };
            let shift = tick_range / 4 * drift_direction;
            (1, current_tick_lower + shift, current_tick_upper + shift,
             string::utf8(b"Price drifting from center (>60%). Consider rebalancing."))
        } else {
            // Price centered - Low urgency
            (0, current_tick_lower, current_tick_upper,
             string::utf8(b"Price well-centered. No rebalance needed."))
        };

        let instruction = RebalanceInstruction {
            id: object::new(ctx),
            pool_id: string::copy(&pool_id),
            new_tick_lower: new_lower,
            new_tick_upper: new_upper,
            urgency,
            reason,
        };

        analysis_ref->last_rebalance = option::some(instruction);

        event::emit(RebalanceSuggestionEvent {
            pool_id,
            current_tick,
            new_tick_lower,
            new_tick_upper,
            urgency,
            reason: string::utf8(b""), // Simplified for event
        });
    }

    /// Assess MEV threat for a pool
    public entry fun assess_mev_threat(
        engine: &mut AIEngine,
        pool_id: String,
        ctx: &mut TxContext
    ) {
        let analysis = get_pool_analysis_mut(engine, &pool_id);
        assert!(option::is_some(analysis), 2001);
        let analysis_ref = option::borrow_mut(analysis);

        let lookback = std::cmp::min(engine.config.mev_lookback, vector::length(&analysis_ref->observations));

        if (lookback < 3) {
            // Not enough data for MEV analysis
            let threat = MevThreatLevel {
                id: object::new(ctx),
                sandwich_risk: 0,
                frontrun_risk: 0,
                overall_risk: 0,
                recommended_action: 0, // Clear
            };
            analysis_ref->mev_status = option::some(threat);
            return;
        }

        let recent = vector::slice(&analysis_ref->observations, vector::length(&analysis_ref->observations) - lookback, lookback);

        // Sandwich detection: look for tick reversal patterns
        let mut max_reversal: u64 = 0;
        let mut i = 0;
        while (i + 2 < lookback) {
            let obs1 = vector::borrow(&recent, i);
            let obs2 = vector::borrow(&recent, i + 1);
            let obs3 = vector::borrow(&recent, i + 2);

            let delta1 = obs2.tick - obs1.tick;
            let delta2 = obs3.tick - obs2.tick;

            // Reversal: opposite directions
            if ((delta1 > 0 && delta2 < 0) || (delta1 < 0 && delta2 > 0)) {
                let reversal = (if (delta1 > 0) { delta1 } else { -delta1 } + 
                               if (delta2 > 0) { delta2 } else { -delta2 }) / 2;
                if (reversal > max_reversal) {
                    max_reversal = reversal;
                }
            }
            i = i + 1;
        };

        // Front-run detection: look for large tick jumps in same block
        let mut same_block_jumps: u64 = 0;
        i = 0;
        while (i + 1 < lookback) {
            let obs1 = vector::borrow(&recent, i);
            let obs2 = vector::borrow(&recent, i + 1);

            if (obs1.block_number == obs2.block_number) {
                let jump = if (obs2.tick > obs1.tick) { obs2.tick - obs1.tick } else { obs1.tick - obs2.tick };
                if (jump > 10) {
                    same_block_jumps = same_block_jumps + 1;
                }
            }
            i = i + 1;
        };

        // Compute risk scores (scaled 0-10000)
        let sandwich_risk = std::cmp::min((max_reversal * 10000) / 100, 10000);
        let frontrun_risk = if (lookback > 0) {
            std::cmp::min((same_block_jumps * 10000) / lookback, 10000)
        } else {
            0
        };
        let overall_risk = (sandwich_risk * 6 + frontrun_risk * 4) / 10;

        // Determine action
        let recommended_action = if (overall_risk > 8000) {
            3 // Reject
        } else if (overall_risk > 5000) {
            2 // Delay
        } else if (overall_risk > 2000) {
            1 // IncreaseFee
        } else {
            0 // Clear
        };

        if (overall_risk > 2000) {
            engine.total_mev_detections = engine.total_mev_detections + 1;
        }

        let threat = MevThreatLevel {
            id: object::new(ctx),
            sandwich_risk,
            frontrun_risk,
            overall_risk,
            recommended_action,
        };

        analysis_ref->mev_status = option::some(threat);

        event::emit(MevThreatAssessmentEvent {
            pool_id,
            sandwich_risk,
            frontrun_risk,
            overall_risk,
            action: recommended_action,
            total_detections: engine.total_mev_detections,
        });
    }

    // ============================================================================
    // Helper Functions
    // ============================================================================

    /// Get mutable reference to pool analysis
    fun get_pool_analysis_mut(engine: &mut AIEngine, pool_id: &String): &mut Option<PoolAnalysis> {
        let mut i = 0;
        let len = vector::length(&engine.pool_analyses);
        while (i < len) {
            let analysis = vector::borrow_mut(&mut engine.pool_analyses, i);
            if (string::equals(&analysis.pool_id, pool_id)) {
                return option::some(analysis);
            }
            i = i + 1;
        };
        option::none()
    }

    /// Update EMA for a pool analysis
    fun update_ema(
        analysis: &mut PoolAnalysis,
        new_value: u64,
        window: u64,
        is_short: bool
    ) {
        let alpha_scaled = (2 * EMA_SCALE) / (window + 1);
        let complement = EMA_SCALE - alpha_scaled;

        let ema_value = if (is_short) {
            match (&analysis.ema_short) {
                option::some(prev_ema) => {
                    let weighted_new = (new_value * alpha_scaled) / EMA_SCALE;
                    let weighted_old = (prev_ema.value * complement) / EMA_SCALE;
                    weighted_new + weighted_old
                },
                option::none() => new_value,
            }
        } else {
            match (&analysis.ema_long) {
                option::some(prev_ema) => {
                    let weighted_new = (new_value * alpha_scaled) / EMA_SCALE;
                    let weighted_old = (prev_ema.value * complement) / EMA_SCALE;
                    weighted_new + weighted_old
                },
                option::none() => new_value,
            }
        };

        let ema_data = EMAData {
            id: object::new(&mut TxContext::dummy()), // Would need proper context
            value: ema_value,
            window,
            count: if (is_short) {
                match (&analysis.ema_short) {
                    option::some(prev) => prev.count + 1,
                    option::none() => 1,
                }
            } else {
                match (&analysis.ema_long) {
                    option::some(prev) => prev.count + 1,
                    option::none() => 1,
                }
            },
        };

        if (is_short) {
            analysis.ema_short = option::some(ema_data);
        } else {
            analysis.ema_long = option::some(ema_data);
        }
    }

    /// Calculate tick range from observations
    fun calculate_tick_range(analysis: &PoolAnalysis): u64 {
        if (vector::length(&analysis.observations) < 2) {
            return 0;
        };

        let first_obs = vector::borrow(&analysis.observations, 0);
        let last_obs = vector::borrow(&analysis.observations, vector::length(&analysis.observations) - 1);

        let tick_diff = if (last_obs.tick > first_obs.tick) {
            last_obs.tick - first_obs.tick
        } else {
            first_obs.tick - last_obs.tick
        };

        tick_diff as u64
    }

    // ============================================================================
    // View Functions (Read-only)
    // ============================================================================

    /// Get volatility for a pool
    public fun view_volatility(engine: &AIEngine, pool_id: &String): u64 {
        match get_pool_analysis(engine, pool_id) {
            option::some(analysis) => analysis.volatility,
            option::none() => 0,
        }
    }

    /// Get fee recommendation for a pool
    public fun view_fee_recommendation(engine: &AIEngine, pool_id: &String): Option<u64> {
        match get_pool_analysis(engine, pool_id) {
            option::some(analysis) => analysis.last_fee_recommendation,
            option::none() => option::none(),
        }
    }

    /// Get MEV status for a pool
    public fun view_mev_status(engine: &AIEngine, pool_id: &String): Option<MevThreatLevel> {
        match get_pool_analysis(engine, pool_id) {
            option::some(analysis) => analysis.mev_status,
            option::none() => option::none(),
        }
    }

    /// Get observation count for a pool
    public fun view_observation_count(engine: &AIEngine, pool_id: &String): u64 {
        match get_pool_analysis(engine, pool_id) {
            option::some(analysis) => analysis.observation_count,
            option::none() => 0,
        }
    }

    /// Get AI configuration
    public fun view_ai_config(engine: &AIEngine): AIConfig {
        engine.config
    }

    /// Get pool analysis (read-only)
    fun get_pool_analysis(engine: &AIEngine, pool_id: &String): Option<PoolAnalysis> {
        let mut i = 0;
        let len = vector::length(&engine.pool_analyses);
        while (i < len) {
            let analysis = vector::borrow(&engine.pool_analyses, i);
            if (string::equals(&analysis.pool_id, pool_id)) {
                return option::some(analysis);
            }
            i = i + 1;
        };
        option::none()
    }
}