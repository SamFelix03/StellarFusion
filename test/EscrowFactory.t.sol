 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../contracts/EscrowFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EscrowFactoryTest is Test {
    HashLockedEscrowFactory public factory;
    address public weth = address(0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9); // Sepolia WETH
    address public buyer = address(0x123);
    address public resolver = address(0x456);
    
    function setUp() public {
        factory = new HashLockedEscrowFactory(weth);
    }
    
    function testCreateSrcEscrow() public {
        bytes32 hashedSecret = keccak256(abi.encodePacked("secret"));
        uint256 amount = 1 ether;
        uint256 withdrawalStart = block.timestamp + 600;
        uint256 publicWithdrawalStart = block.timestamp + 3600;
        uint256 cancellationStart = block.timestamp + 7200;
        uint256 publicCancellationStart = block.timestamp + 10800;
        
        vm.startPrank(buyer);
        vm.deal(buyer, 2 ether);
        
        // Mock WETH approval
        vm.mockCall(
            weth,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        
        factory.createSrcEscrow{value: 0.001 ether}(
            hashedSecret,
            resolver,
            buyer,  // Add buyer parameter
            amount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart,
            publicCancellationStart
        );
        
        vm.stopPrank();
        
        // Verify escrow was created
        address[] memory escrows = factory.getUserEscrows(buyer);
        assertEq(escrows.length, 1);
        assertTrue(factory.isEscrowContract(escrows[0]));
    }
    
    function testCreateDstEscrow() public {
        bytes32 hashedSecret = keccak256(abi.encodePacked("secret"));
        uint256 amount = 1 ether;
        uint256 withdrawalStart = block.timestamp + 600;
        uint256 publicWithdrawalStart = block.timestamp + 3600;
        uint256 cancellationStart = block.timestamp + 7200;
        
        vm.startPrank(resolver);
        vm.deal(resolver, 2 ether);
        
        // Mock WETH approval
        vm.mockCall(
            weth,
            abi.encodeWithSelector(IERC20.transferFrom.selector),
            abi.encode(true)
        );
        
        factory.createDstEscrow{value: 0.001 ether}(
            hashedSecret,
            buyer,
            amount,
            withdrawalStart,
            publicWithdrawalStart,
            cancellationStart
        );
        
        vm.stopPrank();
        
        // Verify escrow was created
        address[] memory escrows = factory.getUserEscrows(resolver);
        assertEq(escrows.length, 1);
        assertTrue(factory.isEscrowContract(escrows[0]));
    }
}