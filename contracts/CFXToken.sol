// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CFXToken
 * @dev Mintable token - deploy lightweight, mint in batches
 */
contract CFXToken is ERC20, Ownable {
    
    uint256 public constant MAX_SUPPLY = 10_000_000_000 * 10**18; // 10B cap
    
    event TokensBurned(address indexed from, uint256 amount);
    event TokensMinted(address indexed to, uint256 amount);
    
    constructor() ERC20("CFX Token", "CFX") Ownable(0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329) {
        // Deploy empty - mint later in batches
    }
    
    /**
     * @dev Owner can mint tokens up to MAX_SUPPLY
     * Mint in batches like 1B at a time to avoid gas issues
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }
    
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    function cap() external pure returns (uint256) {
        return MAX_SUPPLY;
    }
}