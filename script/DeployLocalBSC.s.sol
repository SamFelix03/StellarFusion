// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";

contract DeployLocalBSCScript is Script {
    function run() external {
        // Use anvil's default funded account
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy WBNB mock for BSC fork (port 8546)
        address wbnbAddress = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;
        HashLockedEscrowFactory bscFactory = new HashLockedEscrowFactory(wbnbAddress);
        
        console.log("Local BSC Factory deployed at:", address(bscFactory));
        console.log("WBNB address:", wbnbAddress);
        
        vm.stopBroadcast();
    }
}