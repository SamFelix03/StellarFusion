// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/EscrowFactory.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy on Sepolia
        address sepoliaWETH = vm.envAddress("SEPOLIA_WETH");
        HashLockedEscrowFactory sepoliaFactory = new HashLockedEscrowFactory(sepoliaWETH);
        
        console.log("Sepolia Factory deployed at:", address(sepoliaFactory));
        console.log("Sepolia WETH address:", sepoliaWETH);
        
        vm.stopBroadcast();
    }
} 