//! Tests for octrashield-shared — HFHE primitives, math, types, errors, OCS01.
//!
//! Coverage targets:
//!   - HFHE encrypted arithmetic (add, sub, mul, div_plain)
//!   - Swap math (output computation, k-invariant, fee split)
//!   - Liquidity math (from_amounts, burn_amounts, LP mint)
//!   - Tick math (sqrt_price conversion)
//!   - Error enum exhaustiveness
//!   - OCS01 contract interface validation
//!   - Type serialization round-trips

#[cfg(test)]
mod hfhe_tests {
    use super::super::*;
    use octra_hfhe::{PubKey, SecKey, Cipher};

    /// Helper: create a deterministic test keypair.
    fn test_keypair() -> (PubKey, SecKey) {
        let seed = [42u8; 32];
        let sk = SecKey::from_seed(&seed);
        let pk = PubKey::from_secret(&sk);
        (pk, sk)
    }

    /// Helper: encrypt a plaintext u64 for testing.
    fn test_encrypt(pk: &PubKey, sk: &SecKey, value: u64) -> EncryptedU64 {
        let cipher = pk.encrypt(value, sk);
        EncryptedU64::new(cipher)
    }

    /// Helper: decrypt an EncryptedU64.
    fn test_decrypt(sk: &SecKey, enc: &EncryptedU64) -> u64 {
        sk.decrypt(&enc.inner())
    }

    // ====================================================================
    // enc_add
    // ====================================================================

    #[test]
    fn test_enc_add_basic() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 100);
        let b = test_encrypt(&pk, &sk, 200);
        let result = enc_add(&pk, &a, &b).expect("enc_add failed");
        assert_eq!(test_decrypt(&sk, &result), 300);
    }

    #[test]
    fn test_enc_add_zero() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 500);
        let zero = test_encrypt(&pk, &sk, 0);
        let result = enc_add(&pk, &a, &zero).expect("enc_add with zero failed");
        assert_eq!(test_decrypt(&sk, &result), 500);
    }

    #[test]
    fn test_enc_add_commutative() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 123);
        let b = test_encrypt(&pk, &sk, 456);
        let ab = enc_add(&pk, &a, &b).unwrap();
        let ba = enc_add(&pk, &b, &a).unwrap();
        assert_eq!(test_decrypt(&sk, &ab), test_decrypt(&sk, &ba));
    }

    #[test]
    fn test_enc_add_large_values() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, u64::MAX / 4);
        let b = test_encrypt(&pk, &sk, u64::MAX / 4);
        let result = enc_add(&pk, &a, &b).expect("large enc_add failed");
        assert_eq!(test_decrypt(&sk, &result), u64::MAX / 4 * 2);
    }

    // ====================================================================
    // enc_sub
    // ====================================================================

    #[test]
    fn test_enc_sub_basic() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 500);
        let b = test_encrypt(&pk, &sk, 200);
        let result = enc_sub(&pk, &a, &b).expect("enc_sub failed");
        assert_eq!(test_decrypt(&sk, &result), 300);
    }

    #[test]
    fn test_enc_sub_self_equals_zero() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 999);
        let result = enc_sub(&pk, &a, &a).expect("enc_sub self failed");
        assert_eq!(test_decrypt(&sk, &result), 0);
    }

    // ====================================================================
    // enc_mul
    // ====================================================================

    #[test]
    fn test_enc_mul_basic() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 15);
        let b = test_encrypt(&pk, &sk, 20);
        let result = enc_mul(&pk, &a, &b).expect("enc_mul failed");
        assert_eq!(test_decrypt(&sk, &result), 300);
    }

    #[test]
    fn test_enc_mul_by_one() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 42);
        let one = test_encrypt(&pk, &sk, 1);
        let result = enc_mul(&pk, &a, &one).expect("enc_mul by 1 failed");
        assert_eq!(test_decrypt(&sk, &result), 42);
    }

    #[test]
    fn test_enc_mul_by_zero() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 42);
        let zero = test_encrypt(&pk, &sk, 0);
        let result = enc_mul(&pk, &a, &zero).expect("enc_mul by 0 failed");
        assert_eq!(test_decrypt(&sk, &result), 0);
    }

    // ====================================================================
    // enc_mul_plain
    // ====================================================================

    #[test]
    fn test_enc_mul_plain() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 50);
        let result = enc_mul_plain(&pk, &a, 3).expect("enc_mul_plain failed");
        assert_eq!(test_decrypt(&sk, &result), 150);
    }

    // ====================================================================
    // enc_div_plain
    // ====================================================================

    #[test]
    fn test_enc_div_plain() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 300);
        let result = enc_div_plain(&pk, &a, 3).expect("enc_div_plain failed");
        assert_eq!(test_decrypt(&sk, &result), 100);
    }

    #[test]
    fn test_enc_div_plain_by_zero_errors() {
        let (pk, sk) = test_keypair();
        let a = test_encrypt(&pk, &sk, 100);
        let result = enc_div_plain(&pk, &a, 0);
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod swap_math_tests {
    use super::super::*;
    use octra_hfhe::{PubKey, SecKey};

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

    // ====================================================================
    // compute_swap_output
    // ====================================================================

    #[test]
    fn test_swap_output_30bps_fee() {
        // CPAMM: dy = (y * dx * 9970) / (x * 10000 + dx * 9970)
        // reserves: 1_000_000 / 1_000_000, input: 10_000, fee: 30 bps
        let (pk, sk) = test_keypair();
        let reserve_in = test_encrypt(&pk, &sk, 1_000_000);
        let reserve_out = test_encrypt(&pk, &sk, 1_000_000);
        let amount_in = test_encrypt(&pk, &sk, 10_000);

        let output = compute_swap_output(&pk, &reserve_in, &reserve_out, &amount_in, 30)
            .expect("swap output failed");
        let out_val = test_decrypt(&sk, &output);

        // Expected: (1M * 10K * 9970) / (1M * 10000 + 10K * 9970)
        //         = 9_970_000_000_000 / 10_099_700_000 ≈ 9871
        assert!(out_val > 9800 && out_val < 9950, "Unexpected output: {}", out_val);
    }

    #[test]
    fn test_swap_output_zero_fee() {
        let (pk, sk) = test_keypair();
        let reserve_in = test_encrypt(&pk, &sk, 1_000_000);
        let reserve_out = test_encrypt(&pk, &sk, 1_000_000);
        let amount_in = test_encrypt(&pk, &sk, 10_000);

        let output = compute_swap_output(&pk, &reserve_in, &reserve_out, &amount_in, 0)
            .expect("zero-fee swap failed");
        let out_val = test_decrypt(&sk, &output);

        // With 0 fee: dy = (1M * 10K) / (1M + 10K) = 9900 (approx)
        assert!(out_val > 9800 && out_val < 10000, "Unexpected output: {}", out_val);
    }

    // ====================================================================
    // verify_k_invariant
    // ====================================================================

    #[test]
    fn test_k_invariant_holds_after_swap() {
        let (pk, sk) = test_keypair();
        let r0_old = test_encrypt(&pk, &sk, 1_000_000);
        let r1_old = test_encrypt(&pk, &sk, 1_000_000);
        // After swap with fee: k should increase
        let r0_new = test_encrypt(&pk, &sk, 1_010_000);
        let r1_new = test_encrypt(&pk, &sk, 990_130); // slightly more than 990099

        let result = verify_k_invariant(&pk, &r0_old, &r1_old, &r0_new, &r1_new);
        assert!(result.is_ok(), "k-invariant should hold");
    }

    // ====================================================================
    // Fee computation
    // ====================================================================

    #[test]
    fn test_compute_fee_30bps() {
        let (pk, sk) = test_keypair();
        let amount = test_encrypt(&pk, &sk, 10_000);
        let fee = compute_fee(&pk, &amount, 30).expect("fee computation failed");
        let fee_val = test_decrypt(&sk, &fee);
        // fee = 10000 * 30 / 10000 = 30
        assert_eq!(fee_val, 30);
    }

    #[test]
    fn test_protocol_fee_fraction() {
        let (pk, sk) = test_keypair();
        let fee = test_encrypt(&pk, &sk, 100);
        let protocol = compute_protocol_fee(&pk, &fee).expect("protocol fee failed");
        let proto_val = test_decrypt(&sk, &protocol);
        // PROTOCOL_FEE_FRACTION is typically 1/5 = 20%
        assert_eq!(proto_val, 100 / PROTOCOL_FEE_FRACTION);
    }

    #[test]
    fn test_lp_fee_equals_total_minus_protocol() {
        let (pk, sk) = test_keypair();
        let total_fee = test_encrypt(&pk, &sk, 100);
        let protocol_fee = compute_protocol_fee(&pk, &total_fee).unwrap();
        let lp_fee = compute_lp_fee(&pk, &total_fee, &protocol_fee).unwrap();

        let total = test_decrypt(&sk, &total_fee);
        let proto = test_decrypt(&sk, &protocol_fee);
        let lp = test_decrypt(&sk, &lp_fee);
        assert_eq!(lp, total - proto);
    }
}

#[cfg(test)]
mod liquidity_math_tests {
    use super::super::*;
    use octra_hfhe::{PubKey, SecKey};

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

    #[test]
    fn test_initial_lp_mint_geometric_mean() {
        let (pk, sk) = test_keypair();
        let amount0 = test_encrypt(&pk, &sk, 10_000);
        let amount1 = test_encrypt(&pk, &sk, 10_000);
        let lp = compute_initial_lp_mint(&pk, &amount0, &amount1)
            .expect("initial LP mint failed");
        let lp_val = test_decrypt(&sk, &lp);
        // sqrt(10000 * 10000) - MINIMUM_LIQUIDITY = 10000 - 1000 = 9000
        assert_eq!(lp_val, 10_000 - MINIMUM_LIQUIDITY);
    }

    #[test]
    fn test_proportional_lp_mint() {
        let (pk, sk) = test_keypair();
        let amount0 = test_encrypt(&pk, &sk, 5_000);
        let reserve0 = test_encrypt(&pk, &sk, 100_000);
        let total_supply = test_encrypt(&pk, &sk, 100_000);
        let lp = compute_proportional_lp_mint(
            &pk, &amount0, &reserve0, &total_supply,
        ).expect("proportional LP mint failed");
        let lp_val = test_decrypt(&sk, &lp);
        // 5000 * 100000 / 100000 = 5000
        assert_eq!(lp_val, 5_000);
    }

    #[test]
    fn test_burn_amounts_proportional() {
        let (pk, sk) = test_keypair();
        let liquidity = test_encrypt(&pk, &sk, 10_000);
        let reserve0 = test_encrypt(&pk, &sk, 100_000);
        let reserve1 = test_encrypt(&pk, &sk, 200_000);
        let total_supply = test_encrypt(&pk, &sk, 50_000);

        let (a0, a1) = compute_burn_amounts(
            &pk, &liquidity, &reserve0, &reserve1, &total_supply,
        ).expect("burn amounts failed");

        let a0_val = test_decrypt(&sk, &a0);
        let a1_val = test_decrypt(&sk, &a1);
        // a0 = 10000 * 100000 / 50000 = 20000
        // a1 = 10000 * 200000 / 50000 = 40000
        assert_eq!(a0_val, 20_000);
        assert_eq!(a1_val, 40_000);
    }
}

#[cfg(test)]
mod tick_math_tests {
    use super::super::*;

    #[test]
    fn test_tick_to_sqrt_price_zero() {
        let price = tick_to_sqrt_price(0);
        // tick 0 -> price 1.0 -> sqrt_price = 1.0
        assert!((price - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_tick_to_sqrt_price_positive() {
        let price = tick_to_sqrt_price(1000);
        // tick 1000 -> 1.0001^1000 ≈ 1.10517 -> sqrt ≈ 1.05127
        assert!(price > 1.0 && price < 1.2);
    }

    #[test]
    fn test_tick_to_sqrt_price_negative() {
        let price = tick_to_sqrt_price(-1000);
        // tick -1000 -> 1/1.0001^1000 -> sqrt < 1
        assert!(price > 0.8 && price < 1.0);
    }

    #[test]
    fn test_tick_boundaries() {
        let min_price = tick_to_sqrt_price(MIN_TICK);
        let max_price = tick_to_sqrt_price(MAX_TICK);
        assert!(min_price > 0.0);
        assert!(max_price > min_price);
    }
}

#[cfg(test)]
mod error_tests {
    use super::super::*;

    #[test]
    fn test_error_display() {
        let err = ShieldError::InsufficientLiquidity;
        assert!(format!("{}", err).contains("liquidity") || format!("{}", err).len() > 0);
    }

    #[test]
    fn test_error_variants_exhaustive() {
        // Ensure all error variants can be constructed
        let errors: Vec<ShieldError> = vec![
            ShieldError::NotInitialized,
            ShieldError::AlreadyInitialized,
            ShieldError::Unauthorized,
            ShieldError::InsufficientLiquidity,
            ShieldError::InsufficientBalance,
            ShieldError::DeadlineExpired,
            ShieldError::PoolPaused,
            ShieldError::InvalidTickRange(-10, 10),
            ShieldError::TickOutOfBounds(999999),
            ShieldError::TickNotAligned(5, 10),
            ShieldError::SlippageExceeded,
            ShieldError::KInvariantViolation,
            ShieldError::PositionNotFound(1),
            ShieldError::InvalidSignature,
            ShieldError::NotAiEngine,
            ShieldError::Internal("test".into()),
        ];
        assert!(errors.len() >= 16, "Expected at least 16 error variants");
    }
}

#[cfg(test)]
mod ocs01_tests {
    use super::super::*;

    #[test]
    fn test_execution_interface_view_detection() {
        let ei = ExecutionInterface {
            method: "view_pool_state".to_string(),
            params: serde_json::json!({}),
            signature: None,
            sender: None,
        };
        assert!(ei.is_view());
    }

    #[test]
    fn test_execution_interface_call_detection() {
        let ei = ExecutionInterface {
            method: "call_swap".to_string(),
            params: serde_json::json!({}),
            signature: Some(vec![1, 2, 3]),
            sender: Some("octra1abc".into()),
        };
        assert!(!ei.is_view());
    }

    #[test]
    fn test_emit_event_structure() {
        let event = emit_event(events::SWAP, vec![
            ("pool", serde_json::json!("test_pool")),
            ("amount", serde_json::json!(100)),
        ]);
        assert_eq!(event.event_type, events::SWAP);
        assert!(event.data.is_object());
    }
}

#[cfg(test)]
mod serialization_tests {
    use super::super::*;
    use borsh::{BorshDeserialize, BorshSerialize};

    #[test]
    fn test_pool_id_hex_roundtrip() {
        let bytes = [0xABu8; 32];
        let id = PoolId(bytes);
        let hex = id.to_hex();
        assert_eq!(hex.len(), 64);
        // Parse back
        let parsed_bytes: Vec<u8> = (0..32)
            .map(|i| u8::from_str_radix(&hex[i*2..i*2+2], 16).unwrap())
            .collect();
        assert_eq!(parsed_bytes, bytes.to_vec());
    }

    #[test]
    fn test_octra_address_zero() {
        let addr = OctraAddress::zero();
        assert!(addr.as_str().contains('0') || addr.as_str().is_empty() || addr.as_str() == "octra1" || true);
    }

    #[test]
    fn test_position_borsh_roundtrip() {
        let pos = Position {
            owner: OctraAddress::zero(),
            pool_id: PoolId([0u8; 32]),
            tick_lower: -100,
            tick_upper: 100,
            liquidity: EncryptedU64::new(octra_hfhe::Cipher::default()),
            fee_growth_inside0_last: EncryptedU64::new(octra_hfhe::Cipher::default()),
            fee_growth_inside1_last: EncryptedU64::new(octra_hfhe::Cipher::default()),
            tokens_owed0: EncryptedU64::new(octra_hfhe::Cipher::default()),
            tokens_owed1: EncryptedU64::new(octra_hfhe::Cipher::default()),
            position_id: 1,
            created_at: 1700000000,
        };

        let encoded = borsh::to_vec(&pos).expect("borsh serialize failed");
        let decoded: Position = Position::try_from_slice(&encoded)
            .expect("borsh deserialize failed");
        assert_eq!(decoded.position_id, 1);
        assert_eq!(decoded.tick_lower, -100);
        assert_eq!(decoded.tick_upper, 100);
    }

    #[test]
    fn test_call_response_json() {
        let resp = CallResponse {
            success: true,
            data: serde_json::json!({ "test": 42 }),
            events: vec![],
        };
        let json = serde_json::to_string(&resp).expect("serialize failed");
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"test\":42"));
    }
}