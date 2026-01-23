// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CFXSwap
 * @dev Buy CFX with native XRP (XRPL EVM main currency)
 * Fixed Rate: 1 XRP = 1 CFX
 */
contract CFXSwap is Ownable, ReentrancyGuard {
    
    IERC20 public immutable cfxToken;
    
    uint256 public xrpPerCFX = 1 ether; // Fixed: 1 XRP = 1 CFX
    uint256 public minSwapAmount = 0.01 ether; // Minimum: 0.01 XRP
    
    event TokensPurchased(address indexed buyer, uint256 xrpAmount, uint256 cfxAmount);
    event PriceUpdated(uint256 newPrice);
    
    constructor(address _cfxToken) Ownable(0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329) {
        require(_cfxToken != address(0), "Invalid address");
        cfxToken = IERC20(_cfxToken);
    }
    
    /**
     * @dev Buy CFX with native XRP
     * Send XRP → Get equal amount of CFX (1:1 ratio)
     */
    function buyCFX() external payable nonReentrant {
        require(msg.value >= minSwapAmount, "Below minimum");
        
        // 1 XRP = 1 CFX (both 18 decimals)
        uint256 cfxAmount = (msg.value * 1e18) / xrpPerCFX;
        require(cfxToken.balanceOf(address(this)) >= cfxAmount, "Insufficient CFX");
        
        cfxToken.transfer(msg.sender, cfxAmount);
        emit TokensPurchased(msg.sender, msg.value, cfxAmount);
    }
    
    /**
     * @dev Calculate CFX output for given XRP amount
     */
    function calculateCFXOutput(uint256 xrpAmount) external view returns (uint256) {
        return (xrpAmount * 1e18) / xrpPerCFX;
    }
    
    /**
     * @dev Owner: Update exchange rate if needed
     */
    function setXRPPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Invalid price");
        xrpPerCFX = newPrice;
        emit PriceUpdated(newPrice);
    }
    
    /**
     * @dev Owner: Update minimum swap amount
     */
    function setMinSwapAmount(uint256 newMin) external onlyOwner {
        minSwapAmount = newMin;
    }
    
    /**
     * @dev Owner: Withdraw collected XRP
     */
    function withdrawXRP() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    /**
     * @dev Owner: Withdraw unsold CFX
     */
    function withdrawCFX(uint256 amount) external onlyOwner {
        cfxToken.transfer(owner(), amount);
    }
    
    /**
     * @dev View contract balances
     */
    function getBalances() external view returns (uint256 cfx, uint256 xrp) {
        cfx = cfxToken.balanceOf(address(this));
        xrp = address(this).balance;
    }
    
    /**
     * @dev Receive function - auto buy when XRP sent directly
     */
    receive() external payable {
        require(msg.value >= minSwapAmount, "Below minimum");
        
        uint256 cfxAmount = (msg.value * 1e18) / xrpPerCFX;
        require(cfxToken.balanceOf(address(this)) >= cfxAmount, "Insufficient CFX");
        
        cfxToken.transfer(msg.sender, cfxAmount);
        emit TokensPurchased(msg.sender, msg.value, cfxAmount);
    }
}