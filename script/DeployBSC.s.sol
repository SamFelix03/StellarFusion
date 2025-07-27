// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";

contract DeployBSCScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy on BSC Testnet
        address bscWBNB = vm.envAddress("BSC_TESTNET_WBNB");
        HashLockedEscrowFactory bscFactory = new HashLockedEscrowFactory(bscWBNB);
        
        console.log("BSC Testnet Factory deployed at:", address(bscFactory));
        console.log("BSC Testnet WBNB address:", bscWBNB);
        
        vm.stopBroadcast();
    }
} 