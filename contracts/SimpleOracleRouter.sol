// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimpleOracleRouter
 * @notice Chainlink + DEX fallback oracle
 * @dev DEPLOY THIS FIRST - No dependencies
 */

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

interface IUniswapV2Pair {
    function getReserves() external view returns (
        uint112 reserve0,
        uint112 reserve1,
        uint32 blockTimestampLast
    );
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract SimpleOracleRouter {
    address public immutable owner;
    
    mapping(address => address) public chainlinkFeeds;
    mapping(address => address) public dexPairs;
    mapping(address => uint8) public feedDecimals;
    
    uint256 public maxAge = 2 hours;
    uint256 private constant PRECISION = 1e18;
    
    event ChainlinkFeedAdded(address indexed token, address indexed feed);
    event DEXPairAdded(address indexed token, address indexed pair);
    event PriceSourceRemoved(address indexed token);
    event MaxAgeUpdated(uint256 maxAge);
    
    error Unauthorized();
    error NoPriceSource();
    error StalePrice();
    error InvalidPrice();
    error LengthMismatch();
    error InvalidAge();
    
    constructor() {
        owner = 0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329;
    }
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    
    function getPrice(address token) external view returns (uint256 price) {
        address feed = chainlinkFeeds[token];
        if (feed != address(0)) {
            return _getChainlinkPrice(feed);
        }
        
        address pair = dexPairs[token];
        if (pair != address(0)) {
            return _getDEXPrice(token, pair);
        }
        
        revert NoPriceSource();
    }
    
    function getPrices(address[] calldata tokens) 
        external 
        view 
        returns (uint256[] memory prices) 
    {
        uint256 len = tokens.length;
        prices = new uint256[](len);
        
        for (uint256 i = 0; i < len;) {
            prices[i] = this.getPrice(tokens[i]);
            unchecked { ++i; }
        }
    }
    
    function _getChainlinkPrice(address feed) internal view returns (uint256 price) {
        AggregatorV3Interface aggregator = AggregatorV3Interface(feed);
        
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = aggregator.latestRoundData();
        
        if (answer <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice();
        
        uint8 decimals = feedDecimals[feed];
        if (decimals == 0) {
            decimals = aggregator.decimals();
        }
        
        if (decimals < 18) {
            unchecked {
                price = uint256(answer) * (10 ** (18 - decimals));
            }
        } else if (decimals > 18) {
            unchecked {
                price = uint256(answer) / (10 ** (decimals - 18));
            }
        } else {
            price = uint256(answer);
        }
    }
    
    function _getDEXPrice(address token, address pair) internal view returns (uint256 price) {
        IUniswapV2Pair dexPair = IUniswapV2Pair(pair);
        
        (uint112 reserve0, uint112 reserve1, ) = dexPair.getReserves();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidPrice();
        
        address token0 = dexPair.token0();
        address token1 = dexPair.token1();
        
        uint8 decimals0 = IERC20Decimals(token0).decimals();
        uint8 decimals1 = IERC20Decimals(token1).decimals();
        
        if (token == token0) {
            price = (uint256(reserve1) * (10 ** decimals0) * PRECISION) / 
                    (uint256(reserve0) * (10 ** decimals1));
        } else {
            price = (uint256(reserve0) * (10 ** decimals1) * PRECISION) / 
                    (uint256(reserve1) * (10 ** decimals0));
        }
    }
    
    function addChainlinkFeed(address token, address feed) external onlyOwner {
        chainlinkFeeds[token] = feed;
        
        try AggregatorV3Interface(feed).decimals() returns (uint8 decimals) {
            feedDecimals[feed] = decimals;
        } catch {}
        
        emit ChainlinkFeedAdded(token, feed);
    }
    
    function addDEXPair(address token, address pair) external onlyOwner {
        dexPairs[token] = pair;
        emit DEXPairAdded(token, pair);
    }
    
    function batchAddChainlinkFeeds(
        address[] calldata tokens,
        address[] calldata feeds
    ) external onlyOwner {
        if (tokens.length != feeds.length) revert LengthMismatch();
        
        for (uint256 i = 0; i < tokens.length;) {
            chainlinkFeeds[tokens[i]] = feeds[i];
            
            try AggregatorV3Interface(feeds[i]).decimals() returns (uint8 decimals) {
                feedDecimals[feeds[i]] = decimals;
            } catch {}
            
            emit ChainlinkFeedAdded(tokens[i], feeds[i]);
            unchecked { ++i; }
        }
    }
    
    function removeSource(address token) external onlyOwner {
        delete chainlinkFeeds[token];
        delete dexPairs[token];
        emit PriceSourceRemoved(token);
    }
    
    function setMaxAge(uint256 _maxAge) external onlyOwner {
        if (_maxAge == 0 || _maxAge > 1 days) revert InvalidAge();
        maxAge = _maxAge;
        emit MaxAgeUpdated(_maxAge);
    }
    
    function hasPrice(address token) external view returns (bool) {
        return chainlinkFeeds[token] != address(0) || dexPairs[token] != address(0);
    }
    
    function getPriceSourceType(address token) external view returns (uint8) {
        if (chainlinkFeeds[token] != address(0)) return 1;
        if (dexPairs[token] != address(0)) return 2;
        return 0;
    }
    
    function getPriceSource(address token) external view returns (address source) {
        source = chainlinkFeeds[token];
        if (source == address(0)) {
            source = dexPairs[token];
        }
    }
}