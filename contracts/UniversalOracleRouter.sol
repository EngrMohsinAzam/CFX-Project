// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimpleOracleRouter
 * @dev Lightweight oracle supporting Chainlink + simple DEX fallback
 * @notice Optimized for fast compilation and low gas
 */

// ============ INTERFACES ============

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

interface IERC20 {
    function decimals() external view returns (uint8);
}

/**
 * @title SimpleOracleRouter
 * @dev Gas-optimized oracle with Chainlink primary + DEX fallback
 */
contract SimpleOracleRouter {
    
    // ============ STORAGE ============
    
    address public immutable owner;
    
    // Token => Chainlink aggregator
    mapping(address => address) public chainlinkFeeds;
    
    // Token => DEX pair (fallback)
    mapping(address => address) public dexPairs;
    
    // Chainlink feed => decimals (cache)
    mapping(address => uint8) public feedDecimals;
    
    // Max price age (2 hours default)
    uint256 public maxAge = 2 hours;
    
    // ============ CONSTANTS ============
    
    uint256 private constant PRECISION = 1e18;
    
    // ============ EVENTS ============
    
    event ChainlinkFeedAdded(address indexed token, address indexed feed);
    event DEXPairAdded(address indexed token, address indexed pair);
    event PriceSourceRemoved(address indexed token);
    
    // ============ ERRORS ============
    
    error Unauthorized();
    error NoPriceSource();
    error StalePrice();
    error InvalidPrice();
    
    // ============ CONSTRUCTOR ============
    
    constructor() {
        owner = 0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329;
    }
    
    // ============ MODIFIERS ============
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    
    // ============ MAIN FUNCTION ============
    
    /**
     * @notice Get price for any token
     * @param token Token address
     * @return price Price in USD (18 decimals)
     */
    function getPrice(address token) external view returns (uint256 price) {
        // Try Chainlink first
        address feed = chainlinkFeeds[token];
        if (feed != address(0)) {
            return _getChainlinkPrice(feed);
        }
        
        // Try DEX fallback
        address pair = dexPairs[token];
        if (pair != address(0)) {
            return _getDEXPrice(token, pair);
        }
        
        revert NoPriceSource();
    }
    
    /**
     * @notice Get prices for multiple tokens (batch)
     * @param tokens Array of token addresses
     * @return prices Array of prices
     */
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
    
    // ============ CHAINLINK ============
    
    /**
     * @dev Get price from Chainlink
     */
    function _getChainlinkPrice(address feed) 
        internal 
        view 
        returns (uint256 price) 
    {
        AggregatorV3Interface aggregator = AggregatorV3Interface(feed);
        
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = aggregator.latestRoundData();
        
        // Validate
        if (answer <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice();
        
        // Get decimals (cached)
        uint8 decimals = feedDecimals[feed];
        if (decimals == 0) {
            decimals = aggregator.decimals();
        }
        
        // Scale to 18 decimals
        if (decimals < 18) {
            price = uint256(answer) * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            price = uint256(answer) / (10 ** (decimals - 18));
        } else {
            price = uint256(answer);
        }
    }
    
    // ============ DEX FALLBACK ============
    
    /**
     * @dev Get price from DEX pair (simple reserve-based)
     */
    function _getDEXPrice(address token, address pair) 
        internal 
        view 
        returns (uint256 price) 
    {
        IUniswapV2Pair dexPair = IUniswapV2Pair(pair);
        
        (uint112 reserve0, uint112 reserve1, ) = dexPair.getReserves();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidPrice();
        
        address token0 = dexPair.token0();
        address token1 = dexPair.token1();
        
        // Get decimals
        uint8 decimals0 = IERC20(token0).decimals();
        uint8 decimals1 = IERC20(token1).decimals();
        
        // Calculate price
        if (token == token0) {
            // Price of token0 in terms of token1
            price = (uint256(reserve1) * (10 ** decimals0) * PRECISION) / 
                    (uint256(reserve0) * (10 ** decimals1));
        } else {
            // Price of token1 in terms of token0
            price = (uint256(reserve0) * (10 ** decimals1) * PRECISION) / 
                    (uint256(reserve1) * (10 ** decimals0));
        }
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @notice Add Chainlink price feed
     * @param token Token address
     * @param feed Chainlink aggregator address
     */
    function addChainlinkFeed(address token, address feed) external onlyOwner {
        chainlinkFeeds[token] = feed;
        
        // Cache decimals
        try AggregatorV3Interface(feed).decimals() returns (uint8 decimals) {
            feedDecimals[feed] = decimals;
        } catch {}
        
        emit ChainlinkFeedAdded(token, feed);
    }
    
    /**
     * @notice Add DEX pair (fallback price source)
     * @param token Token address
     * @param pair DEX pair address
     */
    function addDEXPair(address token, address pair) external onlyOwner {
        dexPairs[token] = pair;
        emit DEXPairAdded(token, pair);
    }
    
    /**
     * @notice Batch add Chainlink feeds
     * @param tokens Array of tokens
     * @param feeds Array of feeds
     */
    function batchAddChainlinkFeeds(
        address[] calldata tokens,
        address[] calldata feeds
    ) external onlyOwner {
        require(tokens.length == feeds.length, "Length mismatch");
        
        for (uint256 i = 0; i < tokens.length;) {
            chainlinkFeeds[tokens[i]] = feeds[i];
            
            try AggregatorV3Interface(feeds[i]).decimals() returns (uint8 decimals) {
                feedDecimals[feeds[i]] = decimals;
            } catch {}
            
            emit ChainlinkFeedAdded(tokens[i], feeds[i]);
            unchecked { ++i; }
        }
    }
    
    /**
     * @notice Remove price source
     * @param token Token address
     */
    function removeSource(address token) external onlyOwner {
        delete chainlinkFeeds[token];
        delete dexPairs[token];
        emit PriceSourceRemoved(token);
    }
    
    /**
     * @notice Update max price age
     * @param _maxAge New max age in seconds
     */
    function setMaxAge(uint256 _maxAge) external onlyOwner {
        require(_maxAge > 0 && _maxAge <= 1 days, "Invalid age");
        maxAge = _maxAge;
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Check if token has price source
     * @param token Token address
     * @return hasSource True if source exists
     */
    function hasPrice(address token) external view returns (bool hasSource) {
        hasSource = chainlinkFeeds[token] != address(0) || dexPairs[token] != address(0);
    }
    
    /**
     * @notice Get price source type
     * @param token Token address
     * @return sourceType 1=Chainlink, 2=DEX, 0=None
     */
    function getPriceSourceType(address token) external view returns (uint8 sourceType) {
        if (chainlinkFeeds[token] != address(0)) {
            return 1; // Chainlink
        } else if (dexPairs[token] != address(0)) {
            return 2; // DEX
        }
        return 0; // None
    }
    
    /**
     * @notice Get price source address
     * @param token Token address
     * @return source Source address (feed or pair)
     */
    function getPriceSource(address token) external view returns (address source) {
        source = chainlinkFeeds[token];
        if (source == address(0)) {
            source = dexPairs[token];
        }
    }
}
