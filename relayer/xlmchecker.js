// Enhanced Stellar Contract Transactions Fetcher - Filtered by Effect 1 = account_debited
console.log('Script starting...');

const contractAddress = 'CBDMXSMH25IQJPI4YSAKMVITGXFVFH2O23SSAPS5L73F2WIGSDHQA6OY';
const stellarTestnetHorizon = 'https://horizon-testnet.stellar.org';

// Replace this with the address from your image
const filterByAddress = 'GA2HENU4XKUUKYJRL6B3PNX7CB2WYO3F5JXLQZNBQV2VLZ27KB63L3PV';

console.log('Configuration loaded:');
console.log('Contract:', contractAddress);
console.log('Filter Address:', filterByAddress);
console.log('Horizon URL:', stellarTestnetHorizon);

async function testConnection() {
    console.log('\nTesting connection to Stellar Horizon...');
    try {
        const response = await fetch(stellarTestnetHorizon);
        console.log('✓ Connection successful, status:', response.status);
        return true;
    } catch (error) {
        console.log('✗ Connection failed:', error.message);
        return false;
    }
}

async function checkAddress(address, label) {
    console.log(`\nChecking ${label}: ${address}`);
    try {
        const response = await fetch(`${stellarTestnetHorizon}/accounts/${address}`);
        if (response.ok) {
            const data = await response.json();
            console.log(`✓ ${label} exists - Sequence: ${data.sequence}`);
            return true;
        } else {
            console.log(`✗ ${label} not found - Status: ${response.status}`);
            if (response.status === 404) {
                console.log('  Address may not exist or not activated on testnet');
            }
            return false;
        }
    } catch (error) {
        console.log(`✗ Error checking ${label}:`, error.message);
        return false;
    }
}

async function getTransactions(address, limit = 10) {
    console.log(`\nFetching transactions for ${address} (limit: ${limit})`);
    try {
        const url = `${stellarTestnetHorizon}/accounts/${address}/transactions?order=desc&limit=${limit}`;
        console.log('URL:', url);
        
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            console.log('Response not OK, status:', response.status);
            return [];
        }
        
        const data = await response.json();
        const transactions = data._embedded ? data._embedded.records : [];
        console.log(`Found ${transactions.length} transactions`);
        
        return transactions;
    } catch (error) {
        console.log('Error fetching transactions:', error.message);
        return [];
    }
}

async function getTransactionOperations(txHash) {
    console.log(`    Fetching operations for transaction: ${txHash}`);
    try {
        const url = `${stellarTestnetHorizon}/transactions/${txHash}/operations`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.log(`    Error fetching operations: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const operations = data._embedded ? data._embedded.records : [];
        console.log(`    Found ${operations.length} operations`);
        
        return operations;
    } catch (error) {
        console.log('    Error fetching operations:', error.message);
        return [];
    }
}

async function getTransactionEffects(txHash) {
    console.log(`    Fetching effects for transaction: ${txHash}`);
    try {
        const url = `${stellarTestnetHorizon}/transactions/${txHash}/effects`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.log(`    Error fetching effects: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const effects = data._embedded ? data._embedded.records : [];
        console.log(`    Found ${effects.length} effects`);
        
        return effects;
    } catch (error) {
        console.log('    Error fetching effects:', error.message);
        return [];
    }
}

// NEW FUNCTION: Check if transaction should be included based on Effect 1 type and time filter
async function shouldIncludeTransaction(txHash, txCreatedAt) {
    // First check if transaction is within 5 minutes of current time
    const currentTime = new Date();
    const txTime = new Date(txCreatedAt);
    const timeDiffMs = currentTime.getTime() - txTime.getTime();
    const timeDiffMinutes = timeDiffMs / (1000 * 60); // Convert to minutes
    
    console.log(`    Transaction time: ${txTime.toLocaleString()}`);
    console.log(`    Current time: ${currentTime.toLocaleString()}`);
    console.log(`    Time difference: ${timeDiffMinutes.toFixed(2)} minutes`);
    
    if (timeDiffMinutes > 5) {
        console.log(`    Transaction is older than 5 minutes - EXCLUDED`);
        return false;
    }
    
    console.log(`    Transaction is within 5 minutes - checking effects...`);
    
    const effects = await getTransactionEffects(txHash);
    if (effects.length === 0) {
        console.log(`    No effects found - excluding transaction`);
        return false;
    }
    
    const firstEffect = effects[0];
    const shouldInclude = firstEffect.type === 'account_debited';
    
    console.log(`    Effect 1 type: ${firstEffect.type} - ${shouldInclude ? 'INCLUDED' : 'EXCLUDED'}`);
    return shouldInclude;
}

function displayOperationDetails(operation, index) {
    console.log(`      Operation ${index + 1}:`);
    console.log(`        ID: ${operation.id}`);
    console.log(`        Type: ${operation.type_i} (${operation.type})`);
    console.log(`        Source Account: ${operation.source_account || 'N/A'}`);
    
    // Display specific operation details based on type
    switch (operation.type) {
        case 'payment':
            console.log(`        From: ${operation.from}`);
            console.log(`        To: ${operation.to}`);
            console.log(`        Amount: ${operation.amount} ${operation.asset_type === 'native' ? 'XLM' : operation.asset_code}`);
            break;
            
        case 'create_account':
            console.log(`        Account: ${operation.account}`);
            console.log(`        Funder: ${operation.funder}`);
            console.log(`        Starting Balance: ${operation.starting_balance} XLM`);
            break;
            
        case 'invoke_host_function':
            console.log(`        Host Function Type: ${operation.host_function_type || 'N/A'}`);
            console.log(`        Function: ${operation.function || 'N/A'}`);
            if (operation.parameters) {
                console.log(`        Parameters: ${JSON.stringify(operation.parameters)}`);
            }
            if (operation.address) {
                console.log(`        Contract Address: ${operation.address}`);
            }
            if (operation.extend_to) {
                console.log(`        Extend To: ${operation.extend_to}`);
            }
            break;
            
        case 'extend_footprint_ttl':
            console.log(`        Extend To: ${operation.extend_to}`);
            break;
            
        case 'restore_footprint':
            console.log(`        Restoring footprint`);
            break;
            
        case 'manage_data':
            console.log(`        Data Name: ${operation.name}`);
            console.log(`        Data Value: ${operation.value || 'null (deleted)'}`);
            break;
            
        case 'change_trust':
            console.log(`        Asset: ${operation.asset_code || 'native'}`);
            console.log(`        Asset Issuer: ${operation.asset_issuer || 'N/A'}`);
            console.log(`        Limit: ${operation.limit}`);
            console.log(`        Trustee: ${operation.trustee || 'N/A'}`);
            console.log(`        Trustor: ${operation.trustor || 'N/A'}`);
            break;
    }
    
    // Display any additional fields that might be present
    const excludeFields = ['id', 'paging_token', 'transaction_hash', 'transaction_successful', 'source_account', 'type', 'type_i', 'created_at', 'from', 'to', 'amount', 'asset_type', 'asset_code', 'asset_issuer', 'account', 'funder', 'starting_balance', 'host_function_type', 'function', 'parameters', 'address', 'extend_to', 'name', 'value', 'limit', 'trustee', 'trustor'];
    
    Object.keys(operation).forEach(key => {
        if (!excludeFields.includes(key) && operation[key] !== null && operation[key] !== undefined) {
            console.log(`        ${key}: ${JSON.stringify(operation[key])}`);
        }
    });
}

function displayEffectDetails(effect, index) {
    console.log(`      Effect ${index + 1}:`);
    console.log(`        Type: ${effect.type}`);
    console.log(`        Account: ${effect.account || 'N/A'}`);
    
    switch (effect.type) {
        case 'account_credited':
        case 'account_debited':
            console.log(`        Amount: ${effect.amount} ${effect.asset_type === 'native' ? 'XLM' : effect.asset_code}`);
            break;
            
        case 'account_created':
            console.log(`        Starting Balance: ${effect.starting_balance} XLM`);
            break;
            
        case 'signer_created':
        case 'signer_removed':
        case 'signer_updated':
            console.log(`        Public Key: ${effect.public_key}`);
            console.log(`        Weight: ${effect.weight}`);
            break;
    }
    
    // Display other effect-specific data
    const excludeFields = ['id', 'paging_token', 'account', 'type', 'type_i', 'created_at', 'amount', 'asset_type', 'asset_code', 'asset_issuer', 'starting_balance', 'public_key', 'weight'];
    
    Object.keys(effect).forEach(key => {
        if (!excludeFields.includes(key) && effect[key] !== null && effect[key] !== undefined) {
            console.log(`        ${key}: ${JSON.stringify(effect[key])}`);
        }
    });
}

async function displayTransactionsWithDetails(transactions, title = 'Transactions') {
    console.log(`\n=== ${title} ===`);
    if (transactions.length === 0) {
        console.log('No transactions found');
        return;
    }
    
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        console.log(`\n${i + 1}. Transaction Hash: ${tx.hash}`);
        console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   Source: ${tx.source_account}`);
        console.log(`   Type: ${tx.type_i} (${getTransactionTypeName(tx.type_i)})`);
        console.log(`   Successful: ${tx.successful}`);
        console.log(`   Operations: ${tx.operation_count}`);
        console.log(`   Fee: ${tx.fee_charged} stroops`);
        console.log(`   Ledger: ${tx.ledger}`);
        console.log(`   Sequence: ${tx.source_account_sequence}`);
        
        if (tx.memo) {
            console.log(`   Memo: ${tx.memo} (${tx.memo_type})`);
        }
        
        // Fetch and display operations
        console.log(`\n   === OPERATIONS ===`);
        const operations = await getTransactionOperations(tx.hash);
        if (operations.length > 0) {
            operations.forEach((op, opIndex) => {
                displayOperationDetails(op, opIndex);
            });
        } else {
            console.log('      No operations found');
        }
        
        // Fetch and display effects
        console.log(`\n   === EFFECTS ===`);
        const effects = await getTransactionEffects(tx.hash);
        if (effects.length > 0) {
            effects.forEach((effect, effectIndex) => {
                displayEffectDetails(effect, effectIndex);
            });
        } else {
            console.log('      No effects found');
        }
        
        console.log('\n   ' + '='.repeat(80));
    }
}

// MODIFIED FUNCTION: Filter transactions before displaying
async function filterAndDisplayTransactions(transactions, title = 'Filtered Transactions') {
    console.log(`\n=== FILTERING TRANSACTIONS ===`);
    console.log(`Checking ${transactions.length} transactions for Effect 1 type = 'account_debited' AND within 5 minutes...`);
    
    const filteredTransactions = [];
    
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        console.log(`\nChecking transaction ${i + 1}: ${tx.hash}`);
        
        if (await shouldIncludeTransaction(tx.hash, tx.created_at)) {
            filteredTransactions.push(tx);
        }
    }
    
    console.log(`\nFiltering complete: ${filteredTransactions.length} out of ${transactions.length} transactions match criteria`);
    
    if (filteredTransactions.length > 0) {
        await displayTransactionsWithDetails(filteredTransactions, title);
    } else {
        console.log(`\n=== ${title} ===`);
        console.log('No transactions found with Effect 1 type = "account_debited" AND within 5 minutes');
    }
    
    return filteredTransactions;
}

function getTransactionTypeName(typeId) {
    const types = {
        0: 'CREATE_ACCOUNT',
        1: 'PAYMENT',
        2: 'PATH_PAYMENT_STRICT_RECEIVE',
        3: 'MANAGE_SELL_OFFER',
        4: 'CREATE_PASSIVE_SELL_OFFER',
        5: 'SET_OPTIONS',
        6: 'CHANGE_TRUST',
        7: 'ALLOW_TRUST',
        8: 'ACCOUNT_MERGE',
        9: 'INFLATION',
        10: 'MANAGE_DATA',
        11: 'BUMP_SEQUENCE',
        12: 'MANAGE_BUY_OFFER',
        13: 'PATH_PAYMENT_STRICT_SEND',
        14: 'CREATE_CLAIMABLE_BALANCE',
        15: 'CLAIM_CLAIMABLE_BALANCE',
        16: 'BEGIN_SPONSORING_FUTURE_RESERVES',
        17: 'END_SPONSORING_FUTURE_RESERVES',
        18: 'REVOKE_SPONSORSHIP',
        19: 'CLAWBACK',
        20: 'CLAWBACK_CLAIMABLE_BALANCE',
        21: 'SET_TRUST_LINE_FLAGS',
        22: 'LIQUIDITY_POOL_DEPOSIT',
        23: 'LIQUIDITY_POOL_WITHDRAW',
        24: 'INVOKE_HOST_FUNCTION',
        25: 'EXTEND_FOOTPRINT_TTL',
        26: 'RESTORE_FOOTPRINT'
    };
    return types[typeId] || 'UNKNOWN';
}

async function main() {
    console.log('\n=== STELLAR TRANSACTION CHECKER WITH EFFECT 1 AND TIME FILTER ===');
    console.log('Filter: Only show transactions where Effect 1 type = "account_debited" AND within 5 minutes of current time');
    
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
        console.log('Cannot proceed without connection to Horizon');
        console.log('FALSE');
        return false;
    }
    
    // Check if addresses exist
    const filterAddressExists = await checkAddress(filterByAddress, 'Filter Address');
    const contractAddressExists = await checkAddress(contractAddress, 'Contract Address');
    
    if (!filterAddressExists && !contractAddressExists) {
        console.log('\nBoth addresses not found. Please verify the addresses are correct.');
        console.log('FALSE');
        return false;
    }
    
    let foundMatchingTransactions = false;
    
    // Get transactions and filter them
    if (filterAddressExists) {
        const allTxs = await getTransactions(filterByAddress, 10);
        
        if (allTxs.length > 0) {
            const filteredTxs = await filterAndDisplayTransactions(
                allTxs, 
                `Transactions with Effect 1 = "account_debited" from ${filterByAddress}`
            );
            
            // Additional analysis for filtered transactions
            if (filteredTxs.length > 0) {
                foundMatchingTransactions = true;
                console.log(`\n=== SUMMARY ===`);
                console.log(`Found ${filteredTxs.length} transactions where Effect 1 is "account_debited" AND within 5 minutes`);
                console.log('Transaction hashes:');
                filteredTxs.forEach((tx, index) => {
                    console.log(`  ${index + 1}. ${tx.hash}`);
                });
            }
        }
    }
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    
    if (!foundMatchingTransactions) {
        console.log('FALSE');
        return false;
    } else {
        console.log('TRUE');
        return true;
    }
}

// Run the main function
console.log('Starting main function...');
main().then(() => {
    console.log('Script completed successfully');
}).catch(error => {
    console.error('Script failed:', error);
});

console.log('Script setup complete, waiting for async operations...');