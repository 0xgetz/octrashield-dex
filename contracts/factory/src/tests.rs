//! Tests for OctraShieldFactory — Pool deployment and registry.
//!
//! Coverage:
//!   - Pool creation (happy path, duplicate rejection, fee tier validation)
//!   - Pool registry queries (get_pool, all_pools, pools_by_token)
//!   - Fee tier management (enable/disable, owner-only)
//!   - Owner authorization checks
//!   - Token pair ordering (token0 < token1 invariant)
//!   - Pool count tracking

#[cfg(test)]
mod factory_tests {
    use crate::OctraShieldFactory;
    use octrashield_shared::{
        OctraAddress, PoolId, ExecContext,
        ShieldError, ExecutionInterface, OCS01Contract,
    };
    use octra_hfhe::PubKey;

    fn addr(s: &str) -> OctraAddress { OctraAddress::from_str(s) }

    fn make_ctx(sender: &str, timestamp: u64, pk: &PubKey) -> ExecContext {
        ExecContext {
            sender: OctraAddress::from_str(sender),
            block_timestamp: timestamp,
            block_height: 1,
            network_pk: borsh::to_vec(pk).unwrap(),
        }
    }

    fn test_pk() -> PubKey {
        let seed = [42u8; 32];
        let sk = octra_hfhe::SecKey::from_seed(&seed);
        PubKey::from_secret(&sk)
    }

    fn new_factory() -> OctraShieldFactory {
        let mut factory = OctraShieldFactory::new();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);
        factory.initialize(&ctx, addr("deployer"), addr("pair_code"), addr("lp_code"))
            .expect("factory init failed");
        factory
    }

    // ================================================================
    // Pool Creation
    // ================================================================

    #[test]
    fn test_create_pool_success() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        let response = factory.create_pool(
            &ctx, &pk,
            addr("tokenA"), addr("tokenB"),
            30,  // 30 bps
        ).expect("create_pool failed");

        assert!(response.success);
        assert!(response.data["pool_address"].is_string());
        assert!(response.events.len() > 0);
    }

    #[test]
    fn test_create_pool_orders_tokens() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        // Pass tokenB before tokenA — factory should sort them
        let response = factory.create_pool(
            &ctx, &pk,
            addr("tokenZ"), addr("tokenA"),
            30,
        ).unwrap();

        // The pool should have token0 < token1
        let pool_data = &response.data;
        let t0 = pool_data["token0"].as_str().unwrap();
        let t1 = pool_data["token1"].as_str().unwrap();
        assert!(t0 <= t1, "token0 should be <= token1, got {} and {}", t0, t1);
    }

    #[test]
    fn test_create_duplicate_pool_rejected() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenB"), 30).unwrap();

        // Same pair + same fee = duplicate
        let result = factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenB"), 30);
        assert!(result.is_err(), "Duplicate pool should be rejected");
    }

    #[test]
    fn test_create_same_pair_different_fee_allowed() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenB"), 30).unwrap();

        // Same pair, different fee tier = allowed
        let result = factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenB"), 100);
        assert!(result.is_ok(), "Same pair with different fee should be allowed");
    }

    #[test]
    fn test_create_pool_same_token_rejected() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        let result = factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenA"), 30);
        assert!(result.is_err(), "Same token pair should be rejected");
    }

    // ================================================================
    // Pool Registry Queries
    // ================================================================

    #[test]
    fn test_get_pool_by_address() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        let response = factory.create_pool(&ctx, &pk, addr("tokenA"), addr("tokenB"), 30).unwrap();
        let pool_addr = response.data["pool_address"].as_str().unwrap().to_string();

        let pool = factory.get_pool(&pool_addr).unwrap();
        assert!(pool.is_some());
    }

    #[test]
    fn test_get_pool_not_found() {
        let factory = new_factory();
        let pool = factory.get_pool("nonexistent").unwrap();
        assert!(pool.is_none());
    }

    #[test]
    fn test_all_pools_count() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        factory.create_pool(&ctx, &pk, addr("A"), addr("B"), 30).unwrap();
        factory.create_pool(&ctx, &pk, addr("C"), addr("D"), 30).unwrap();
        factory.create_pool(&ctx, &pk, addr("E"), addr("F"), 100).unwrap();

        let pools = factory.all_pools().unwrap();
        let arr = pools.as_array().unwrap();
        assert_eq!(arr.len(), 3);
    }

    #[test]
    fn test_pools_by_token() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        factory.create_pool(&ctx, &pk, addr("WETH"), addr("USDC"), 30).unwrap();
        factory.create_pool(&ctx, &pk, addr("WETH"), addr("DAI"), 30).unwrap();
        factory.create_pool(&ctx, &pk, addr("USDC"), addr("DAI"), 5).unwrap();

        let weth_pools = factory.pools_by_token("WETH").unwrap();
        let weth_arr = weth_pools.as_array().unwrap();
        assert_eq!(weth_arr.len(), 2, "WETH should appear in 2 pools");
    }

    // ================================================================
    // Fee Tier Management
    // ================================================================

    #[test]
    fn test_fee_tier_enable() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        let result = factory.enable_fee_tier(&ctx, 500, 100); // 5%, spacing 100
        assert!(result.is_ok());
    }

    #[test]
    fn test_fee_tier_enable_non_owner_rejected() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("random_user", 1000, &pk);

        let result = factory.enable_fee_tier(&ctx, 500, 100);
        assert!(matches!(result, Err(ShieldError::Unauthorized)));
    }

    // ================================================================
    // Pool Count
    // ================================================================

    #[test]
    fn test_pool_count_increments() {
        let mut factory = new_factory();
        let pk = test_pk();
        let ctx = make_ctx("deployer", 1000, &pk);

        assert_eq!(factory.pool_count(), 0);
        factory.create_pool(&ctx, &pk, addr("A"), addr("B"), 30).unwrap();
        assert_eq!(factory.pool_count(), 1);
        factory.create_pool(&ctx, &pk, addr("C"), addr("D"), 30).unwrap();
        assert_eq!(factory.pool_count(), 2);
    }

    // ================================================================
    // OCS01 Metadata
    // ================================================================

    #[test]
    fn test_factory_contract_name() {
        let factory = new_factory();
        assert_eq!(factory.name(), "OctraShieldFactory");
    }

    #[test]
    fn test_factory_methods_registry() {
        let factory = new_factory();
        let methods = factory.methods();
        assert!(methods.len() >= 5, "Factory should have >= 5 methods");
    }
}
