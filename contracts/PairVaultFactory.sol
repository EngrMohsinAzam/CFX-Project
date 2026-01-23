// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PairVaultFactory
 * @notice Simplified factory for XRPL EVM - Gas optimized
 */

interface IPETToken {
    function initialize(
        string memory _name, 
        string memory _symbol,
        address _vault,
        string memory _logoURI
    ) external;
}

interface IUniversalPairVault {
    function initialize(
        address _cfxToken,
        address _petToken,
        address _token0,
        address _token1,
        address _oracle,
        address _owner
    ) external;
}

interface IOracle {
    function hasPrice(address token) external view returns (bool);
}

contract PairVaultFactory {
    address public immutable cfxToken;
    address public immutable oracle;
    address public immutable owner;
    address public immutable petTokenImplementation;
    address public immutable vaultImplementation;
    
    string public defaultPETLogoURI;
    
    mapping(address => mapping(address => address)) public getVault;
    address[] public allVaults;
    
    event VaultCreated(
        address indexed token0,
        address indexed token1,
        address vault,
        address petToken,
        uint256 vaultId
    );
    
    // ⭐ SIMPLIFIED: Minimal constructor
    constructor(
        address _cfxToken, 
        address _oracle,
        address _petTokenImpl,
        address _vaultImpl
    ) {
        require(_cfxToken != address(0), "Zero CFX");
        require(_oracle != address(0), "Zero oracle");
        require(_petTokenImpl != address(0), "Zero PET");
        require(_vaultImpl != address(0), "Zero vault");
        
        cfxToken = _cfxToken;
        oracle = _oracle;
        petTokenImplementation = _petTokenImpl;
        vaultImplementation = _vaultImpl;
        owner = 0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329;
        defaultPETLogoURI = ""; // Set later
    }
    
    // ⭐ Set logo after deployment
    function setDefaultPETLogoURI(string memory _logoURI) external {
        require(msg.sender == owner, "Not owner");
        defaultPETLogoURI = _logoURI;
    }
    
    function createVault(address tokenA, address tokenB) 
        external 
        returns (address vault) 
    {
        require(tokenA != tokenB, "Same token");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");
        
        (address token0, address token1) = tokenA < tokenB 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);
        
        require(getVault[token0][token1] == address(0), "Vault exists");
        require(IOracle(oracle).hasPrice(token0), "No price token0");
        require(IOracle(oracle).hasPrice(token1), "No price token1");
        
        // Clone contracts
        address petToken = _clone(petTokenImplementation);
        vault = _clone(vaultImplementation);
        
        // Initialize PET Token (simplified name)
        IPETToken(petToken).initialize(
            "PET Token",
            "PET",
            vault,
            defaultPETLogoURI
        );
        
        // Initialize Vault
        IUniversalPairVault(vault).initialize(
            cfxToken,
            petToken,
            token0,
            token1,
            oracle,
            owner
        );
        
        // Store vault
        getVault[token0][token1] = vault;
        getVault[token1][token0] = vault;
        allVaults.push(vault);
        
        emit VaultCreated(token0, token1, vault, petToken, allVaults.length - 1);
    }
    
    // ⭐ Minimal clone function
    function _clone(address implementation) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "Clone failed");
    }
    
    // ⭐ Essential view functions only
    function getVaultForPair(address tokenA, address tokenB) 
        external 
        view 
        returns (address) 
    {
        (address token0, address token1) = tokenA < tokenB 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);
        return getVault[token0][token1];
    }
    
    function allVaultsLength() external view returns (uint256) {
        return allVaults.length;
    }
}