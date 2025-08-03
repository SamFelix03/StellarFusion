#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contractclient, Address, Bytes, BytesN, Env, Vec, log,
};

// LimitOrderProtocol client interface
#[contractclient(name = "LimitOrderProtocolTraitClient")]
pub trait LimitOrderProtocolTrait {
    fn fill_order(
        env: Env,
        order_hash: BytesN<32>,
        maker: Address,
        recipient: Address,
        token_amount: i128,
        hashed_secret: BytesN<32>,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        part_index: u64,
        total_parts: u32,
    ) -> Address;
    
    fn cancel_order(env: Env, caller: Address, order_hash: BytesN<32>, part_index: u64);
    fn get_order(env: Env, order_hash: BytesN<32>) -> Vec<FilledOrder>;
    fn get_order_part(env: Env, order_hash: BytesN<32>, part_index: u64) -> FilledOrder;
    fn get_remaining_segments(env: Env, order_hash: BytesN<32>, total_parts: u32) -> u64;
    fn is_part_available(env: Env, order_hash: BytesN<32>, part_index: u64) -> bool;
    fn get_available_part_indices(env: Env, order_hash: BytesN<32>, total_parts: u32) -> Vec<u64>;
    fn get_user_filled_orders(env: Env, user: Address) -> Vec<BytesN<32>>;
}

// EscrowFactory client interface
#[contractclient(name = "EscrowFactoryTraitClient")]
pub trait EscrowFactoryTrait {
    fn create_dst_escrow_partial(
        env: Env,
        creator: Address,
        hashed_secret: BytesN<32>,
        recipient: Address,
        token_amount: i128,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        cancellation_start: u64,
        part_index: u64,
        total_parts: u32,
    ) -> Address;
    
    fn get_user_escrows(env: Env, user: Address) -> Vec<Address>;
    fn get_src_escrow(env: Env, escrow_address: Address) -> SourceEscrowData;
    fn withdraw_src_escrow(env: Env, caller: Address, escrow_address: Address, secret: Bytes);
    fn withdraw_src_escrow_with_proof(
        env: Env, 
        caller: Address, 
        escrow_address: Address, 
        secret: Bytes, 
        merkle_proof: Vec<BytesN<32>>
    );
    fn get_dst_escrow(env: Env, escrow_address: Address) -> DestinationEscrowData;
    fn withdraw_dst_escrow(env: Env, caller: Address, escrow_address: Address, secret: Bytes);
    fn withdraw_dst_escrow_with_proof(
        env: Env, 
        caller: Address, 
        escrow_address: Address, 
        secret: Bytes, 
        merkle_proof: Vec<BytesN<32>>
    );
}

// Source escrow data structure (matching the EscrowFactory)
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
    pub part_index: u64,
    pub total_parts: u32,
    pub is_partial_fill: bool,
}

// Destination escrow data structure (matching the EscrowFactory)
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
    pub public_cancellation_start: u64,
    pub funds_withdrawn: bool,
    pub cancelled: bool,
    pub part_index: u64,
    pub total_parts: u32,
    pub is_partial_fill: bool,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FilledOrder {
    pub order_hash: BytesN<32>,
    pub maker: Address,
    pub recipient: Address,
    pub escrow_address: Address,
    pub part_index: u64,
    pub total_parts: u32,
    pub is_active: bool,
}

#[contracttype]
pub enum DataKey {
    LimitOrderProtocol, // LOP contract address
    EscrowFactory, // factory contract address
    Owner, // contract owner
}

#[contract]
pub struct SimpleResolver;

#[contractimpl]
impl SimpleResolver {
    /// Initialize the resolver with LOP and factory addresses
    pub fn initialize(
        env: Env, 
        lop_address: Address, 
        escrow_factory: Address,
        owner: Address
    ) {
        env.storage().instance().set(&DataKey::LimitOrderProtocol, &lop_address);
        env.storage().instance().set(&DataKey::EscrowFactory, &escrow_factory);
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    /// Execute a cross-chain swap by filling an order and creating escrow
    pub fn execute_cross_chain_swap(
        env: Env,
        caller: Address,
        order_hash: BytesN<32>,
        maker: Address,
        recipient: Address,
        token_amount: i128,
        hashed_secret: BytesN<32>,
        withdrawal_start: u64,
        part_index: u64,
        total_parts: u32,
    ) -> Address {
        // Only owner can execute
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic!("Only owner can execute");
        }
        caller.require_auth();

        // Get LOP address
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        // Fill the order through LOP (this creates the escrow)
        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        let escrow_address = lop_client.fill_order(
            &order_hash,
            &maker,
            &recipient,
            &token_amount,
            &hashed_secret,
            &withdrawal_start,
            &(withdrawal_start + 1800), // public_withdrawal_start (30 min later)
            &part_index,
            &total_parts,
        );

        log!(&env, "CrossChainSwapInitiated: orderHash={}, escrowAddress={}, hashedSecret={}, partIndex={}", 
             order_hash, escrow_address, hashed_secret, part_index);

        escrow_address
    }

    /// Complete a cross-chain swap by withdrawing from escrow
    pub fn complete_cross_chain_swap(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
        part_index: u64,
        merkle_proof: Vec<BytesN<32>>,
    ) {
        // Only owner can complete
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic!("Only owner can complete");
        }
        caller.require_auth();

        // Get factory address
        let factory_address: Address = env.storage()
            .instance()
            .get(&DataKey::EscrowFactory)
            .unwrap();

        // Get the escrow contract and check if it's a partial fill
        let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
        let escrow_data = factory_client.get_src_escrow(&escrow_address);
        
        // Check if this is a partial fill escrow
        if escrow_data.is_partial_fill {
            // For partial fills, use withdrawWithProof with merkle proof
            if merkle_proof.len() == 0 {
                panic!("Merkle proof required for partial fills");
            }
            factory_client.withdraw_src_escrow_with_proof(&caller, &escrow_address, &secret, &merkle_proof);
        } else {
            // For complete fills, use regular withdraw
            factory_client.withdraw_src_escrow(&caller, &escrow_address, &secret);
        }

        log!(&env, "CrossChainSwapCompleted: orderHash={}, escrowAddress={}, secret={}, partIndex={}", 
             BytesN::from_array(&env, &[0u8; 32]), escrow_address, secret, part_index);
    }

    /// Withdraw from source escrow after finality lock passes
    pub fn withdraw_from_source_escrow(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
        part_index: u64,
        merkle_proof: Vec<BytesN<32>>,
    ) {
        // Get factory address
        let factory_address: Address = env.storage()
            .instance()
            .get(&DataKey::EscrowFactory)
            .unwrap();

        // Get the escrow contract and check if it's a partial fill
        let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
        let escrow_data = factory_client.get_src_escrow(&escrow_address);
        
        // Check if this is a partial fill escrow
        if escrow_data.is_partial_fill {
            // For partial fills, use withdrawWithProof with merkle proof
            if merkle_proof.len() == 0 {
                panic!("Merkle proof required for partial fills");
            }
            factory_client.withdraw_src_escrow_with_proof(&caller, &escrow_address, &secret, &merkle_proof);
        } else {
            // For complete fills, use regular withdraw
            factory_client.withdraw_src_escrow(&caller, &escrow_address, &secret);
        }

        log!(&env, "SourceEscrowWithdrawn: escrowAddress={}, secret={}, partIndex={}", 
             escrow_address, secret, part_index);
    }

    /// Withdraw from destination escrow after finality lock passes
    pub fn withdraw_from_destination_escrow(
        env: Env,
        caller: Address,
        escrow_address: Address,
        secret: Bytes,
        part_index: u64,
        merkle_proof: Vec<BytesN<32>>,
    ) {
        // Get factory address
        let factory_address: Address = env.storage()
            .instance()
            .get(&DataKey::EscrowFactory)
            .unwrap();

        // Get the escrow contract and check if it's a partial fill
        let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
        let escrow_data = factory_client.get_dst_escrow(&escrow_address);
        
        // Check if this is a partial fill escrow
        if escrow_data.is_partial_fill {
            // For partial fills, use withdrawWithProof with merkle proof
            if merkle_proof.len() == 0 {
                panic!("Merkle proof required for partial fills");
            }
            factory_client.withdraw_dst_escrow_with_proof(&caller, &escrow_address, &secret, &merkle_proof);
        } else {
            // For complete fills, use regular withdraw
            factory_client.withdraw_dst_escrow(&caller, &escrow_address, &secret);
        }

        log!(&env, "DestinationEscrowWithdrawn: escrowAddress={}, secret={}, partIndex={}", 
             escrow_address, secret, part_index);
    }

    /// Create destination escrow on target chain
    pub fn create_destination_escrow(
        env: Env,
        caller: Address,
        hashed_secret: BytesN<32>,
        recipient: Address,
        amount: i128,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        cancellation_start: u64,
        part_index: u64,
        total_parts: u32,
    ) -> Address {
        // Only owner can create
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic!("Only owner can create");
        }
        caller.require_auth();

        // Get factory address
        let factory_address: Address = env.storage()
            .instance()
            .get(&DataKey::EscrowFactory)
            .unwrap();

        // Create destination escrow
        let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
        factory_client.create_dst_escrow_partial(
            &caller, // creator (resolver)
            &hashed_secret,
            &recipient,
            &amount,
            &withdrawal_start,
            &public_withdrawal_start,
            &cancellation_start,
            &part_index,
            &total_parts,
        );

        // Get the created escrow address
        let user_escrows = factory_client.get_user_escrows(&caller);
        let escrow_address = user_escrows.get(user_escrows.len() - 1).unwrap();

        log!(&env, "DestinationEscrowCreated: creator={}, recipient={}, escrowAddress={}, amount={}, partIndex={}", 
             caller, recipient, escrow_address, amount, part_index);

        escrow_address
    }

    /// Cancel a specific order part
    pub fn cancel_order(
        env: Env, 
        caller: Address, 
        order_hash: BytesN<32>, 
        part_index: u64
    ) {
        // Only owner can cancel
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic!("Only owner can cancel");
        }
        caller.require_auth();

        // Get LOP address
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        // Cancel the order through LOP
        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.cancel_order(&caller, &order_hash, &part_index);

        log!(&env, "OrderCancelled: orderHash={}, maker={}, partIndex={}", 
             order_hash, caller, part_index);
    }

    /// Get all filled order parts
    pub fn get_order(env: Env, order_hash: BytesN<32>) -> Vec<FilledOrder> {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.get_order(&order_hash)
    }

    /// Get specific filled order part
    pub fn get_order_part(env: Env, order_hash: BytesN<32>, part_index: u64) -> FilledOrder {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.get_order_part(&order_hash, &part_index)
    }

    /// Get remaining segments for an order
    pub fn get_remaining_segments(env: Env, order_hash: BytesN<32>, total_parts: u32) -> u64 {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.get_remaining_segments(&order_hash, &total_parts)
    }

    /// Check if a specific part index is available for partial fill
    pub fn is_part_available(env: Env, order_hash: BytesN<32>, part_index: u64) -> bool {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.is_part_available(&order_hash, &part_index)
    }

    /// Get all available part indices for an order
    pub fn get_available_part_indices(env: Env, order_hash: BytesN<32>, total_parts: u32) -> Vec<u64> {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.get_available_part_indices(&order_hash, &total_parts)
    }

    /// Get all filled orders for a user
    pub fn get_user_filled_orders(env: Env, user: Address) -> Vec<BytesN<32>> {
        let lop_address: Address = env.storage()
            .instance()
            .get(&DataKey::LimitOrderProtocol)
            .unwrap();

        let lop_client = LimitOrderProtocolTraitClient::new(&env, &lop_address);
        lop_client.get_user_filled_orders(&user)
    }

    /// Emergency function to rescue XLM stuck in contract
    pub fn rescue_xlm(env: Env, caller: Address, to: Address) {
        caller.require_auth();
        
        // Check if caller is owner
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic!("Only owner can rescue");
        }

        // In Stellar, we can't directly send native balance like EVM
        // This would need to be implemented based on the specific token contract
        log!(&env, "XLM rescue requested: to={}", to);
    }
}