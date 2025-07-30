const { ethers } = require('ethers');

// Configuration
const FACTORY_ADDRESS = '0x3bb36CBAF1706a4101Ac1b0493e63386B54f5C12';
const PRIVATE_KEY = '7a425200e31e8409c27abbc9aaae49a94c314426ef2e569d3a33ffc289a34e76';
const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF'; // Public Sepolia RPC
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
const AMOUNT = ethers.utils.parseEther('0.0001'); // 0.0001 ETH

// Minimal ABIs
const WETH_ABI = [
    'function deposit() payable',
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
];

const FACTORY_ABI = [
    'function createEscrow(address beneficiary, address arbiter, address token, uint256 amount) returns (uint256 escrowId, address escrowAddress)'
];

async function main() {
    console.log('Creating escrow with 0.0001 SepoliaETH...\n');

    // Setup
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

    console.log(`Wallet: ${wallet.address}`);
    
    // Check balance first
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH`);
    
    // Check current gas price
    const gasPrice = await provider.getGasPrice();
    console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);

    // Step 1: Wrap ETH to WETH with minimal gas
    console.log('\n1. Wrapping ETH to WETH...');
    const wrapTx = await weth.deposit({ 
        value: AMOUNT,
        gasLimit: 30000,  // Much lower
        gasPrice: ethers.utils.parseUnits('10', 'gwei')  // Lower gas price
    });
    await wrapTx.wait();
    console.log(`✅ Wrapped 0.0001 ETH to WETH`);

    // Step 2: Approve factory to spend WETH
    console.log('\n2. Approving WETH...');
    const approveTx = await weth.approve(FACTORY_ADDRESS, AMOUNT, {
        gasLimit: 50000,
        gasPrice: ethers.utils.parseUnits('10', 'gwei')
    });
    await approveTx.wait();
    console.log(`✅ Approved WETH spending`);

    // Step 3: Create escrow with lower gas
    console.log('\n3. Creating escrow...');
    const beneficiary = '0x742D35CC6635C0532925A3B8D8C8C8B67F4D9982';
    const arbiter = wallet.address;
    
    const createTx = await factory.createEscrow(beneficiary, arbiter, WETH_ADDRESS, AMOUNT, {
        gasLimit: 300000,  // Lower limit
        gasPrice: ethers.utils.parseUnits('10', 'gwei')  // 10 gwei instead of auto
    });
    const receipt = await createTx.wait();
    
    // Get escrow address from transaction logs
    const escrowAddress = receipt.logs[receipt.logs.length - 1].address;
    console.log(`✅ Escrow created at: ${escrowAddress}`);

    // Step 4: Check balance in escrow
    console.log('\n4. Checking escrow balance...');
    const escrowBalance = await weth.balanceOf(escrowAddress);
    console.log(`💰 Balance in escrow: ${ethers.utils.formatEther(escrowBalance)} WETH`);

    console.log('\n✅ Done!');
    console.log(`\nEscrow Address: ${escrowAddress}`);
    console.log(`Amount Held: ${ethers.utils.formatEther(escrowBalance)} WETH (equivalent to SepoliaETH)`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });