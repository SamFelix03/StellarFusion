#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, Vec, log,
};

// Minimal amount for testing (0.001 XLM = 10,000 stroops)
const MINIMAL_AMOUNT: i128 = 10_000;

// Native XLM token address constant
const NATIVE_XLM_ADDRESS: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowData {
    pub creator: Address,
    pub recipient: Address,
    pub hashed_secret: BytesN<32>,
    pub amount: i128,
    pub withdrawn: bool,
}

#[contracttype]
pub enum DataKey {
    Escrow(Address),
    UserEscrows(Address),
    EscrowExists(Address),
    NativeToken,
    EscrowCounter,
}

#[contract]
pub struct MinimalEscrowFactory;

#[contractimpl]
impl MinimalEscrowFactory {
    /// Initialize the factory with the native token address
    pub fn initialize(env: Env, native_token: Address) {
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::EscrowCounter, &0u64);
    }

    /// Create a minimal escrow with fixed amount
    pub fn create_escrow(
        env: Env,
        creator: Address,
        recipient: Address,
        hashed_secret: BytesN<32>,
    ) -> Address {
        // Require authorization from creator
        creator.require_auth();

        // Generate unique escrow identifier using counter
        let counter: u64 = env.storage().instance().get(&DataKey::EscrowCounter).unwrap_or(0);
        let new_counter = counter + 1;
        env.storage().instance().set(&DataKey::EscrowCounter, &new_counter);
        
        // Use the contract's own address as the escrow identifier
        let escrow_address = env.current_contract_address();

        // Create escrow data
        let escrow_data = EscrowData {
            creator: creator.clone(),
            recipient: recipient.clone(),
            hashed_secret: hashed_secret.clone(),
            amount: MINIMAL_AMOUNT,
            withdrawn: false,
        };

        // Store escrow data
        env.storage().persistent().set(&DataKey::Escrow(escrow_address.clone()), &escrow_data);
        env.storage().persistent().set(&DataKey::EscrowExists(escrow_address.clone()), &true);

        // Update user escrows mapping
        let mut user_escrows: Vec<Address> = env.storage()
            .persistent()
            .get(&DataKey::UserEscrows(creator.clone()))
            .unwrap_or(Vec::new(&env));
        user_escrows.push_back(escrow_address.clone());
        env.storage().persistent().set(&DataKey::UserEscrows(creator.clone()), &user_escrows);

        // Transfer minimal amount from creator to this contract
        let native_token = Self::get_native_token(&env);
        Self::transfer_tokens(&env, &native_token, &creator, &env.current_contract_address(), MINIMAL_AMOUNT);

        // Log event
        log!(&env, "EscrowCreated: creator={}, recipient={}, escrow={}, amount={}", 
             creator, recipient, escrow_address, MINIMAL_AMOUNT);

        escrow_address
    }

    /// Withdraw from escrow using secret
    pub fn withdraw_escrow(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
    ) {
        caller.require_auth();

        let mut escrow_data: EscrowData = env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid escrow address"));

        // Validate escrow state
        if escrow_data.withdrawn {
            panic!("Already withdrawn");
        }

        // Verify secret using SHA256
        let computed_hash = env.crypto().sha256(&secret);
        let computed_bytes = BytesN::from_array(&env, &computed_hash.to_array());
        if computed_bytes != escrow_data.hashed_secret {
            panic!("Invalid secret");
        }

        // Mark as withdrawn
        escrow_data.withdrawn = true;
        env.storage().persistent().set(&DataKey::Escrow(escrow_address.clone()), &escrow_data);

        // Transfer funds to recipient
        let native_token = Self::get_native_token(&env);
        Self::transfer_tokens(&env, &native_token, &env.current_contract_address(), &escrow_data.recipient, escrow_data.amount);

        log!(&env, "EscrowWithdrawal: caller={}, recipient={}, amount={}", 
             caller, escrow_data.recipient, escrow_data.amount);
    }

    /// Get escrow details
    pub fn get_escrow(env: Env, escrow_address: Address) -> EscrowData {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_address))
            .unwrap_or_else(|| panic!("Invalid escrow address"))
    }

    /// Get user escrows
    pub fn get_user_escrows(env: Env, user: Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::UserEscrows(user))
            .unwrap_or(Vec::new(&env))
    }

    /// Check if address is an escrow
    pub fn is_escrow(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::EscrowExists(address))
            .unwrap_or(false)
    }

    /// Get escrow counter
    pub fn get_escrow_counter(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0)
    }

    // Private helper function
    fn get_native_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::NativeToken)
            .unwrap_or_else(|| panic!("Native token not set"))
    }

    // Helper function to handle native XLM transfers
    fn transfer_tokens(env: &Env, token_address: &Address, from: &Address, to: &Address, amount: i128) {
        let token_client = token::Client::new(env, token_address);
        token_client.transfer(from, to, &amount);
        log!(env, "XLM transferred: from={}, to={}, amount={}", from, to, amount);
    }
} 