#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contractclient, Address, BytesN, Env, Vec, log,
};

// EscrowFactory client interface
#[contractclient(name = "EscrowFactoryTraitClient")]
pub trait EscrowFactoryTrait {
    fn create_src_escrow_partial(
        env: Env,
        creator: Address,
        hashed_secret: BytesN<32>,
        recipient: Address,
        buyer: Address,
        token_amount: i128,
        withdrawal_start: u64,
        public_withdrawal_start: u64,
        cancellation_start: u64,
        part_index: u64,
        total_parts: u32,
    ) -> Address;
    
    fn get_user_escrows(env: Env, user: Address) -> Vec<Address>;
    fn get_deposit_amount(env: Env) -> i128;
    fn cancel_src_escrow(env: Env, caller: Address, escrow_address: Address);
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrderParams {
    pub token_amount: i128,
    pub hashed_secret: BytesN<32>,
    pub withdrawal_start: u64,
    pub public_withdrawal_start: u64,
    pub cancellation_start: u64,
    pub part_index: u64,
    pub total_parts: u32,
}

#[contracttype]
pub enum DataKey {
    // Order tracking - non-sequential support
    FilledOrders(BytesN<32>), // orderHash -> Vec<FilledOrder>
    PartsFilled(BytesN<32>, u64), // (orderHash, partIndex) -> bool
    FilledSegmentsCount(BytesN<32>), // orderHash -> count
    UserFilledOrders(Address), // user -> Vec<orderHash>
    EscrowFactory, // factory contract address
    Owner, // contract owner
    // Add authorization storage - equivalent to EVM's allowances mapping
    TokenAllowance(Address, Address), // (token_owner, spender) -> amount
}

#[contract]
pub struct SimpleLimitOrderProtocol;

#[contractimpl]
impl SimpleLimitOrderProtocol {
    /// Initialize the protocol with the escrow factory address and owner
    pub fn initialize(env: Env, escrow_factory: Address, owner: Address) {
        env.storage().instance().set(&DataKey::EscrowFactory, &escrow_factory);
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    /// Approve LOP to spend tokens (equivalent to ERC20 approve() in EVM)
    /// This allows the LOP to transfer tokens on behalf of the caller
    pub fn approve(env: Env, caller: Address, amount: i128) {
        caller.require_auth();
        
        // Store the allowance - LOP can spend up to 'amount' tokens from caller
        env.storage().persistent().set(
            &DataKey::TokenAllowance(caller.clone(), env.current_contract_address()),
            &amount
        );
        
        log!(&env, "LOP Approval: owner={}, spender={}, amount={}", 
             caller, env.current_contract_address(), amount);
    }

    /// Get current allowance (equivalent to ERC20 allowance() in EVM)
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TokenAllowance(owner, spender))
            .unwrap_or(0)
    }

    /// Fill an order by creating an escrow - supports non-sequential partial fills  
    pub fn fill_order(
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
    ) -> Address {
        // Validate inputs
        if total_parts == 0 {
            panic!("Total parts must be > 0");
        }
        if part_index >= total_parts as u64 {
            panic!("Invalid part index");
        }
        if token_amount <= 0 {
            panic!("Token amount must be > 0");
        }

        // Check if this part is already filled
        let part_filled: bool = env.storage()
            .persistent()
            .get(&DataKey::PartsFilled(order_hash.clone(), part_index))
            .unwrap_or(false);
        if part_filled {
            panic!("Part already filled");
        }

        let is_partial_fill = total_parts > 1;

        // Check allowance - LOP must be approved to spend maker's tokens
        let current_allowance = Self::allowance(env.clone(), maker.clone(), env.current_contract_address());
        if current_allowance < token_amount {
            panic!("Insufficient allowance");
        }
        
        // Reduce allowance - equivalent to EVM's transferFrom() reducing allowance
        let new_allowance = current_allowance - token_amount;
        env.storage().persistent().set(
            &DataKey::TokenAllowance(maker.clone(), env.current_contract_address()),
            &new_allowance
        );

        // Get factory address and create escrow directly
        let factory_address: Address = env.storage().instance().get(&DataKey::EscrowFactory).unwrap();
        let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
        
        // Create escrow using factory client - matches exact factory signature
        let escrow_address = factory_client.create_src_escrow_partial(
            &env.current_contract_address(), // creator (LOP)
            &hashed_secret,
            &recipient,
            &maker,        // buyer (the one who approved LOP)
            &token_amount,
            &withdrawal_start,
            &public_withdrawal_start,
            &(withdrawal_start + 86400), // cancellation_start (24 hours after withdrawal)
            &part_index,
            &total_parts,
        );

        // Track the filled order part
        let filled_order = FilledOrder {
            order_hash: order_hash.clone(),
            maker: maker.clone(),
            recipient: recipient.clone(),
            escrow_address: escrow_address.clone(),
            part_index,
            total_parts,
            is_active: true,
        };

        // Add to filled orders array
        let mut filled_orders: Vec<FilledOrder> = env.storage()
            .persistent()
            .get(&DataKey::FilledOrders(order_hash.clone()))
            .unwrap_or(Vec::new(&env));
        filled_orders.push_back(filled_order);
        env.storage().persistent().set(&DataKey::FilledOrders(order_hash.clone()), &filled_orders);

        // Mark this part as filled
        env.storage().persistent().set(&DataKey::PartsFilled(order_hash.clone(), part_index), &true);

        // Update filled segments count
        let current_count: u64 = env.storage()
            .persistent()
            .get(&DataKey::FilledSegmentsCount(order_hash.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(&DataKey::FilledSegmentsCount(order_hash.clone()), &(current_count + 1));

        // Add to user's orders if first fill
        if current_count == 0 {
            let mut user_orders: Vec<BytesN<32>> = env.storage()
                .persistent()
                .get(&DataKey::UserFilledOrders(maker.clone()))
                .unwrap_or(Vec::new(&env));
            user_orders.push_back(order_hash.clone());
            env.storage().persistent().set(&DataKey::UserFilledOrders(maker.clone()), &user_orders);
        }

        log!(&env, "OrderFilled: orderHash={}, taker={}, partIndex={}, escrowAddress={}", 
             order_hash, env.current_contract_address(), part_index, escrow_address);
        log!(&env, "EscrowCreated: orderHash={}, escrowAddress={}, hashedSecret={}, partIndex={}", 
             order_hash, escrow_address, hashed_secret, part_index);

        escrow_address
    }

    /// Cancel a specific order part by calling the escrow's cancel function
    pub fn cancel_order(env: Env, caller: Address, order_hash: BytesN<32>, part_index: u64) {
        caller.require_auth();

        // Check if part is filled
        let part_filled: bool = env.storage()
            .persistent()
            .get(&DataKey::PartsFilled(order_hash.clone(), part_index))
            .unwrap_or(false);
        if !part_filled {
            panic!("Part not filled");
        }

        // Find the specific part in filled orders
        let mut filled_orders: Vec<FilledOrder> = env.storage()
            .persistent()
            .get(&DataKey::FilledOrders(order_hash.clone()))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        for i in 0..filled_orders.len() {
            let mut order = filled_orders.get(i).unwrap();
            if order.part_index == part_index {
                if !order.is_active {
                    panic!("Part already cancelled");
                }
                if order.maker != caller {
                    panic!("Only maker can cancel");
                }

                // Call escrow factory's cancel function
                let factory_address: Address = env.storage()
                    .instance()
                    .get(&DataKey::EscrowFactory)
                    .unwrap();
                
                let factory_client = EscrowFactoryTraitClient::new(&env, &factory_address);
                factory_client.cancel_src_escrow(&caller, &order.escrow_address);
                
                order.is_active = false;
                filled_orders.set(i, order);
                found = true;
                break;
            }
        }

        if !found {
            panic!("Part not found");
        }

        env.storage().persistent().set(&DataKey::FilledOrders(order_hash.clone()), &filled_orders);

        log!(&env, "OrderCancelled: orderHash={}, maker={}, partIndex={}", 
             order_hash, caller, part_index);
    }

    /// Get all filled order parts
    pub fn get_order(env: Env, order_hash: BytesN<32>) -> Vec<FilledOrder> {
        env.storage()
            .persistent()
            .get(&DataKey::FilledOrders(order_hash))
            .unwrap_or(Vec::new(&env))
    }

    /// Get specific filled order part
    pub fn get_order_part(env: Env, order_hash: BytesN<32>, part_index: u64) -> FilledOrder {
        let part_filled: bool = env.storage()
            .persistent()
            .get(&DataKey::PartsFilled(order_hash.clone(), part_index))
            .unwrap_or(false);
        if !part_filled {
            panic!("Part not filled");
        }

        let filled_orders: Vec<FilledOrder> = env.storage()
            .persistent()
            .get(&DataKey::FilledOrders(order_hash))
            .unwrap_or(Vec::new(&env));

        for i in 0..filled_orders.len() {
            let order = filled_orders.get(i).unwrap();
            if order.part_index == part_index {
                return order;
            }
        }
        panic!("Part not found");
    }

    /// Get remaining segments for an order
    pub fn get_remaining_segments(env: Env, order_hash: BytesN<32>, total_parts: u32) -> u64 {
        if total_parts <= 1 {
            // Complete fill - check if filled
            let part_filled: bool = env.storage()
                .persistent()
                .get(&DataKey::PartsFilled(order_hash, 0))
                .unwrap_or(false);
            return if part_filled { 0 } else { 1 };
        } else {
            // Partial fill - calculate remaining segments
            let filled_count: u64 = env.storage()
                .persistent()
                .get(&DataKey::FilledSegmentsCount(order_hash))
                .unwrap_or(0);
            return (total_parts as u64) - filled_count;
        }
    }

    /// Check if a specific part index is available for partial fill
    pub fn is_part_available(env: Env, order_hash: BytesN<32>, part_index: u64) -> bool {
        let part_filled: bool = env.storage()
            .persistent()
            .get(&DataKey::PartsFilled(order_hash, part_index))
            .unwrap_or(false);
        !part_filled
    }

    /// Get all available part indices for an order
    pub fn get_available_part_indices(env: Env, order_hash: BytesN<32>, total_parts: u32) -> Vec<u64> {
        let mut available_indices = Vec::new(&env);
        
        for i in 0..(total_parts as u64) {
            let part_filled: bool = env.storage()
                .persistent()
                .get(&DataKey::PartsFilled(order_hash.clone(), i))
                .unwrap_or(false);
            if !part_filled {
                available_indices.push_back(i);
            }
        }
        
        available_indices
    }

    /// Get all filled orders for a user
    pub fn get_user_filled_orders(env: Env, user: Address) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::UserFilledOrders(user))
            .unwrap_or(Vec::new(&env))
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