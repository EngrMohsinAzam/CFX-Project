// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UniversalPairVault
 * @notice Vault implementation for minimal proxy cloning
 * @dev DEPLOY THIS THIRD - This is the implementation contract
 */

interface IPETToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract UniversalPairVault {
    address public cfxToken;
    address public petToken;
    address public token0;
    address public token1;
    address public oracle;
    address public owner;
    
    uint16 public mintFee;
    uint16 public burnFee;
    bool public paused;
    bool private initialized;
    
    uint256 private constant BASIS = 10000;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant MAX_FEE = 1000;
    
    event Deposited(address indexed user, uint256 cfxAmount, uint256 petMinted);
    event Redeemed(address indexed user, uint256 petBurned, uint256 cfxReturned);
    event FeesUpdated(uint16 mintFee, uint16 burnFee);
    event PausedToggled(bool paused);
    
    error AlreadyInitialized();
    error Unauthorized();
    error ZeroAmount();
    error Paused();
    error SlippageExceeded();
    error FeeTooHigh();
    
    function initialize(
        address _cfxToken,
        address _petToken,
        address _token0,
        address _token1,
        address _oracle,
        address _owner
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        
        cfxToken = _cfxToken;
        petToken = _petToken;
        token0 = _token0;
        token1 = _token1;
        oracle = _oracle;
        owner = _owner;
        mintFee = 10;
        burnFee = 10;
    }
    
    function deposit(uint256 cfxAmount, uint256 minPETOut) external returns (uint256 petAmount) {
        if (paused) revert Paused();
        if (cfxAmount == 0) revert ZeroAmount();
        
        uint256 cfxPrice = IOracle(oracle).getPrice(cfxToken);
        uint256 usdValue = (cfxAmount * cfxPrice) / PRECISION;
        
        uint256 nav = _calculateNAV();
        uint256 totalSupply = IPETToken(petToken).totalSupply();
        
        if (totalSupply == 0) {
            petAmount = usdValue;
        } else {
            petAmount = (usdValue * PRECISION) / nav;
        }
        
        uint256 fee = (petAmount * mintFee) / BASIS;
        unchecked {
            petAmount -= fee;
        }
        
        if (petAmount < minPETOut) revert SlippageExceeded();
        
        IERC20(cfxToken).transferFrom(msg.sender, address(this), cfxAmount);
        IPETToken(petToken).mint(msg.sender, petAmount);
        
        if (fee > 0) {
            IPETToken(petToken).mint(owner, fee);
        }
        
        emit Deposited(msg.sender, cfxAmount, petAmount);
    }
    
    function redeem(uint256 petAmount, uint256 minCFXOut) external returns (uint256 cfxAmount) {
        if (petAmount == 0) revert ZeroAmount();
        
        uint256 nav = _calculateNAV();
        uint256 usdValue = (petAmount * nav) / PRECISION;
        
        uint256 cfxPrice = IOracle(oracle).getPrice(cfxToken);
        cfxAmount = (usdValue * PRECISION) / cfxPrice;
        
        uint256 fee = (cfxAmount * burnFee) / BASIS;
        unchecked {
            cfxAmount -= fee;
        }
        
        if (cfxAmount < minCFXOut) revert SlippageExceeded();
        
        IPETToken(petToken).burn(msg.sender, petAmount);
        IERC20(cfxToken).transfer(msg.sender, cfxAmount);
        
        if (fee > 0) {
            IERC20(cfxToken).transfer(owner, fee);
        }
        
        emit Redeemed(msg.sender, petAmount, cfxAmount);
    }
    
    function _calculateNAV() internal view returns (uint256) {
        uint256 price0 = IOracle(oracle).getPrice(token0);
        uint256 price1 = IOracle(oracle).getPrice(token1);
        unchecked {
            return (price0 + price1) >> 1;
        }
    }
    
    function getCurrentNAV() external view returns (uint256) {
        return _calculateNAV();
    }
    
    function calculateDepositOutput(uint256 cfxAmount) external view returns (uint256) {
        uint256 cfxPrice = IOracle(oracle).getPrice(cfxToken);
        uint256 usdValue = (cfxAmount * cfxPrice) / PRECISION;
        
        uint256 totalSupply = IPETToken(petToken).totalSupply();
        uint256 petAmount;
        
        if (totalSupply == 0) {
            petAmount = usdValue;
        } else {
            uint256 nav = _calculateNAV();
            petAmount = (usdValue * PRECISION) / nav;
        }
        
        uint256 fee = (petAmount * mintFee) / BASIS;
        unchecked {
            return petAmount - fee;
        }
    }
    
    function calculateRedeemOutput(uint256 petAmount) external view returns (uint256) {
        uint256 nav = _calculateNAV();
        uint256 usdValue = (petAmount * nav) / PRECISION;
        
        uint256 cfxPrice = IOracle(oracle).getPrice(cfxToken);
        uint256 cfxAmount = (usdValue * PRECISION) / cfxPrice;
        
        uint256 fee = (cfxAmount * burnFee) / BASIS;
        unchecked {
            return cfxAmount - fee;
        }
    }
    
    function getUserPosition(address user) external view returns (uint256 petBalance, uint256 cfxValue) {
        petBalance = IPETToken(petToken).balanceOf(user);
        if (petBalance > 0) {
            uint256 nav = _calculateNAV();
            uint256 usdValue = (petBalance * nav) / PRECISION;
            uint256 cfxPrice = IOracle(oracle).getPrice(cfxToken);
            cfxValue = (usdValue * PRECISION) / cfxPrice;
        }
    }
    
    function setPaused(bool _paused) external {
        if (msg.sender != owner) revert Unauthorized();
        paused = _paused;
        emit PausedToggled(_paused);
    }
    
    function setFees(uint16 _mintFee, uint16 _burnFee) external {
        if (msg.sender != owner) revert Unauthorized();
        if (_mintFee > MAX_FEE || _burnFee > MAX_FEE) revert FeeTooHigh();
        mintFee = _mintFee;
        burnFee = _burnFee;
        emit FeesUpdated(_mintFee, _burnFee);
    }
}