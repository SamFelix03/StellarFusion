// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/Resolver.sol";

contract DeployResolverScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Use deployed addresses
        address factoryAddress = 0x4F25B17649F0A056138E251487c27A22D793DBA7;
        address lopAddress = 0x13F4118A0C9AA013eeB078f03318aeea84469cDD;
        
        console.log("Deploying Resolver on Sepolia");
        console.log("Deployer:", deployerAddress);
        console.log("Factory:", factoryAddress);
        console.log("LOP:", lopAddress);
        
        SimpleResolver resolver = new SimpleResolver(lopAddress, factoryAddress, deployerAddress);
        console.log("Resolver:", address(resolver));
        
        // Final summary
        console.log("\n=== SEPOLIA DEPLOYMENT COMPLETE ===");
        console.log("EscrowFactory:", factoryAddress);
        console.log("LimitOrderProtocol:", lopAddress);
        console.log("Resolver:", address(resolver));
        console.log("Owner:", deployerAddress);
        
        vm.stopBroadcast();
    }
}