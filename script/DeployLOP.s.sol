// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../contracts/LimitOrderProtocol.sol";

contract DeployLOPScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Use deployed factory address
        address factoryAddress = 0x4F25B17649F0A056138E251487c27A22D793DBA7;
        
        console.log("Deploying LimitOrderProtocol on Sepolia");
        console.log("Deployer:", deployerAddress);
        console.log("Factory:", factoryAddress);
        
        SimpleLimitOrderProtocol lop = new SimpleLimitOrderProtocol(factoryAddress, deployerAddress);
        console.log("LimitOrderProtocol:", address(lop));
        
        vm.stopBroadcast();
    }
}