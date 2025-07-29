// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";

contract DeployLocalScript is Script {
    function run() external {
        // Use anvil's default funded account
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy WETH mock for Sepolia fork (port 8545)
        address wethAddress = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
        HashLockedEscrowFactory sepoliaFactory = new HashLockedEscrowFactory(wethAddress);
        
        console.log("Local Sepolia Factory deployed at:", address(sepoliaFactory));
        console.log("WETH address:", wethAddress);
        
        vm.stopBroadcast();
    }
}