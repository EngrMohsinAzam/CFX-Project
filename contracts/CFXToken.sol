// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CFXToken
 * @dev Base currency token for CFX Pair Investment Platform
 * Simple fixed supply token with IPFS logo support - optimized for gas efficiency
 */
contract CFXToken is ERC20, Ownable {
    
    // Total supply: 20 billion CFX tokens
    uint256 private constant INITIAL_SUPPLY = 20_000_000_000 * 10**18;
    
    // ⭐ NEW: Logo URI for MetaMask/wallets
    string public logoURI;
    
    // Events
    event TokensBurned(address indexed from, uint256 amount);
    event LogoURIUpdated(string newLogoURI);
    
    /**
     * @dev Constructor
     * Mints initial supply to specified owner address
     * Owner will transfer tokens to CFXSwap contract
     * @param _logoURI IPFS hash for token logo (e.g., "ipfs://QmXxxx...")
     */
    constructor(string memory _logoURI) ERC20("CFX Token", "CFX") Ownable(0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329) {
        _mint(0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329, INITIAL_SUPPLY);
        logoURI = _logoURI;  // ← Store logo from Pinata
    }
    
    /**
     * @dev Burns tokens from caller's balance
     * Users can burn their own tokens if needed
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Returns the total supply cap
     * @return uint256 Maximum token supply
     */
    function cap() external pure returns (uint256) {
        return INITIAL_SUPPLY;
    }
    
    /**
     * @dev Update logo URI (only owner)
     * Useful if you need to change logo or move to different IPFS gateway
     * @param _logoURI New IPFS hash
     */
    function setLogoURI(string memory _logoURI) external onlyOwner {
        logoURI = _logoURI;
        emit LogoURIUpdated(_logoURI);
    }
}
