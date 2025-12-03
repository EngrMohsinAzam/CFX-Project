// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CFXSwap
 * @dev Bidirectional swap: USDT ⇄ CFX
 * Gas optimized, secure, simple
 */
contract CFXSwap is Ownable, ReentrancyGuard {
    
    IERC20 public immutable cfxToken;
    IERC20 public immutable usdtToken;
    
    uint256 public exchangeRate = 1e18; // 1 USDT = 1 CFX
    uint256 public minSwapAmount = 1e6; // 1 USDT minimum
    
    event Swapped(address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut);
    event RateUpdated(uint256 newRate);
    
    constructor(address _cfxToken, address _usdtToken) Ownable(0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329) {
        require(_cfxToken != address(0) && _usdtToken != address(0), "Invalid address");
        cfxToken = IERC20(_cfxToken);
        usdtToken = IERC20(_usdtToken);
    }
    
    /**
     * @dev Buy CFX with USDT
     * @param usdtAmount USDT amount (6 decimals)
     */
    function buyCFX(uint256 usdtAmount) external nonReentrant {
        require(usdtAmount >= minSwapAmount, "Below minimum");
        
        uint256 cfxAmount = (usdtAmount * 1e12 * exchangeRate) / 1e18;
        require(cfxAmount > 0, "Amount too small");
        require(cfxToken.balanceOf(address(this)) >= cfxAmount, "Insufficient CFX");
        
        usdtToken.transferFrom(msg.sender, address(this), usdtAmount);
        cfxToken.transfer(msg.sender, cfxAmount);
        
        emit Swapped(msg.sender, true, usdtAmount, cfxAmount);
    }
    
    /**
     * @dev Sell CFX for USDT
     * @param cfxAmount CFX amount (18 decimals)
     */
    function sellCFX(uint256 cfxAmount) external nonReentrant {
        require(cfxAmount > 0, "Zero amount");
        
        uint256 usdtAmount = (cfxAmount * exchangeRate) / 1e30; // 1e18 * 1e12
        require(usdtAmount >= minSwapAmount, "Below minimum");
        require(usdtToken.balanceOf(address(this)) >= usdtAmount, "Insufficient USDT");
        
        cfxToken.transferFrom(msg.sender, address(this), cfxAmount);
        usdtToken.transfer(msg.sender, usdtAmount);
        
        emit Swapped(msg.sender, false, cfxAmount, usdtAmount);
    }
    
    /**
     * @dev Calculate outputs (view functions)
     */
    function getBuyOutput(uint256 usdtAmount) external view returns (uint256) {
        return (usdtAmount * 1e12 * exchangeRate) / 1e18;
    }
    
    function getSellOutput(uint256 cfxAmount) external view returns (uint256) {
        return (cfxAmount * exchangeRate) / 1e30;
    }
    
    /**
     * @dev Owner functions
     */
    function setExchangeRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Invalid rate");
        exchangeRate = newRate;
        emit RateUpdated(newRate);
    }
    
    function setMinSwapAmount(uint256 newMin) external onlyOwner {
        minSwapAmount = newMin;
    }
    
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
    
    function getBalances() external view returns (uint256 cfx, uint256 usdt) {
        cfx = cfxToken.balanceOf(address(this));
        usdt = usdtToken.balanceOf(address(this));
    }
} 
