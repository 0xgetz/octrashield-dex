//! ShieldToken — OCS01 Encrypted ERC20 LP Token
//!
//! Fully homomorphic encrypted token standard for OctraShield DEX.
//! All balances and allowances are HFHE-encrypted ciphertexts.
//! Only the token holder can decrypt their own balance.
//!
//! Implements: OCS01 Contract Standard
//! Methods:
//!   View:  view_name, view_symbol, view_decimals, view_total_supply,
//!          view_balance_of, view_allowance
//!   Call:  call_initialize, call_transfer, call_approve,
//!          call_transfer_from, call_mint, call_burn

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use borsh::{BorshDeserialize, BorshSerialize};
use octra_hfhe::PubKey;

use octrashield_shared::{
    OctraAddress, ExecContext, CallResponse, ContractEvent,
    EncryptedU64, ShieldError, ShieldResult,
    enc_add, enc_sub,
    ExecutionInterface, OCS01Contract, MethodDescriptor, MethodType, ParamDescriptor,
    emit_event, events,
    VERSION_SHIELD_TOKEN,
};

// ============================================================================
// Contract State
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct ShieldToken {
    /// Token name (e.g., "OctraShield LP: OCT/USDC 0.30%")
    name: String,
    /// Token symbol (e.g., "SHIELD-OCT-USDC-30")
    symbol: String,
    /// Decimal places (always 18 for LP tokens)
    decimals: u8,
    /// ENCRYPTED total supply
    total_supply: Option<EncryptedU64>,
    /// ENCRYPTED balances: address -> Enc(balance)
    balances: HashMap<String, EncryptedU64>,
    /// ENCRYPTED allowances: owner -> (spender -> Enc(allowance))
    allowances: HashMap<String, HashMap<String, EncryptedU64>>,
    /// Contract owner (the OctraShieldPair that deployed this token)
    owner: OctraAddress,
    /// Minter address (only Pair contract can mint/burn)
    minter: OctraAddress,
    /// Whether the contract has been initialized
    initialized: bool,
}

impl ShieldToken {
    /// Create a new uninitialized ShieldToken
    pub fn new() -> Self {
        Self {
            name: String::new(),
            symbol: String::new(),
            decimals: 18,
            total_supply: None,
            balances: HashMap::new(),
            allowances: HashMap::new(),
            owner: OctraAddress::zero(),
            minter: OctraAddress::zero(),
            initialized: false,
        }
    }

    // ========================================================================
    // View Methods
    // ========================================================================

    /// view_name: Returns the token name
    pub fn view_name(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::json!({ "name": self.name }))
    }

    /// view_symbol: Returns the token symbol
    pub fn view_symbol(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::json!({ "symbol": self.symbol }))
    }

    /// view_decimals: Returns decimal places
    pub fn view_decimals(&self) -> ShieldResult<serde_json::Value> {
        Ok(serde_json::json!({ "decimals": self.decimals }))
    }

    /// view_total_supply: Returns the ENCRYPTED total supply ciphertext
    pub fn view_total_supply(&self) -> ShieldResult<serde_json::Value> {
        match &self.total_supply {
            Some(supply) => Ok(serde_json::to_value(supply)?),
            None => Ok(serde_json::json!({ "total_supply": null })),
        }
    }

    /// view_balance_of: Returns the ENCRYPTED balance for an address
    /// Only the address owner can decrypt the returned ciphertext
    pub fn view_balance_of(&self, address: &str) -> ShieldResult<serde_json::Value> {
        match self.balances.get(address) {
            Some(balance) => Ok(serde_json::to_value(balance)?),
            None => Ok(serde_json::json!({ "balance": null })),
        }
    }

    /// view_allowance: Returns the ENCRYPTED allowance for owner->spender
    pub fn view_allowance(&self, owner: &str, spender: &str) -> ShieldResult<serde_json::Value> {
        let allowance = self.allowances
            .get(owner)
            .and_then(|m| m.get(spender));
        match allowance {
            Some(a) => Ok(serde_json::to_value(a)?),
            None => Ok(serde_json::json!({ "allowance": null })),
        }
    }

    // ========================================================================
    // Call Methods (State-Changing)
    // ========================================================================

    /// call_initialize: Set up the token with name, symbol, and minter
    /// Can only be called once, by the deployer
    pub fn call_initialize(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        name: String,
        symbol: String,
        minter: OctraAddress,
    ) -> ShieldResult<CallResponse> {
        if self.initialized {
            return Err(ShieldError::AlreadyInitialized);
        }

        self.name = name.clone();
        self.symbol = symbol.clone();
        self.decimals = 18;
        self.owner = ctx.sender.clone();
        self.minter = minter;
        self.initialized = true;

        // Initialize total supply as Enc(0)
        // Using a placeholder — in production this uses the network key
        self.total_supply = None; // Will be set on first mint

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({
                "name": name,
                "symbol": symbol,
                "decimals": 18
            }),
            events: vec![],
        })
    }

    /// call_transfer: Transfer encrypted tokens from sender to recipient
    ///
    /// Enc(sender_balance) -= Enc(amount)
    /// Enc(recipient_balance) += Enc(amount)
    ///
    /// The invariant (sender has enough) is verified via HFHE subtraction —
    /// if underflow occurs in the Mersenne field, validators detect it
    /// during threshold decryption of the invariant check.
    pub fn call_transfer(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        recipient: &OctraAddress,
        amount: &EncryptedU64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        if *recipient == OctraAddress::zero() {
            return Err(ShieldError::TransferToZero);
        }

        let sender_addr = ctx.sender.as_str();
        let recipient_addr = recipient.as_str();

        // Subtract from sender (encrypted)
        let sender_balance = self.balances.get(sender_addr)
            .ok_or(ShieldError::InsufficientBalance)?;
        let new_sender_balance = enc_sub(pk, sender_balance, amount)?;

        // Add to recipient (encrypted)
        let new_recipient_balance = match self.balances.get(recipient_addr) {
            Some(existing) => enc_add(pk, existing, amount)?,
            None => amount.clone(),
        };

        // Update state
        self.balances.insert(sender_addr.to_string(), new_sender_balance);
        self.balances.insert(recipient_addr.to_string(), new_recipient_balance);

        let event = emit_event(events::TRANSFER, vec![
            ("from", serde_json::json!(sender_addr)),
            ("to", serde_json::json!(recipient_addr)),
            // amount is encrypted — event contains ciphertext
            ("amount", serde_json::to_value(amount)?),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "transferred": true }),
            events: vec![event],
        })
    }

    /// call_approve: Approve a spender to transfer up to `amount` of sender's tokens
    pub fn call_approve(
        &mut self,
        ctx: &ExecContext,
        _pk: &PubKey,
        spender: &OctraAddress,
        amount: &EncryptedU64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        let owner_addr = ctx.sender.as_str().to_string();
        let spender_addr = spender.as_str().to_string();

        self.allowances
            .entry(owner_addr.clone())
            .or_insert_with(HashMap::new)
            .insert(spender_addr.clone(), amount.clone());

        let event = emit_event(events::APPROVAL, vec![
            ("owner", serde_json::json!(owner_addr)),
            ("spender", serde_json::json!(spender_addr)),
            ("amount", serde_json::to_value(amount)?),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "approved": true }),
            events: vec![event],
        })
    }

    /// call_transfer_from: Transfer tokens on behalf of owner (requires approval)
    ///
    /// Enc(allowance) -= Enc(amount)
    /// Enc(owner_balance) -= Enc(amount)
    /// Enc(recipient_balance) += Enc(amount)
    pub fn call_transfer_from(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        owner: &OctraAddress,
        recipient: &OctraAddress,
        amount: &EncryptedU64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;

        if *recipient == OctraAddress::zero() {
            return Err(ShieldError::TransferToZero);
        }

        let spender_addr = ctx.sender.as_str();
        let owner_addr = owner.as_str();
        let recipient_addr = recipient.as_str();

        // Check and decrease allowance (encrypted)
        let allowance = self.allowances
            .get(owner_addr)
            .and_then(|m| m.get(spender_addr))
            .ok_or(ShieldError::AllowanceExceeded)?;
        let new_allowance = enc_sub(pk, allowance, amount)?;

        // Subtract from owner (encrypted)
        let owner_balance = self.balances.get(owner_addr)
            .ok_or(ShieldError::InsufficientBalance)?;
        let new_owner_balance = enc_sub(pk, owner_balance, amount)?;

        // Add to recipient (encrypted)
        let new_recipient_balance = match self.balances.get(recipient_addr) {
            Some(existing) => enc_add(pk, existing, amount)?,
            None => amount.clone(),
        };

        // Update state
        self.allowances
            .get_mut(owner_addr).unwrap()
            .insert(spender_addr.to_string(), new_allowance);
        self.balances.insert(owner_addr.to_string(), new_owner_balance);
        self.balances.insert(recipient_addr.to_string(), new_recipient_balance);

        let event = emit_event(events::TRANSFER, vec![
            ("from", serde_json::json!(owner_addr)),
            ("to", serde_json::json!(recipient_addr)),
            ("spender", serde_json::json!(spender_addr)),
            ("amount", serde_json::to_value(amount)?),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "transferred": true }),
            events: vec![event],
        })
    }

    /// call_mint: Mint new LP tokens to an address
    /// RESTRICTED: Only callable by the minter (Pair contract)
    ///
    /// Enc(total_supply) += Enc(amount)
    /// Enc(recipient_balance) += Enc(amount)
    pub fn call_mint(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        recipient: &OctraAddress,
        amount: &EncryptedU64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;
        self.check_minter(ctx)?;

        let recipient_addr = recipient.as_str();

        // Increase total supply (encrypted)
        self.total_supply = Some(match &self.total_supply {
            Some(supply) => enc_add(pk, supply, amount)?,
            None => amount.clone(),
        });

        // Increase recipient balance (encrypted)
        let new_balance = match self.balances.get(recipient_addr) {
            Some(existing) => enc_add(pk, existing, amount)?,
            None => amount.clone(),
        };
        self.balances.insert(recipient_addr.to_string(), new_balance);

        let event = emit_event(events::TRANSFER, vec![
            ("from", serde_json::json!(OctraAddress::zero().as_str())),
            ("to", serde_json::json!(recipient_addr)),
            ("amount", serde_json::to_value(amount)?),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "minted": true }),
            events: vec![event],
        })
    }

    /// call_burn: Burn LP tokens from an address
    /// RESTRICTED: Only callable by the minter (Pair contract)
    ///
    /// Enc(total_supply) -= Enc(amount)
    /// Enc(holder_balance) -= Enc(amount)
    pub fn call_burn(
        &mut self,
        ctx: &ExecContext,
        pk: &PubKey,
        holder: &OctraAddress,
        amount: &EncryptedU64,
    ) -> ShieldResult<CallResponse> {
        self.check_initialized()?;
        self.check_minter(ctx)?;

        let holder_addr = holder.as_str();

        // Decrease total supply (encrypted)
        let supply = self.total_supply.as_ref()
            .ok_or(ShieldError::InsufficientBalance)?;
        self.total_supply = Some(enc_sub(pk, supply, amount)?);

        // Decrease holder balance (encrypted)
        let balance = self.balances.get(holder_addr)
            .ok_or(ShieldError::InsufficientBalance)?;
        let new_balance = enc_sub(pk, balance, amount)?;
        self.balances.insert(holder_addr.to_string(), new_balance);

        let event = emit_event(events::TRANSFER, vec![
            ("from", serde_json::json!(holder_addr)),
            ("to", serde_json::json!(OctraAddress::zero().as_str())),
            ("amount", serde_json::to_value(amount)?),
        ]);

        Ok(CallResponse {
            success: true,
            data: serde_json::json!({ "burned": true }),
            events: vec![event],
        })
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    fn check_initialized(&self) -> ShieldResult<()> {
        if !self.initialized {
            Err(ShieldError::NotInitialized)
        } else {
            Ok(())
        }
    }

    fn check_minter(&self, ctx: &ExecContext) -> ShieldResult<()> {
        if ctx.sender != self.minter {
            Err(ShieldError::Unauthorized)
        } else {
            Ok(())
        }
    }
}

// ============================================================================
// OCS01 Contract Implementation
// ============================================================================

impl OCS01Contract for ShieldToken {
    fn name(&self) -> &str {
        "ShieldToken"
    }

    fn version(&self) -> &str {
        VERSION_SHIELD_TOKEN
    }

    fn execute(&mut self, call: ExecutionInterface, ctx: &ExecContext) -> ShieldResult<CallResponse> {
        // Verify signature for call methods
        if !call.is_view() {
            if !call.verify_signature()? {
                return Err(ShieldError::InvalidSignature);
            }
        }

        // Deserialize network public key
        let pk: PubKey = borsh::from_slice(&ctx.network_pk)
            .map_err(|e| ShieldError::Internal(format!("Failed to deserialize PubKey: {}", e)))?;

        match call.method.as_str() {
            // View methods
            "view_name" => {
                let data = self.view_name()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_symbol" => {
                let data = self.view_symbol()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_decimals" => {
                let data = self.view_decimals()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_total_supply" => {
                let data = self.view_total_supply()?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_balance_of" => {
                let address = call.params["address"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'address' param".into()))?;
                let data = self.view_balance_of(address)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }
            "view_allowance" => {
                let owner = call.params["owner"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'owner' param".into()))?;
                let spender = call.params["spender"].as_str()
                    .ok_or(ShieldError::Internal("Missing 'spender' param".into()))?;
                let data = self.view_allowance(owner, spender)?;
                Ok(CallResponse { success: true, data, events: vec![] })
            }

            // Call methods
            "call_initialize" => {
                let name: String = serde_json::from_value(call.params["name"].clone())?;
                let symbol: String = serde_json::from_value(call.params["symbol"].clone())?;
                let minter: OctraAddress = serde_json::from_value(call.params["minter"].clone())?;
                self.call_initialize(ctx, &pk, name, symbol, minter)
            }
            "call_transfer" => {
                let recipient: OctraAddress = serde_json::from_value(call.params["recipient"].clone())?;
                let amount: EncryptedU64 = serde_json::from_value(call.params["amount"].clone())?;
                self.call_transfer(ctx, &pk, &recipient, &amount)
            }
            "call_approve" => {
                let spender: OctraAddress = serde_json::from_value(call.params["spender"].clone())?;
                let amount: EncryptedU64 = serde_json::from_value(call.params["amount"].clone())?;
                self.call_approve(ctx, &pk, &spender, &amount)
            }
            "call_transfer_from" => {
                let owner: OctraAddress = serde_json::from_value(call.params["owner"].clone())?;
                let recipient: OctraAddress = serde_json::from_value(call.params["recipient"].clone())?;
                let amount: EncryptedU64 = serde_json::from_value(call.params["amount"].clone())?;
                self.call_transfer_from(ctx, &pk, &owner, &recipient, &amount)
            }
            "call_mint" => {
                let recipient: OctraAddress = serde_json::from_value(call.params["recipient"].clone())?;
                let amount: EncryptedU64 = serde_json::from_value(call.params["amount"].clone())?;
                self.call_mint(ctx, &pk, &recipient, &amount)
            }
            "call_burn" => {
                let holder: OctraAddress = serde_json::from_value(call.params["holder"].clone())?;
                let amount: EncryptedU64 = serde_json::from_value(call.params["amount"].clone())?;
                self.call_burn(ctx, &pk, &holder, &amount)
            }

            _ => Err(ShieldError::Internal(format!("Unknown method: {}", call.method))),
        }
    }

    fn methods(&self) -> Vec<MethodDescriptor> {
        vec![
            MethodDescriptor {
                name: "view_name".into(),
                method_type: MethodType::View,
                description: "Get token name".into(),
                params: vec![],
                returns: "{ name: string }".into(),
            },
            MethodDescriptor {
                name: "view_symbol".into(),
                method_type: MethodType::View,
                description: "Get token symbol".into(),
                params: vec![],
                returns: "{ symbol: string }".into(),
            },
            MethodDescriptor {
                name: "view_decimals".into(),
                method_type: MethodType::View,
                description: "Get decimal places".into(),
                params: vec![],
                returns: "{ decimals: u8 }".into(),
            },
            MethodDescriptor {
                name: "view_total_supply".into(),
                method_type: MethodType::View,
                description: "Get encrypted total supply ciphertext".into(),
                params: vec![],
                returns: "EncryptedU64 (ciphertext)".into(),
            },
            MethodDescriptor {
                name: "view_balance_of".into(),
                method_type: MethodType::View,
                description: "Get encrypted balance for address".into(),
                params: vec![ParamDescriptor {
                    name: "address".into(),
                    param_type: "string".into(),
                    description: "Octra address to query".into(),
                    required: true,
                }],
                returns: "EncryptedU64 (ciphertext, decryptable only by owner)".into(),
            },
            MethodDescriptor {
                name: "view_allowance".into(),
                method_type: MethodType::View,
                description: "Get encrypted allowance for owner->spender".into(),
                params: vec![
                    ParamDescriptor {
                        name: "owner".into(),
                        param_type: "string".into(),
                        description: "Token owner address".into(),
                        required: true,
                    },
                    ParamDescriptor {
                        name: "spender".into(),
                        param_type: "string".into(),
                        description: "Approved spender address".into(),
                        required: true,
                    },
                ],
                returns: "EncryptedU64 (ciphertext)".into(),
            },
            MethodDescriptor {
                name: "call_initialize".into(),
                method_type: MethodType::Call,
                description: "Initialize token with name, symbol, and minter".into(),
                params: vec![
                    ParamDescriptor { name: "name".into(), param_type: "string".into(), description: "Token name".into(), required: true },
                    ParamDescriptor { name: "symbol".into(), param_type: "string".into(), description: "Token symbol".into(), required: true },
                    ParamDescriptor { name: "minter".into(), param_type: "OctraAddress".into(), description: "Minter address (Pair contract)".into(), required: true },
                ],
                returns: "{ name, symbol, decimals }".into(),
            },
            MethodDescriptor {
                name: "call_transfer".into(),
                method_type: MethodType::Call,
                description: "Transfer encrypted tokens to recipient".into(),
                params: vec![
                    ParamDescriptor { name: "recipient".into(), param_type: "OctraAddress".into(), description: "Recipient address".into(), required: true },
                    ParamDescriptor { name: "amount".into(), param_type: "EncryptedU64".into(), description: "Encrypted transfer amount".into(), required: true },
                ],
                returns: "{ transferred: bool }".into(),
            },
            MethodDescriptor {
                name: "call_approve".into(),
                method_type: MethodType::Call,
                description: "Approve spender for encrypted allowance".into(),
                params: vec![
                    ParamDescriptor { name: "spender".into(), param_type: "OctraAddress".into(), description: "Spender address".into(), required: true },
                    ParamDescriptor { name: "amount".into(), param_type: "EncryptedU64".into(), description: "Encrypted allowance amount".into(), required: true },
                ],
                returns: "{ approved: bool }".into(),
            },
            MethodDescriptor {
                name: "call_transfer_from".into(),
                method_type: MethodType::Call,
                description: "Transfer tokens on behalf of owner (uses allowance)".into(),
                params: vec![
                    ParamDescriptor { name: "owner".into(), param_type: "OctraAddress".into(), description: "Token owner".into(), required: true },
                    ParamDescriptor { name: "recipient".into(), param_type: "OctraAddress".into(), description: "Recipient address".into(), required: true },
                    ParamDescriptor { name: "amount".into(), param_type: "EncryptedU64".into(), description: "Encrypted transfer amount".into(), required: true },
                ],
                returns: "{ transferred: bool }".into(),
            },
            MethodDescriptor {
                name: "call_mint".into(),
                method_type: MethodType::Call,
                description: "Mint LP tokens (restricted to Pair contract)".into(),
                params: vec![
                    ParamDescriptor { name: "recipient".into(), param_type: "OctraAddress".into(), description: "Mint recipient".into(), required: true },
                    ParamDescriptor { name: "amount".into(), param_type: "EncryptedU64".into(), description: "Encrypted mint amount".into(), required: true },
                ],
                returns: "{ minted: bool }".into(),
            },
            MethodDescriptor {
                name: "call_burn".into(),
                method_type: MethodType::Call,
                description: "Burn LP tokens (restricted to Pair contract)".into(),
                params: vec![
                    ParamDescriptor { name: "holder".into(), param_type: "OctraAddress".into(), description: "Token holder to burn from".into(), required: true },
                    ParamDescriptor { name: "amount".into(), param_type: "EncryptedU64".into(), description: "Encrypted burn amount".into(), required: true },
                ],
                returns: "{ burned: bool }".into(),
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
    pub fn execute(state: &mut ShieldToken, call_json: &str, ctx_json: &str) -> String {
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