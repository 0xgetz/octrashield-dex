//! OCS01 Contract Interface Standard
//!
//! Defines the traits and execution interface JSON format that every
//! OctraShield contract implements, following Octra's OCS01 standard.
//!
//! OCS01 contracts expose two types of methods:
//!   - View methods (read-only, no state change, no signature required)
//!   - Call methods (state-changing, require Ed25519 signature)
//!
//! Execution Interface JSON format:
//! ```json
//! {
//!   "contract": "<contract_address>",
//!   "method": "<method_name>",
//!   "params": { ... },
//!   "sender": "<caller_address>",
//!   "signature": "<ed25519_hex_signature>",
//!   "timestamp": 1234567890
//! }
//! ```

use serde::{Deserialize, Serialize};
use crate::types::{OctraAddress, CallResponse, ExecContext};
use crate::errors::ShieldResult;

// ============================================================================
// OCS01 Execution Interface
// ============================================================================

/// OCS01 Execution Interface — the JSON envelope for all contract calls
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecutionInterface {
    /// Target contract address
    pub contract: String,
    /// Method to invoke
    pub method: String,
    /// Method parameters (method-specific JSON)
    pub params: serde_json::Value,
    /// Caller address
    pub sender: String,
    /// Ed25519 signature over (contract + method + params + sender + timestamp)
    /// Hex-encoded. None for view methods.
    pub signature: Option<String>,
    /// Unix timestamp (prevents replay attacks)
    pub timestamp: u64,
}

impl ExecutionInterface {
    /// Create a new view call (no signature required)
    pub fn view(contract: &str, method: &str, params: serde_json::Value) -> Self {
        Self {
            contract: contract.to_string(),
            method: method.to_string(),
            params,
            sender: String::new(),
            signature: None,
            timestamp: 0,
        }
    }

    /// Create a new state-changing call (signature required)
    pub fn call(
        contract: &str,
        method: &str,
        params: serde_json::Value,
        sender: &str,
        signature: &str,
        timestamp: u64,
    ) -> Self {
        Self {
            contract: contract.to_string(),
            method: method.to_string(),
            params,
            sender: sender.to_string(),
            signature: Some(signature.to_string()),
            timestamp,
        }
    }

    /// Verify Ed25519 signature over the canonical message
    pub fn verify_signature(&self) -> ShieldResult<bool> {
        use ed25519_dalek::{Verifier, VerifyingKey, Signature};
        use sha2::{Sha256, Digest};

        let sig_hex = match &self.signature {
            Some(s) => s,
            None => return Ok(true), // View calls don't need signatures
        };

        // Canonical message: SHA256(contract || method || params_json || sender || timestamp)
        let mut hasher = Sha256::new();
        hasher.update(self.contract.as_bytes());
        hasher.update(self.method.as_bytes());
        hasher.update(self.params.to_string().as_bytes());
        hasher.update(self.sender.as_bytes());
        hasher.update(self.timestamp.to_le_bytes());
        let message = hasher.finalize();

        // Decode signature
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|e| crate::errors::ShieldError::InvalidSignature)?;
        if sig_bytes.len() != 64 {
            return Err(crate::errors::ShieldError::InvalidSignature);
        }
        let signature = Signature::from_bytes(&sig_bytes.try_into().unwrap());

        // Decode sender's public key from address
        // In Octra, the address encodes the Ed25519 public key
        let pk_bytes = bs58_decode_octra_addr(&self.sender)
            .map_err(|_| crate::errors::ShieldError::InvalidAddress(self.sender.clone()))?;
        let verifying_key = VerifyingKey::from_bytes(&pk_bytes)
            .map_err(|_| crate::errors::ShieldError::InvalidSignature)?;

        Ok(verifying_key.verify(&message, &signature).is_ok())
    }

    /// Check if this is a view call
    pub fn is_view(&self) -> bool {
        self.signature.is_none()
    }
}

/// Decode an oct-prefixed Base58 address to the 32-byte Ed25519 public key
fn bs58_decode_octra_addr(addr: &str) -> Result<[u8; 32], String> {
    let without_prefix = addr.strip_prefix(crate::constants::ADDR_PREFIX)
        .ok_or_else(|| format!("Missing '{}' prefix", crate::constants::ADDR_PREFIX))?;
    let bytes = bs58::decode(without_prefix)
        .into_vec()
        .map_err(|e| e.to_string())?;
    if bytes.len() < 32 {
        return Err("Address too short".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes[..32]);
    Ok(key)
}

// ============================================================================
// Contract Traits (OCS01 Standard)
// ============================================================================

/// OCS01 Contract — base trait all OctraShield contracts implement
pub trait OCS01Contract {
    /// Contract name for identification
    fn name(&self) -> &str;

    /// Contract version
    fn version(&self) -> &str;

    /// Process an incoming execution interface call
    fn execute(&mut self, call: ExecutionInterface, ctx: &ExecContext) -> ShieldResult<CallResponse>;

    /// List all available methods (for discovery)
    fn methods(&self) -> Vec<MethodDescriptor>;
}

/// Method descriptor for OCS01 discovery
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MethodDescriptor {
    pub name: String,
    pub method_type: MethodType,
    pub description: String,
    pub params: Vec<ParamDescriptor>,
    pub returns: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum MethodType {
    View,
    Call,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ParamDescriptor {
    pub name: String,
    pub param_type: String,
    pub description: String,
    pub required: bool,
}

// ============================================================================
// RPC Helpers
// ============================================================================

/// Octra RPC endpoints
pub struct OctraRpc;

impl OctraRpc {
    /// View method RPC endpoint
    pub const VIEW: &'static str = "/contract/call-view";

    /// State-changing call RPC endpoint
    pub const CALL: &'static str = "/call-contract";

    /// Balance check endpoint
    pub const BALANCE: &'static str = "/balance";

    /// Contract state endpoint
    pub const STATE: &'static str = "/contract/state";
}

// ============================================================================
// Event Emission Helper
// ============================================================================

use crate::types::ContractEvent;

/// Helper to build contract events with standard fields
pub fn emit_event(name: &str, fields: Vec<(&str, serde_json::Value)>) -> ContractEvent {
    let mut map = serde_json::Map::new();
    for (k, v) in fields {
        map.insert(k.to_string(), v);
    }
    ContractEvent::new(name, serde_json::Value::Object(map))
}

/// Standard event names used across OctraShield contracts
pub mod events {
    pub const POOL_CREATED: &str = "PoolCreated";
    pub const SWAP: &str = "Swap";
    pub const MINT: &str = "Mint";
    pub const BURN: &str = "Burn";
    pub const COLLECT_FEES: &str = "CollectFees";
    pub const TRANSFER: &str = "Transfer";
    pub const APPROVAL: &str = "Approval";
    pub const AI_FEE_UPDATE: &str = "AiFeeUpdate";
    pub const AI_REBALANCE: &str = "AiRebalance";
    pub const MEV_SHIELD: &str = "MevShield";
    pub const POSITION_CREATED: &str = "PositionCreated";
    pub const POSITION_CLOSED: &str = "PositionClosed";
    pub const POOL_PAUSED: &str = "PoolPaused";
    pub const POOL_UNPAUSED: &str = "PoolUnpaused";
    pub const FEE_TIER_ENABLED: &str = "FeeTierEnabled";
    pub const OWNERSHIP_TRANSFERRED: &str = "OwnershipTransferred";
}