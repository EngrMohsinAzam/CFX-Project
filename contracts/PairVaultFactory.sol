// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PairVaultFactory
 * @notice Minimal proxy factory using EIP-1167
 * @dev DEPLOY THIS LAST - Needs oracle and implementation addresses
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

interface IERC20Symbol {
    function symbol() external view returns (string memory);
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
    
    mapping(address => VaultInfo) public vaultInfo;
    
    struct VaultInfo {
        address petToken;
        address token0;
        address token1;
        uint256 createdAt;
        address creator;
    }
    
    event VaultCreated(
        address indexed token0,
        address indexed token1,
        address vault,
        address petToken,
        uint256 vaultId
    );
    
    event DefaultLogoUpdated(string logoURI);
    
    error ZeroAddress();
    error SameToken();
    error VaultExists();
    error NoPriceSource();
    error Unauthorized();
    
    constructor(
        address _cfxToken, 
        address _oracle,
        address _petTokenImpl,
        address _vaultImpl,
        string memory _defaultPETLogoURI
    ) {
        if (_cfxToken == address(0) || _oracle == address(0)) revert ZeroAddress();
        if (_petTokenImpl == address(0) || _vaultImpl == address(0)) revert ZeroAddress();
        
        cfxToken = _cfxToken;
        oracle = _oracle;
        petTokenImplementation = _petTokenImpl;
        vaultImplementation = _vaultImpl;
        owner = 0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329;
        defaultPETLogoURI = _defaultPETLogoURI;
    }
    
    function createVault(address tokenA, address tokenB) 
        external 
        returns (address vault) 
    {
        if (tokenA == tokenB) revert SameToken();
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        
        (address token0, address token1) = tokenA < tokenB 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);
        
        if (getVault[token0][token1] != address(0)) revert VaultExists();
        
        if (!IOracle(oracle).hasPrice(token0)) revert NoPriceSource();
        if (!IOracle(oracle).hasPrice(token1)) revert NoPriceSource();
        
        address petToken = _clone(petTokenImplementation);
        vault = _clone(vaultImplementation);
        
        string memory petName = string(abi.encodePacked("PET-", _getSymbol(token0), "/", _getSymbol(token1)));
        string memory petSymbol = string(abi.encodePacked("PET-", _getSymbol(token0), _getSymbol(token1)));
        
        IPETToken(petToken).initialize(
            petName,
            petSymbol,
            vault,
            defaultPETLogoURI
        );
        
        IUniversalPairVault(vault).initialize(
            cfxToken,
            petToken,
            token0,
            token1,
            oracle,
            owner
        );
        
        getVault[token0][token1] = vault;
        getVault[token1][token0] = vault;
        allVaults.push(vault);
        
        vaultInfo[vault] = VaultInfo({
            petToken: petToken,
            token0: token0,
            token1: token1,
            createdAt: block.timestamp,
            creator: msg.sender
        });
        
        emit VaultCreated(token0, token1, vault, petToken, allVaults.length - 1);
    }
    
    function _clone(address implementation) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        if (instance == address(0)) revert ZeroAddress();
    }
    
    function setDefaultPETLogoURI(string memory _logoURI) external {
        if (msg.sender != owner) revert Unauthorized();
        defaultPETLogoURI = _logoURI;
        emit DefaultLogoUpdated(_logoURI);
    }
    
    function _getSymbol(address token) internal view returns (string memory) {
        try IERC20Symbol(token).symbol() returns (string memory symbol) {
            return symbol;
        } catch {
            return _addressToString(token);
        }
    }
    
    function _addressToString(address addr) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint256 i = 0; i < 20;) {
            bytes1 b = bytes1(uint8(uint256(uint160(addr)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = _char(hi);
            s[2*i+1] = _char(lo);
            unchecked { ++i; }
        }
        return string(abi.encodePacked("0x", string(s)));
    }
    
    function _char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
    
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
    
    function vaultExists(address tokenA, address tokenB) 
        external 
        view 
        returns (bool) 
    {
        (address token0, address token1) = tokenA < tokenB 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);
        return getVault[token0][token1] != address(0);
    }
    
    function allVaultsLength() external view returns (uint256) {
        return allVaults.length;
    }
    
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }
    
    function getVaultDetails(address vault) 
        external 
        view 
        returns (
            address petToken,
            address token0,
            address token1,
            uint256 createdAt,
            address creator
        ) 
    {
        VaultInfo memory info = vaultInfo[vault];
        return (info.petToken, info.token0, info.token1, info.createdAt, info.creator);
    }
}