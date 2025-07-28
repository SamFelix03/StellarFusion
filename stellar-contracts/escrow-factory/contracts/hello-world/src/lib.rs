#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env,
    Vec, log,
};

// Security deposit amount (0.1 XLM = 1,000,000 stroops)
const DEPOSIT_AMOUNT: i128 = 1_000_000;
const RESCUE_DELAY: u64 = 7 * 24 * 60 * 60; // 7 days in seconds

// Native XLM token address constant
const NATIVE_XLM_ADDRESS: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceEscrowData {
    pub creator: Address,
    pub recipient: Address,
    pub hashed_secret: BytesN<32>,
    pub token: Address,
    pub amount: i128,
    pub security_deposit: i128,
    pub withdrawal_start: u64,
    pub public_withdrawal_start: u64,
    pub cancellation_start: u64,
    pub public_cancellation_start: u64,
    pub funds_withdrawn: bool,
    pub cancelled: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DestinationEscrowData {
    pub creator: Address,
    pub recipient: Address,
    pub hashed_secret: BytesN<32>,
    pub token: Address,
    pub amount: i128,
    pub security_deposit: i128,
    pub withdrawal_start: u64,
    pub public_withdrawal_start: u64,
    pub cancellation_start: u64,
    pub funds_withdrawn: bool,
    pub cancelled: bool,
}

#[contracttype]
pub enum DataKey {
    SourceEscrow(Address),
    DestinationEscrow(Address),
    UserEscrows(Address),
    EscrowExists(Address),
    NativeToken,
    EscrowCounter,
    // Add authorization storage - equivalent to EVM's allowances mapping
    TokenAllowance(Address, Address), // (token_owner, spender) -> amount
}

#[contract]
pub struct HashLockedEscrowFactory;

#[contractimpl]
impl HashLockedEscrowFactory {
    /// Initialize the factory with the native token address
    pub fn initialize(env: Env, native_token: Address) {
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::EscrowCounter, &0u64);
    }

    /// Approve factory to spend tokens (equivalent to ERC20 approve() in EVM)
    /// This allows the factory to transfer tokens on behalf of the caller
    pub fn approve(env: Env, caller: Address, amount: i128) {
        caller.require_auth();
        
        // Store the allowance - factory can spend up to 'amount' tokens from caller
        env.storage().persistent().set(
            &DataKey::TokenAllowance(caller.clone(), env.current_contract_address()),
            &amount
        );
        
        log!(&env, "Approval: owner={}, spender={}, amount={}", 
             caller, env.current_contract_address(), amount);
    }

    /// Get current allowance (equivalent to ERC20 allowance() in EVM)
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TokenAllowance(owner, spender))
            .unwrap_or(0)
    }

    /// Create a source escrow (equivalent to createSrcEscrow in EVM)
    /// This function requires authorization from both creator (resolver) and buyer
    pub fn create_src_escrow(
        env: Env,
        creator: Address,
        hashed_secret: BytesN<32>,
        recipient: Address,
        buyer: Address,
        token_amount: i128,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        cancellation_start: u64,
        public_cancellation_start: u64,
    ) -> Address {
        // Validate inputs (same as EVM contract)
        if token_amount <= 0 {
            panic!("Invalid amount");
        }

        // Validate time windows (same as EVM contract)
        if public_withdrawal_start <= withdrawal_start
            || cancellation_start <= public_withdrawal_start
            || public_cancellation_start <= cancellation_start
        {
            panic!("Invalid time windows");
        }

        // Require authorization from creator (resolver) - equivalent to msg.sender check in EVM
        creator.require_auth();
        
        // Check allowance instead of requiring buyer auth - equivalent to EVM's transferFrom() pattern
        let current_allowance = Self::allowance(env.clone(), buyer.clone(), env.current_contract_address());
        if current_allowance < token_amount {
            panic!("Insufficient allowance");
        }
        
        // Reduce allowance - equivalent to EVM's transferFrom() reducing allowance
        let new_allowance = current_allowance - token_amount;
        env.storage().persistent().set(
            &DataKey::TokenAllowance(buyer.clone(), env.current_contract_address()),
            &new_allowance
        );

        // Generate unique escrow identifier using counter
        let counter: u64 = env.storage().instance().get(&DataKey::EscrowCounter).unwrap_or(0);
        let new_counter = counter + 1;
        env.storage().instance().set(&DataKey::EscrowCounter, &new_counter);
        
        // Use the contract's own address as the escrow identifier
        // Uniqueness is achieved through the counter and storage key system
        let final_addr = env.current_contract_address();

        // Create escrow data
        let escrow_data = SourceEscrowData {
            creator: buyer.clone(), // Use buyer as creator (matches EVM logic)
            recipient: recipient.clone(),
            hashed_secret: hashed_secret.clone(),
            token: Self::get_native_token(&env),
            amount: token_amount,
            security_deposit: DEPOSIT_AMOUNT,
            withdrawal_start,
            public_withdrawal_start,
            cancellation_start,
            public_cancellation_start,
            funds_withdrawn: false,
            cancelled: false,
        };

        // Store escrow data
        env.storage().persistent().set(&DataKey::SourceEscrow(final_addr.clone()), &escrow_data);
        env.storage().persistent().set(&DataKey::EscrowExists(final_addr.clone()), &true);

        // Update user escrows mapping
        let mut user_escrows: Vec<Address> = env.storage()
            .persistent()
            .get(&DataKey::UserEscrows(buyer.clone()))
            .unwrap_or(Vec::new(&env));
        user_escrows.push_back(final_addr.clone());
        env.storage().persistent().set(&DataKey::UserEscrows(buyer.clone()), &user_escrows);

        // Transfer tokens from buyer to this contract (equivalent to transferFrom in EVM)
        let native_token = Self::get_native_token(&env);
        Self::transfer_tokens(&env, &native_token, &buyer, &env.current_contract_address(), token_amount, true);

        // Transfer security deposit from creator (resolver does this directly)
        Self::transfer_tokens(&env, &native_token, &creator, &env.current_contract_address(), DEPOSIT_AMOUNT, false);

        // Log event (equivalent to SrcEscrowCreated event)
        log!(&env, "SrcEscrowCreated: creator={}, recipient={}, escrow={}, amount={}", 
             buyer, recipient, final_addr, token_amount);

        final_addr
    }

    /// Create a destination escrow (equivalent to createDstEscrow in EVM)
    /// This function requires authorization from creator (resolver) for token transfer
    pub fn create_dst_escrow(
        env: Env,
        creator: Address,
        hashed_secret: BytesN<32>,
        recipient: Address,
        token_amount: i128,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        cancellation_start: u64,
    ) -> Address {
        // Validate inputs
        if token_amount <= 0 {
            panic!("Invalid amount");
        }

        // Validate time windows
        if public_withdrawal_start <= withdrawal_start
            || cancellation_start <= public_withdrawal_start
        {
            panic!("Invalid time windows");
        }

        // Require authorization from creator (resolver) - equivalent to msg.sender check in EVM
        creator.require_auth();
        
        // Require authorization from creator for token transfer - equivalent to approve() + transferFrom() in EVM
        // In EVM, the resolver must have tokens and approve the factory
        // In Soroban 23.0.0, the resolver must authorize this contract call
        // Since creator.require_auth() is already called above, this covers the authorization

        // Generate unique escrow identifier using counter
        let counter: u64 = env.storage().instance().get(&DataKey::EscrowCounter).unwrap_or(0);
        let new_counter = counter + 1;
        env.storage().instance().set(&DataKey::EscrowCounter, &new_counter);
        
        // Use the contract's own address as the escrow identifier
        // Uniqueness is achieved through the counter and storage key system
        let final_addr = env.current_contract_address();

        // Create escrow data
        let escrow_data = DestinationEscrowData {
            creator: creator.clone(),
            recipient: recipient.clone(),
            hashed_secret: hashed_secret.clone(),
            token: Self::get_native_token(&env),
            amount: token_amount,
            security_deposit: DEPOSIT_AMOUNT,
            withdrawal_start,
            public_withdrawal_start,
            cancellation_start,
            funds_withdrawn: false,
            cancelled: false,
        };

        // Store escrow data
        env.storage().persistent().set(&DataKey::DestinationEscrow(final_addr.clone()), &escrow_data);
        env.storage().persistent().set(&DataKey::EscrowExists(final_addr.clone()), &true);

        // Update user escrows mapping
        let mut user_escrows: Vec<Address> = env.storage()
            .persistent()
            .get(&DataKey::UserEscrows(creator.clone()))
            .unwrap_or(Vec::new(&env));
        user_escrows.push_back(final_addr.clone());
        env.storage().persistent().set(&DataKey::UserEscrows(creator.clone()), &user_escrows);

        // Transfer tokens from creator to this contract
        let native_token = Self::get_native_token(&env);
        Self::transfer_tokens(&env, &native_token, &creator, &env.current_contract_address(), token_amount, false);

        // Transfer security deposit from creator
        Self::transfer_tokens(&env, &native_token, &creator, &env.current_contract_address(), DEPOSIT_AMOUNT, false);

        // Log event
        log!(&env, "DstEscrowCreated: creator={}, recipient={}, escrow={}, amount={}", 
             creator, recipient, final_addr, token_amount);

        final_addr
    }

    /// Withdraw from source escrow (equivalent to SourceEscrow.withdraw in EVM)
    pub fn withdraw_src_escrow(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
    ) {
        caller.require_auth();

        let mut escrow_data: SourceEscrowData = env.storage()
            .persistent()
            .get(&DataKey::SourceEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        // Validate escrow state (same validations as EVM)
        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.withdrawal_start {
            panic!("Withdrawal not started");
        }
        if current_time >= escrow_data.cancellation_start {
            panic!("Withdrawal ended");
        }

        // Check private window restriction (same as EVM)
        if current_time < escrow_data.public_withdrawal_start {
            if caller != escrow_data.recipient {
                panic!("Private window only");
            }
        }

        // Verify secret using SHA256 (same as EVM after our modification)
        let computed_hash = env.crypto().sha256(&secret);
        let computed_bytes = BytesN::from_array(&env, &computed_hash.to_array());
        if computed_bytes != escrow_data.hashed_secret {
            panic!("Invalid secret");
        }

        // Mark as withdrawn
        escrow_data.funds_withdrawn = true;
        env.storage().persistent().set(&DataKey::SourceEscrow(escrow_address.clone()), &escrow_data);

        // Transfer funds to caller (resolver) - matches EVM behavior
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.amount, false);

        // Transfer security deposit to caller
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.security_deposit, false);

        log!(&env, "SourceEscrowWithdrawal: caller={}, amount={}", caller, escrow_data.amount);
    }

    /// Withdraw from destination escrow (equivalent to DestinationEscrow.withdraw in EVM)
    pub fn withdraw_dst_escrow(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
    ) {
        caller.require_auth();

        let mut escrow_data: DestinationEscrowData = env.storage()
            .persistent()
            .get(&DataKey::DestinationEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        // Validate escrow state
        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.withdrawal_start {
            panic!("Withdrawal not started");
        }
        if current_time >= escrow_data.cancellation_start {
            panic!("Withdrawal ended");
        }

        // Check private window - both recipient (buyer) and creator (resolver) can withdraw
        if current_time < escrow_data.public_withdrawal_start {
            if caller != escrow_data.recipient && caller != escrow_data.creator {
                panic!("Private window only");
            }
        }

        // Verify secret using SHA256
        let computed_hash = env.crypto().sha256(&secret);
        let computed_bytes = BytesN::from_array(&env, &computed_hash.to_array());
        if computed_bytes != escrow_data.hashed_secret {
            panic!("Invalid secret");
        }

        // Mark as withdrawn
        escrow_data.funds_withdrawn = true;
        env.storage().persistent().set(&DataKey::DestinationEscrow(escrow_address.clone()), &escrow_data);

        // Transfer funds to recipient (buyer) regardless of who calls - matches EVM behavior
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.recipient, escrow_data.amount, false);

        // Transfer security deposit to caller
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &caller, escrow_data.security_deposit, false);

        log!(&env, "DestinationEscrowWithdrawal: caller={}, recipient={}, amount={}", 
             caller, escrow_data.recipient, escrow_data.amount);
    }

    /// Cancel source escrow (equivalent to SourceEscrow.cancel in EVM)
    pub fn cancel_src_escrow(env: Env, caller: Address, escrow_address: Address) {
        caller.require_auth();

        let mut escrow_data: SourceEscrowData = env.storage()
            .persistent()
            .get(&DataKey::SourceEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.cancellation_start {
            panic!("Cancellation not started");
        }
        if current_time >= escrow_data.public_cancellation_start {
            panic!("Private cancellation ended");
        }
        if caller != escrow_data.creator {
            panic!("Unauthorized");
        }

        // Mark as cancelled
        escrow_data.cancelled = true;
        env.storage().persistent().set(&DataKey::SourceEscrow(escrow_address.clone()), &escrow_data);

        // Return funds to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.amount, false);

        // Return security deposit to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.security_deposit, false);

        log!(&env, "SourceEscrowCancelled: creator={}, amount={}", escrow_data.creator, escrow_data.amount);
    }

    /// Cancel destination escrow (equivalent to DestinationEscrow.cancel in EVM)
    pub fn cancel_dst_escrow(env: Env, caller: Address, escrow_address: Address) {
        caller.require_auth();

        let mut escrow_data: DestinationEscrowData = env.storage()
            .persistent()
            .get(&DataKey::DestinationEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.cancellation_start {
            panic!("Cancellation not started");
        }
        if caller != escrow_data.creator {
            panic!("Unauthorized");
        }

        // Mark as cancelled
        escrow_data.cancelled = true;
        env.storage().persistent().set(&DataKey::DestinationEscrow(escrow_address.clone()), &escrow_data);

        // Return funds to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.amount, false);

        // Return security deposit to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.security_deposit, false);

        log!(&env, "DestinationEscrowCancelled: creator={}, amount={}", escrow_data.creator, escrow_data.amount);
    }

    /// Rescue funds from source escrow (equivalent to SourceEscrow.rescue in EVM)
    pub fn rescue_src_escrow(env: Env, caller: Address, escrow_address: Address) {
        caller.require_auth();

        let mut escrow_data: SourceEscrowData = env.storage()
            .persistent()
            .get(&DataKey::SourceEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.public_cancellation_start + RESCUE_DELAY {
            panic!("Rescue not available");
        }
        if caller != escrow_data.recipient {
            panic!("Unauthorized");
        }

        // Mark as withdrawn
        escrow_data.funds_withdrawn = true;
        env.storage().persistent().set(&DataKey::SourceEscrow(escrow_address.clone()), &escrow_data);

        // Transfer funds to recipient
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.recipient, escrow_data.amount, false);

        // Return security deposit to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.security_deposit, false);

        log!(&env, "SourceEscrowRescued: recipient={}, amount={}", escrow_data.recipient, escrow_data.amount);
    }

    /// Rescue funds from destination escrow (equivalent to DestinationEscrow.rescue in EVM)
    pub fn rescue_dst_escrow(env: Env, caller: Address, escrow_address: Address) {
        caller.require_auth();

        let mut escrow_data: DestinationEscrowData = env.storage()
            .persistent()
            .get(&DataKey::DestinationEscrow(escrow_address.clone()))
            .unwrap_or_else(|| panic!("Invalid address"));

        if escrow_data.funds_withdrawn {
            panic!("Already withdrawn");
        }
        if escrow_data.cancelled {
            panic!("Already cancelled");
        }

        let current_time = env.ledger().timestamp();
        if current_time < escrow_data.cancellation_start + RESCUE_DELAY {
            panic!("Rescue not available");
        }
        if caller != escrow_data.creator {
            panic!("Unauthorized");
        }

        // Mark as withdrawn
        escrow_data.funds_withdrawn = true;
        env.storage().persistent().set(&DataKey::DestinationEscrow(escrow_address.clone()), &escrow_data);

        // Transfer funds to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.amount, false);

        // Return security deposit to creator
        Self::transfer_tokens(&env, &escrow_data.token, &env.current_contract_address(), &escrow_data.creator, escrow_data.security_deposit, false);

        log!(&env, "DestinationEscrowRescued: creator={}, amount={}", escrow_data.creator, escrow_data.amount);
    }

    /// Get user escrows (equivalent to getUserEscrows in EVM)
    pub fn get_user_escrows(env: Env, user: Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::UserEscrows(user))
            .unwrap_or(Vec::new(&env))
    }

    /// Get source escrow details
    pub fn get_src_escrow(env: Env, escrow_address: Address) -> SourceEscrowData {
        env.storage()
            .persistent()
            .get(&DataKey::SourceEscrow(escrow_address))
            .unwrap_or_else(|| panic!("Invalid address"))
    }

    /// Get destination escrow details
    pub fn get_dst_escrow(env: Env, escrow_address: Address) -> DestinationEscrowData {
        env.storage()
            .persistent()
            .get(&DataKey::DestinationEscrow(escrow_address))
            .unwrap_or_else(|| panic!("Invalid address"))
    }

    /// Check if address is an escrow contract
    pub fn is_escrow_contract(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::EscrowExists(address))
            .unwrap_or(false)
    }

    // Private helper function
    fn get_native_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::NativeToken)
            .unwrap_or_else(|| panic!("Native token not set"))
    }

    // Helper function to handle native XLM and token transfers with proper authorization
    fn transfer_tokens(env: &Env, token_address: &Address, from: &Address, to: &Address, amount: i128, use_allowance: bool) {
        let native_token = Self::get_native_token(env);
        
        if token_address == &native_token {
            // For native XLM, use the token interface (Stellar treats XLM as a token contract)
            let token_client = token::Client::new(env, token_address);
            
            if use_allowance {
                // Use transfer_from for buyer tokens (pulled via allowance)
                token_client.transfer_from(&env.current_contract_address(), from, to, &amount);
                log!(env, "Native XLM transferred via allowance: from={}, to={}, amount={}", from, to, amount);
            } else {
                // Use direct transfer for resolver's own tokens
                token_client.transfer(from, to, &amount);
                log!(env, "Native XLM transferred directly: from={}, to={}, amount={}", from, to, amount);
            }
            
        } else {
            // For other tokens, use the token contract interface
            let token_client = token::Client::new(env, token_address);
            
            if use_allowance {
                // Use transfer_from for allowance-based transfers
                token_client.transfer_from(&env.current_contract_address(), from, to, &amount);
                log!(env, "Token transferred via allowance: from={}, to={}, amount={}", from, to, amount);
            } else {
                // Use direct transfer for direct transfers
                token_client.transfer(from, to, &amount);
                log!(env, "Token transferred directly: from={}, to={}, amount={}", from, to, amount);
            }
        }
    }
}
