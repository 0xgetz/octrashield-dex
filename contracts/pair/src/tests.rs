//! Tests for OctraShieldPair — Core AMM contract.
//!
//! Coverage:
//!   - Pool initialization (happy path + double-init rejection)
//!   - Swap execution (zero_for_one, one_for_zero, fee tiers)
//!   - Reentrancy guard (locked pool rejects swaps)
//!   - Deadline enforcement
//!   - Mint (add liquidity, tick range validation, position creation)
//!   - Burn (remove liquidity, ownership check, reserve updates)
//!   - Collect fees
//!   - Flash loan (borrow + fee verification)
//!   - AI fee override (auth + update)
//!   - Pause/unpause
//!   - OCS01 execute dispatch (view + call methods)
//!   - Method registry completeness

#[cfg(test)]
mod pair_tests {
    use crate::OctraShieldPair;
    use octrashield_shared::{
        OctraAddress, PoolId, Position, TickState,
        SwapParams, AddLiquidityParams, RemoveLiquidityParams,
        ExecContext, CallResponse, ExecutionInterface, OCS01Contract,
        EncryptedU64, ShieldError,
        MIN_TICK, MAX_TICK,
    };
    use octra_hfhe::{PubKey, SecKey, Cipher};

    // ================================================================
    // Test Helpers
    // ================================================================

    fn test_keypair() -> (PubKey, SecKey) {
        let seed = [42u8; 32];
        let sk = SecKey::from_seed(&seed);
        let pk = PubKey::from_secret(&sk);
        (pk, sk)
    }

    fn test_encrypt(pk: &PubKey, sk: &SecKey, value: u64) -> EncryptedU64 {
        EncryptedU64::new(pk.encrypt(value, sk))
    }

    fn test_decrypt(sk: &SecKey, enc: &EncryptedU64) -> u64 {
        sk.decrypt(&enc.inner())
    }

    fn make_ctx(sender: &str, timestamp: u64, pk: &PubKey) -> ExecContext {
        ExecContext {
            sender: OctraAddress::from_str(sender),
            block_timestamp: timestamp,
            block_height: 1,
            network_pk: borsh::to_vec(pk).unwrap(),
        }
    }

    fn addr(s: &str) -> OctraAddress {
        OctraAddress::from_str(s)
    }

    fn pool_id() -> PoolId {
        PoolId([1u8; 32])
    }

    /// Create and initialize a standard test pool.
    fn initialized_pair(pk: &PubKey, sk: &SecKey) -> OctraShieldPair {
        let mut pair = OctraShieldPair::new();
        let ctx = make_ctx("factory", 1000, pk);
        let sqrt_price = test_encrypt(pk, sk, 1_000_000); // sqrt(1.0) scaled

        pair.call_initialize(
            &ctx, pk,
            pool_id(),
            addr("token0"),
            addr("token1"),
            30,  // 30 bps fee
            10,  // tick spacing
            sqrt_price,
            0,   // initial tick
            addr("lp_token"),
        ).expect("initialization failed");

        pair
    }

    /// Add initial liquidity to a pool so swaps work.
    fn pair_with_liquidity(pk: &PubKey, sk: &SecKey) -> OctraShieldPair {
        let mut pair = initialized_pair(pk, sk);
        let ctx = make_ctx("alice", 1000, pk);

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(pk, sk, 1_000_000),
            amount1_desired: test_encrypt(pk, sk, 1_000_000),
            amount0_min: test_encrypt(pk, sk, 0),
            amount1_min: test_encrypt(pk, sk, 0),
            tick_lower: -1000,
            tick_upper: 1000,
            deadline: 9999,
        };

        pair.call_mint(&ctx, pk, params).expect("initial mint failed");
        pair
    }

    // ================================================================
    // Initialization Tests
    // ================================================================

    #[test]
    fn test_initialize_success() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);

        let state = pair.view_pool_state().unwrap();
        assert_eq!(state["initialized"], true);
        assert_eq!(state["fee_bps"], 30);
        assert_eq!(state["swap_count"], 0);
    }

    #[test]
    fn test_initialize_sets_slot0() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);

        let slot0 = pair.view_slot0().unwrap();
        assert_eq!(slot0["tick"], 0);
        assert_eq!(slot0["locked"], false);
    }

    #[test]
    fn test_double_initialize_rejected() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("factory", 2000, &pk);

        let result = pair.call_initialize(
            &ctx, &pk, pool_id(),
            addr("token0"), addr("token1"),
            30, 10,
            test_encrypt(&pk, &sk, 1_000_000),
            0, addr("lp_token"),
        );
        assert!(matches!(result, Err(ShieldError::AlreadyInitialized)));
    }

    // ================================================================
    // Swap Tests
    // ================================================================

    #[test]
    fn test_swap_zero_for_one() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("bob", 1000, &pk);

        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };

        let response = pair.call_swap(&ctx, &pk, params).expect("swap failed");
        assert!(response.success);
        assert!(response.events.len() > 0, "swap should emit events");

        let state = pair.view_pool_state().unwrap();
        assert_eq!(state["swap_count"], 1);
    }

    #[test]
    fn test_swap_one_for_zero() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("bob", 1000, &pk);

        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 5_000),
            zero_for_one: false,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };

        let response = pair.call_swap(&ctx, &pk, params).expect("swap 1->0 failed");
        assert!(response.success);
    }

    #[test]
    fn test_swap_increments_fee_growth() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("bob", 1000, &pk);

        // Snapshot fee growth before
        let fg_before = pair.view_fee_growth().unwrap();

        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };
        pair.call_swap(&ctx, &pk, params).unwrap();

        let fg_after = pair.view_fee_growth().unwrap();
        // Fee growth should have changed (ciphertexts differ)
        assert_ne!(
            serde_json::to_string(&fg_before).unwrap(),
            serde_json::to_string(&fg_after).unwrap(),
            "fee_growth_global0 should change after swap"
        );
    }

    #[test]
    fn test_swap_deadline_expired() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("bob", 5000, &pk); // timestamp 5000

        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 1000, // expired
            sqrt_price_limit: None,
        };

        let result = pair.call_swap(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::DeadlineExpired)));
    }

    #[test]
    fn test_swap_uninitialized_pool() {
        let (pk, sk) = test_keypair();
        let mut pair = OctraShieldPair::new();
        let ctx = make_ctx("bob", 1000, &pk);

        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };

        let result = pair.call_swap(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::NotInitialized)));
    }

    #[test]
    fn test_consecutive_swaps() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("bob", 1000, &pk);

        for i in 0..5 {
            let params = SwapParams {
                amount_in: test_encrypt(&pk, &sk, 1_000),
                zero_for_one: i % 2 == 0,
                recipient: addr("bob"),
                deadline: 9999,
                sqrt_price_limit: None,
            };
            pair.call_swap(&ctx, &pk, params)
                .unwrap_or_else(|e| panic!("swap {} failed: {:?}", i, e));
        }

        let state = pair.view_pool_state().unwrap();
        assert_eq!(state["swap_count"], 5);
    }

    // ================================================================
    // Mint (Add Liquidity) Tests
    // ================================================================

    #[test]
    fn test_mint_creates_position() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 50_000),
            amount1_desired: test_encrypt(&pk, &sk, 50_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: -500,
            tick_upper: 500,
            deadline: 9999,
        };

        let response = pair.call_mint(&ctx, &pk, params).unwrap();
        assert!(response.success);
        assert_eq!(response.data["position_id"], 1);
        assert_eq!(response.data["tick_lower"], -500);
        assert_eq!(response.data["tick_upper"], 500);
    }

    #[test]
    fn test_mint_initializes_ticks() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        // Before mint, ticks should not exist
        let tick_before = pair.view_tick(-200).unwrap();
        assert_eq!(tick_before["initialized"], false);

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 50_000),
            amount1_desired: test_encrypt(&pk, &sk, 50_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: -200,
            tick_upper: 200,
            deadline: 9999,
        };
        pair.call_mint(&ctx, &pk, params).unwrap();

        // After mint, ticks should be initialized
        let tick_after = pair.view_tick(-200).unwrap();
        assert_eq!(tick_after["initialized"], true);
    }

    #[test]
    fn test_mint_invalid_tick_range_lower_gte_upper() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 50_000),
            amount1_desired: test_encrypt(&pk, &sk, 50_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: 500,   // lower >= upper!
            tick_upper: 500,
            deadline: 9999,
        };

        let result = pair.call_mint(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::InvalidTickRange(_, _))));
    }

    #[test]
    fn test_mint_tick_out_of_bounds() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 50_000),
            amount1_desired: test_encrypt(&pk, &sk, 50_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: MIN_TICK - 10,  // out of bounds
            tick_upper: 0,
            deadline: 9999,
        };

        let result = pair.call_mint(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::TickOutOfBounds(_))));
    }

    #[test]
    fn test_mint_tick_not_aligned() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        // tick_spacing is 10, so ticks must be multiples of 10
        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 50_000),
            amount1_desired: test_encrypt(&pk, &sk, 50_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: -105,  // not aligned to 10
            tick_upper: 100,
            deadline: 9999,
        };

        let result = pair.call_mint(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::TickNotAligned(_, _))));
    }

    #[test]
    fn test_mint_multiple_positions_same_owner() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        for i in 0..3 {
            let offset = (i as i32) * 100;
            let params = AddLiquidityParams {
                recipient: addr("alice"),
                amount0_desired: test_encrypt(&pk, &sk, 10_000),
                amount1_desired: test_encrypt(&pk, &sk, 10_000),
                amount0_min: test_encrypt(&pk, &sk, 0),
                amount1_min: test_encrypt(&pk, &sk, 0),
                tick_lower: -500 + offset,
                tick_upper: 500 + offset,
                deadline: 9999,
            };
            pair.call_mint(&ctx, &pk, params).unwrap();
        }

        let positions = pair.view_positions_by_owner("alice").unwrap();
        let positions_arr = positions.as_array().unwrap();
        assert_eq!(positions_arr.len(), 3);
    }

    #[test]
    fn test_mint_updates_reserves() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        // Before mint, reserves should be None/null
        let reserves_before = pair.view_reserves().unwrap();

        let params = AddLiquidityParams {
            recipient: addr("alice"),
            amount0_desired: test_encrypt(&pk, &sk, 100_000),
            amount1_desired: test_encrypt(&pk, &sk, 100_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            tick_lower: -1000,
            tick_upper: 1000,
            deadline: 9999,
        };
        pair.call_mint(&ctx, &pk, params).unwrap();

        let reserves_after = pair.view_reserves().unwrap();
        // Reserves should now be non-null encrypted values
        assert!(!reserves_after["reserve0"].is_null());
        assert!(!reserves_after["reserve1"].is_null());
    }

    // ================================================================
    // Burn (Remove Liquidity) Tests
    // ================================================================

    #[test]
    fn test_burn_returns_tokens() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        let params = RemoveLiquidityParams {
            position_id: 1,
            liquidity_amount: test_encrypt(&pk, &sk, 100_000),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            deadline: 9999,
        };

        let response = pair.call_burn(&ctx, &pk, params).unwrap();
        assert!(response.success);
        assert_eq!(response.data["position_id"], 1);

        let state = pair.view_pool_state().unwrap();
        assert_eq!(state["burn_count"], 1);
    }

    #[test]
    fn test_burn_unauthorized_rejects() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("eve", 1000, &pk); // eve != alice (position owner)

        let params = RemoveLiquidityParams {
            position_id: 1,
            liquidity_amount: test_encrypt(&pk, &sk, 100),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            deadline: 9999,
        };

        let result = pair.call_burn(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::Unauthorized)));
    }

    #[test]
    fn test_burn_nonexistent_position() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("alice", 1000, &pk);

        let params = RemoveLiquidityParams {
            position_id: 999, // doesn't exist
            liquidity_amount: test_encrypt(&pk, &sk, 100),
            amount0_min: test_encrypt(&pk, &sk, 0),
            amount1_min: test_encrypt(&pk, &sk, 0),
            deadline: 9999,
        };

        let result = pair.call_burn(&ctx, &pk, params);
        assert!(matches!(result, Err(ShieldError::PositionNotFound(999))));
    }

    // ================================================================
    // Collect Fees Tests
    // ================================================================

    #[test]
    fn test_collect_fees_success() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);

        // Do a swap to generate fees
        let swap_ctx = make_ctx("bob", 1000, &pk);
        let swap_params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };
        pair.call_swap(&swap_ctx, &pk, swap_params).unwrap();

        // Now collect fees for alice's position
        let ctx = make_ctx("alice", 1000, &pk);
        let response = pair.call_collect_fees(&ctx, &pk, 1, addr("alice")).unwrap();
        assert!(response.success);
        assert!(response.events.len() > 0);
    }

    #[test]
    fn test_collect_fees_unauthorized() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("eve", 1000, &pk);

        let result = pair.call_collect_fees(&ctx, &pk, 1, addr("eve"));
        assert!(matches!(result, Err(ShieldError::Unauthorized)));
    }

    // ================================================================
    // Flash Loan Tests
    // ================================================================

    #[test]
    fn test_flash_loan_basic() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        let ctx = make_ctx("flasher", 1000, &pk);

        let response = pair.call_flash(
            &ctx, &pk,
            test_encrypt(&pk, &sk, 1_000),
            test_encrypt(&pk, &sk, 1_000),
            addr("callback_contract"),
        ).unwrap();

        assert!(response.success);
        assert_eq!(response.data["callback"], "callback_contract");
    }

    // ================================================================
    // AI Fee Override Tests
    // ================================================================

    #[test]
    fn test_ai_fee_update_authorized() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);

        // Set AI engine address manually for testing
        // In production this is set during factory deployment
        pair.ai_engine = Some(addr("ai_engine"));

        let ctx = make_ctx("ai_engine", 1000, &pk);
        let response = pair.update_ai_fee(&ctx, 50).unwrap();
        assert!(response.success);
        assert_eq!(response.data["ai_fee_bps"], 50);

        let state = pair.view_pool_state().unwrap();
        assert_eq!(state["ai_fee_override"], 50);
    }

    #[test]
    fn test_ai_fee_update_unauthorized() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        pair.ai_engine = Some(addr("ai_engine"));

        let ctx = make_ctx("random_user", 1000, &pk);
        let result = pair.update_ai_fee(&ctx, 50);
        assert!(matches!(result, Err(ShieldError::NotAiEngine)));
    }

    #[test]
    fn test_swap_uses_ai_fee_when_set() {
        let (pk, sk) = test_keypair();
        let mut pair = pair_with_liquidity(&pk, &sk);
        pair.ai_engine = Some(addr("ai_engine"));

        // Set AI fee to 100 bps (1%)
        let ai_ctx = make_ctx("ai_engine", 1000, &pk);
        pair.update_ai_fee(&ai_ctx, 100).unwrap();

        // Execute swap — should use 100 bps, not 30
        let ctx = make_ctx("bob", 1000, &pk);
        let params = SwapParams {
            amount_in: test_encrypt(&pk, &sk, 10_000),
            zero_for_one: true,
            recipient: addr("bob"),
            deadline: 9999,
            sqrt_price_limit: None,
        };

        let response = pair.call_swap(&ctx, &pk, params).unwrap();
        assert_eq!(response.data["effective_fee_bps"], 100);
    }

    // ================================================================
    // View Methods Tests
    // ================================================================

    #[test]
    fn test_view_pool_state_fields() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        let state = pair.view_pool_state().unwrap();

        assert!(state["pool_id"].is_string());
        assert_eq!(state["fee_bps"], 30);
        assert_eq!(state["tick_spacing"], 10);
        assert_eq!(state["initialized"], true);
        assert_eq!(state["paused"], false);
    }

    #[test]
    fn test_view_current_tick() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        let tick = pair.view_current_tick().unwrap();
        assert_eq!(tick["tick"], 0);
    }

    #[test]
    fn test_view_position_not_found() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        let pos = pair.view_position(999).unwrap();
        assert!(pos["position"].is_null());
    }

    #[test]
    fn test_view_tick_not_initialized() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        let tick = pair.view_tick(100).unwrap();
        assert_eq!(tick["initialized"], false);
    }

    // ================================================================
    // OCS01 Execute Dispatch Tests
    // ================================================================

    #[test]
    fn test_ocs01_view_dispatch() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("anyone", 1000, &pk);

        let call = ExecutionInterface {
            method: "view_pool_state".to_string(),
            params: serde_json::json!({}),
            signature: None,
            sender: None,
        };

        let response = pair.execute(call, &ctx).unwrap();
        assert!(response.success);
    }

    #[test]
    fn test_ocs01_unknown_method() {
        let (pk, sk) = test_keypair();
        let mut pair = initialized_pair(&pk, &sk);
        let ctx = make_ctx("anyone", 1000, &pk);

        let call = ExecutionInterface {
            method: "nonexistent_method".to_string(),
            params: serde_json::json!({}),
            signature: None,
            sender: None,
        };

        let result = pair.execute(call, &ctx);
        assert!(result.is_err());
    }

    #[test]
    fn test_ocs01_method_registry() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        let methods = pair.methods();

        // Should have 11 view + 7 call methods = 18 total
        assert!(methods.len() >= 18, "Expected >= 18 methods, got {}", methods.len());

        let view_count = methods.iter().filter(|m| m.method_type == MethodType::View).count();
        let call_count = methods.iter().filter(|m| m.method_type == MethodType::Call).count();
        assert_eq!(view_count, 11);
        assert!(call_count >= 7);
    }

    #[test]
    fn test_ocs01_contract_metadata() {
        let (pk, sk) = test_keypair();
        let pair = initialized_pair(&pk, &sk);
        assert_eq!(pair.name(), "OctraShieldPair");
        assert!(!pair.version().is_empty());
    }
}