// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PETToken
 * @notice ERC20 implementation for minimal proxy cloning
 * @dev DEPLOY THIS SECOND - This is the implementation contract
 */

contract PETToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    string public logoURI;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    address public vault;
    bool private initialized;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    error AlreadyInitialized();
    error Unauthorized();
    
    function initialize(
        string memory _name, 
        string memory _symbol,
        address _vault,
        string memory _logoURI
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        
        name = _name;
        symbol = _symbol;
        vault = _vault;
        logoURI = _logoURI;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert Unauthorized();
        unchecked {
            totalSupply += amount;
            balanceOf[to] += amount;
        }
        emit Transfer(address(0), to, amount);
    }
    
    function burn(address from, uint256 amount) external {
        if (msg.sender != vault) revert Unauthorized();
        balanceOf[from] -= amount;
        unchecked {
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }
}