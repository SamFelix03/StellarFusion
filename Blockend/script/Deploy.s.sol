// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";
import "../contracts/LimitOrderProtocol.sol";
import "../contracts/Resolver.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get the appropriate WETH address based on chain
        address wethAddress;
        uint256 chainId = block.chainid;
        
        if (chainId == 11155111) { // Sepolia
            wethAddress = vm.envAddress("SEPOLIA_WETH");
            console.log("Deploying on Sepolia Testnet");
        } else if (chainId == 97) { // BSC Testnet
            wethAddress = vm.envAddress("BSC_TESTNET_WBNB");
            console.log("Deploying on BSC Testnet");
        } else {
            revert("Unsupported chain");
        }
        
        console.log("Chain ID:", chainId);
        console.log("Deployer:", deployerAddress);
        console.log("WETH/WBNB address:", wethAddress);
        
        // 1. Deploy EscrowFactory
        console.log("\n=== Deploying EscrowFactory ===");
        HashLockedEscrowFactory factory = new HashLockedEscrowFactory(wethAddress);
        console.log("EscrowFactory deployed at:", address(factory));
        
        // 2. Deploy LimitOrderProtocol
        console.log("\n=== Deploying LimitOrderProtocol ===");
        SimpleLimitOrderProtocol lop = new SimpleLimitOrderProtocol(address(factory), deployerAddress);
        console.log("LimitOrderProtocol deployed at:", address(lop));
        
        // 3. Deploy Resolver
        console.log("\n=== Deploying Resolver ===");
        SimpleResolver resolver = new SimpleResolver(address(lop), address(factory), deployerAddress);
        console.log("Resolver deployed at:", address(resolver));
        
        // Verify deployments
        console.log("\n=== Verification ===");
        console.log("LOP Factory:", address(lop.escrowFactory()));
        console.log("LOP Owner:", address(lop.owner()));
        console.log("Resolver LOP:", address(resolver.lop()));
        console.log("Resolver Factory:", address(resolver.escrowFactory()));
        console.log("Resolver Owner:", address(resolver.owner()));
        
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain ID:", chainId);
        console.log("EscrowFactory:", address(factory));
        console.log("LimitOrderProtocol:", address(lop));
        console.log("Resolver:", address(resolver));
        console.log("WETH/WBNB:", wethAddress);
        console.log("Owner:", deployerAddress);
        
        vm.stopBroadcast();
    }
} 