// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";
import "../contracts/LimitOrderProtocol.sol";
import "../contracts/Resolver.sol";

contract DeploySimpleScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get WETH address for Sepolia
        address wethAddress = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
        
        console.log("Deploying on Sepolia");
        console.log("Deployer:", deployerAddress);
        console.log("WETH:", wethAddress);
        
        // Deploy just EscrowFactory first
        HashLockedEscrowFactory factory = new HashLockedEscrowFactory(wethAddress);
        console.log("Factory:", address(factory));
        
        vm.stopBroadcast();
    }
}