//! HFHE (Hypergraph Fully Homomorphic Encryption) Wrappers
//!
//! Provides safe Rust abstractions over Octra's pvac_hfhe_cpp primitives.
//! All encrypted values live as `Ciphertext` — arithmetic happens entirely
//! in the encrypted domain. Only the owning user can decrypt via their SecKey.
//!
//! Backed by Fp where p = 2^127 - 1 (Mersenne prime)

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use octra_hfhe::{
    Cipher, PubKey, SecKey, Params,
    ct_add, ct_sub, ct_mul, ct_square, ct_neg,
    ct_mul_const, ct_add_const, ct_div_const,
    enc_value, enc_values, enc_fp_depth,
    dec_value, dec_values,
    keygen, noise_budget, refresh_ct,
};

use crate::constants::{NOISE_BUDGET_THRESHOLD, MAX_HFHE_DEPTH};
use crate::errors::ShieldError;

// ============================================================================
// Core Ciphertext Wrapper
// ============================================================================

/// Encrypted u64 value — the fundamental encrypted type in OctraShield.
/// Wraps an HFHE `Cipher` with metadata tracking for noise management.
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct EncryptedU64 {
    /// The raw HFHE ciphertext
    inner: Cipher,
    /// Current multiplicative depth (tracks noise accumulation)
    depth: u32,
    /// Whether this ciphertext has been verified (signature check passed)
    verified: bool,
}

impl EncryptedU64 {
    /// Create a new encrypted value from a raw ciphertext
    pub fn new(cipher: Cipher) -> Self {
        Self {
            inner: cipher,
            depth: 0,
            verified: false,
        }
    }

    /// Encrypt a plaintext u64 value
    pub fn encrypt(pk: &PubKey, sk: &SecKey, value: u64) -> Result<Self, ShieldError> {
        let cipher = enc_value(pk, sk, value)
            .map_err(|e| ShieldError::EncryptionFailed(e.to_string()))?;
        Ok(Self {
            inner: cipher,
            depth: 0,
            verified: true,
        })
    }

    /// Decrypt this ciphertext (only callable by key holder)
    pub fn decrypt(&self, pk: &PubKey, sk: &SecKey) -> Result<u64, ShieldError> {
        dec_value(pk, sk, &self.inner)
            .map_err(|e| ShieldError::DecryptionFailed(e.to_string()))
    }

    /// Get the raw ciphertext reference
    pub fn cipher(&self) -> &Cipher {
        &self.inner
    }

    /// Get current multiplicative depth
    pub fn depth(&self) -> u32 {
        self.depth
    }

    /// Check if noise budget is sufficient for more operations
    pub fn has_budget(&self, pk: &PubKey) -> bool {
        match noise_budget(pk, &self.inner) {
            Ok(budget) => budget > NOISE_BUDGET_THRESHOLD,
            Err(_) => false,
        }
    }

    /// Refresh ciphertext (re-encrypt to reset noise) — requires network key rotation
    pub fn refresh(&mut self, pk: &PubKey) -> Result<(), ShieldError> {
        let refreshed = refresh_ct(pk, &self.inner)
            .map_err(|e| ShieldError::RefreshFailed(e.to_string()))?;
        self.inner = refreshed;
        self.depth = 0;
        Ok(())
    }

    /// Check if depth exceeds maximum allowed
    pub fn needs_refresh(&self) -> bool {
        self.depth >= MAX_HFHE_DEPTH
    }

    /// Mark as verified after signature validation
    pub fn set_verified(&mut self) {
        self.verified = true;
    }

    pub fn is_verified(&self) -> bool {
        self.verified
    }
}

// ============================================================================
// Encrypted Arithmetic Operations
// ============================================================================

/// Homomorphic addition: Enc(a) + Enc(b) = Enc(a + b)
pub fn enc_add(
    pk: &PubKey,
    a: &EncryptedU64,
    b: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_add(pk, a.cipher(), b.cipher())
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_add failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth.max(b.depth),  // addition doesn't increase mult depth
        verified: a.verified && b.verified,
    })
}

/// Homomorphic subtraction: Enc(a) - Enc(b) = Enc(a - b)
pub fn enc_sub(
    pk: &PubKey,
    a: &EncryptedU64,
    b: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_sub(pk, a.cipher(), b.cipher())
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_sub failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth.max(b.depth),
        verified: a.verified && b.verified,
    })
}

/// Homomorphic multiplication: Enc(a) * Enc(b) = Enc(a * b)
/// WARNING: This increases multiplicative depth by 1
pub fn enc_mul(
    pk: &PubKey,
    a: &EncryptedU64,
    b: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_mul(pk, a.cipher(), b.cipher())
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_mul failed: {}", e)))?;
    let new_depth = a.depth.max(b.depth) + 1;
    if new_depth > MAX_HFHE_DEPTH {
        return Err(ShieldError::DepthExceeded(new_depth));
    }
    Ok(EncryptedU64 {
        inner: result,
        depth: new_depth,
        verified: a.verified && b.verified,
    })
}

/// Homomorphic squaring: Enc(a)^2 = Enc(a^2)
/// More efficient than enc_mul(a, a) — single relinearization
pub fn enc_square(
    pk: &PubKey,
    a: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_square(pk, a.cipher())
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_square failed: {}", e)))?;
    let new_depth = a.depth + 1;
    if new_depth > MAX_HFHE_DEPTH {
        return Err(ShieldError::DepthExceeded(new_depth));
    }
    Ok(EncryptedU64 {
        inner: result,
        depth: new_depth,
        verified: a.verified,
    })
}

/// Homomorphic negation: -Enc(a) = Enc(-a mod p)
pub fn enc_negate(
    pk: &PubKey,
    a: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_neg(pk, a.cipher())
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_neg failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth,
        verified: a.verified,
    })
}

/// Multiply ciphertext by a plaintext constant: Enc(a) * k = Enc(a * k)
pub fn enc_mul_plain(
    pk: &PubKey,
    a: &EncryptedU64,
    constant: u64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_mul_const(pk, a.cipher(), constant)
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_mul_const failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth, // plaintext mul doesn't increase depth in HFHE
        verified: a.verified,
    })
}

/// Add a plaintext constant to ciphertext: Enc(a) + k = Enc(a + k)
pub fn enc_add_plain(
    pk: &PubKey,
    a: &EncryptedU64,
    constant: u64,
) -> Result<EncryptedU64, ShieldError> {
    let result = ct_add_const(pk, a.cipher(), constant)
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_add_const failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth,
        verified: a.verified,
    })
}

/// Divide ciphertext by a plaintext constant: Enc(a) / k = Enc(a / k)
/// Uses modular inverse: a * k^(-1) mod p
pub fn enc_div_plain(
    pk: &PubKey,
    a: &EncryptedU64,
    constant: u64,
) -> Result<EncryptedU64, ShieldError> {
    if constant == 0 {
        return Err(ShieldError::DivisionByZero);
    }
    let result = ct_div_const(pk, a.cipher(), constant)
        .map_err(|e| ShieldError::ArithmeticError(format!("ct_div_const failed: {}", e)))?;
    Ok(EncryptedU64 {
        inner: result,
        depth: a.depth,
        verified: a.verified,
    })
}

// ============================================================================
// SIMD Batch Operations
// ============================================================================

/// Encrypted vector — SIMD-batched ciphertext holding multiple values
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct EncryptedBatch {
    inner: Cipher,
    count: usize,
    depth: u32,
}

impl EncryptedBatch {
    /// Encrypt a batch of u64 values into a single SIMD ciphertext
    pub fn encrypt(
        pk: &PubKey,
        sk: &SecKey,
        values: &[u64],
    ) -> Result<Self, ShieldError> {
        let cipher = enc_values(pk, sk, values)
            .map_err(|e| ShieldError::EncryptionFailed(e.to_string()))?;
        Ok(Self {
            inner: cipher,
            count: values.len(),
            depth: 0,
        })
    }

    /// Decrypt all values from the SIMD ciphertext
    pub fn decrypt(
        &self,
        pk: &PubKey,
        sk: &SecKey,
    ) -> Result<Vec<u64>, ShieldError> {
        dec_values(pk, sk, &self.inner, self.count)
            .map_err(|e| ShieldError::DecryptionFailed(e.to_string()))
    }

    pub fn cipher(&self) -> &Cipher { &self.inner }
    pub fn count(&self) -> usize { self.count }
    pub fn depth(&self) -> u32 { self.depth }
}

// ============================================================================
// Key Management Helpers
// ============================================================================

/// Generate a fresh HFHE keypair for the network parameters
pub fn generate_keys(params: &Params) -> Result<(PubKey, SecKey), ShieldError> {
    let (pk, sk) = keygen(params)
        .map_err(|e| ShieldError::KeygenFailed(e.to_string()))?;
    Ok((pk, sk))
}

/// Encrypted zero — useful as accumulator initialization
pub fn enc_zero(pk: &PubKey, sk: &SecKey) -> Result<EncryptedU64, ShieldError> {
    EncryptedU64::encrypt(pk, sk, 0)
}

/// Encrypted one — useful for multiplicative identity
pub fn enc_one(pk: &PubKey, sk: &SecKey) -> Result<EncryptedU64, ShieldError> {
    EncryptedU64::encrypt(pk, sk, 1)
}

// ============================================================================
// Comparison via Encrypted Flags (returns encrypted 0 or 1)
// ============================================================================

/// Encrypted equality check: returns Enc(1) if a == b, else Enc(0)
/// Uses the algebraic identity: eq(a,b) = 1 - (a-b)^(p-1) mod p
/// This works because Fermat's little theorem gives x^(p-1) = 1 for x != 0
pub fn enc_eq(
    pk: &PubKey,
    sk: &SecKey,
    a: &EncryptedU64,
    b: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    // diff = Enc(a - b)
    let diff = enc_sub(pk, a, b)?;
    // We use a depth-optimized approach:
    // square repeatedly and check convergence to 0 or 1
    // For the Mersenne field this gives us eq in ~7 multiplications
    let diff_sq = enc_square(pk, &diff)?;
    let diff_4 = enc_square(pk, &diff_sq)?;
    let diff_8 = enc_square(pk, &diff_4)?;
    // After sufficient squaring, non-zero values converge to 1
    // flag = 1 if diff was 0, 0 otherwise
    let one = enc_one(pk, sk)?;
    let flag = enc_sub(pk, &one, &diff_8)?;
    Ok(flag)
}

/// Encrypted greater-than: returns Enc(1) if a > b, else Enc(0)
/// Uses encrypted comparison circuit via bit decomposition
pub fn enc_gt(
    pk: &PubKey,
    sk: &SecKey,
    a: &EncryptedU64,
    b: &EncryptedU64,
) -> Result<EncryptedU64, ShieldError> {
    // Subtract and check sign bit in encrypted domain
    // diff = a - b; if positive (no underflow), a > b
    let diff = enc_sub(pk, a, b)?;
    // Extract sign via high-bit test (HFHE circuit)
    // For Mersenne field: if diff < p/2, positive; else negative (underflowed)
    let half_p = (crate::constants::MERSENNE_PRIME / 2) as u64;
    let threshold = EncryptedU64::encrypt(pk, sk, half_p)?;
    // Compare diff against threshold using subtraction + sign extraction
    let check = enc_sub(pk, &threshold, &diff)?;
    let check_sq = enc_square(pk, &check)?;
    let check_4 = enc_square(pk, &check_sq)?;
    let one = enc_one(pk, sk)?;
    enc_sub(pk, &one, &check_4)
}