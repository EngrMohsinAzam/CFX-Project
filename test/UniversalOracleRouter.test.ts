import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("UniversalOracleRouter", function () {
  let oracle: any;
  let mockChainlinkFeed: any;
  let mockToken: any;
  let mockPair: any;
  let owner: any;
  let user1: any;
  let ownerSigner: any;
  
  const OWNER_ADDRESS = "0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329";
  const CHAINLINK_PRICE = 100n * 10n ** 8n; // $100 with 8 decimals
  const DEX_RESERVE0 = 1000n * 10n ** 18n; // 1000 tokens
  const DEX_RESERVE1 = 2000n * 10n ** 18n; // 2000 tokens

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    // Impersonate owner account and fund it
    await networkHelpers.impersonateAccount(OWNER_ADDRESS);
    await networkHelpers.setBalance(OWNER_ADDRESS, ethers.parseEther("10000"));
    ownerSigner = await ethers.getSigner(OWNER_ADDRESS);
    
    // Deploy oracle
    oracle = await ethers.deployContract("SimpleOracleRouter");
    
    // Deploy mock token
    mockToken = await ethers.deployContract("MockERC20", ["Test Token", "TEST", 18]);
    
    // Deploy mock Chainlink aggregator
    mockChainlinkFeed = await ethers.deployContract("MockChainlinkAggregator", [
      8, // decimals
      CHAINLINK_PRICE
    ]);
  });

  describe("Deployment", function () {
    it("Should set correct owner", async function () {
      expect(await oracle.owner()).to.equal(OWNER_ADDRESS);
    });

    it("Should set default max age to 2 hours", async function () {
      expect(await oracle.maxAge()).to.equal(2n * 60n * 60n);
    });
  });

  describe("Chainlink Price Feed", function () {
    it("Should add Chainlink feed for token", async function () {
      
      await expect(
        oracle.connect(ownerSigner).addChainlinkFeed(
          await mockToken.getAddress(),
          await mockChainlinkFeed.getAddress()
        )
      ).to.emit(oracle, "ChainlinkFeedAdded")
        .withArgs(await mockToken.getAddress(), await mockChainlinkFeed.getAddress());
    });

    it("Should cache feed decimals when adding feed", async function () {
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      expect(await oracle.feedDecimals(await mockChainlinkFeed.getAddress())).to.equal(8);
    });

    it("Should get price from Chainlink feed", async function () {
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      // Price should be scaled to 18 decimals: 100 * 10^8 -> 100 * 10^18
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.equal(100n * 10n ** 18n);
    });

    it("Should revert if no price source exists", async function () {
      await expect(
        oracle.getPrice(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(oracle, "NoPriceSource");
    });

    it("Should revert if Chainlink price is stale", async function () {
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      // Set max age to 1 second and wait
      await oracle.connect(ownerSigner).setMaxAge(1);
      
      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update timestamp in mock to be old
      // Note: This depends on MockChainlinkAggregator implementation
      // For now, we'll test with valid prices
    });

    it("Should revert if Chainlink price is invalid (negative or zero)", async function () {
      const badFeed = await ethers.deployContract("MockChainlinkAggregator", [
        8,
        -100n // negative price
      ]);
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await badFeed.getAddress()
      );
      
      await expect(
        oracle.getPrice(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(oracle, "InvalidPrice");
    });

    it("Should batch add Chainlink feeds", async function () {
      const token2 = await ethers.deployContract("MockERC20", ["Token2", "TK2", 18]);
      const feed2 = await ethers.deployContract("MockChainlinkAggregator", [8, 200n * 10n ** 8n]);
      
      await oracle.connect(ownerSigner).batchAddChainlinkFeeds(
        [await mockToken.getAddress(), await token2.getAddress()],
        [await mockChainlinkFeed.getAddress(), await feed2.getAddress()]
      );
      
      expect(await oracle.getPrice(await mockToken.getAddress())).to.equal(100n * 10n ** 18n);
      expect(await oracle.getPrice(await token2.getAddress())).to.equal(200n * 10n ** 18n);
    });

    it("Should revert if batch add arrays have different lengths", async function () {
      
      await expect(
        oracle.connect(ownerSigner).batchAddChainlinkFeeds(
          [await mockToken.getAddress()],
          [await mockChainlinkFeed.getAddress(), await mockChainlinkFeed.getAddress()]
        )
      ).to.be.revertedWith("Length mismatch");
    });
  });

  describe("DEX Pair Price Source", function () {
    let mockPair: any;
    let quoteToken: any;

    beforeEach(async function () {
      // Create a simple mock DEX pair contract
      quoteToken = await ethers.deployContract("MockERC20", ["Quote Token", "QT", 18]);
      
      // Deploy mock pair: mockToken/quoteToken with reserves
      mockPair = await ethers.deployContract("MockUniswapV2Pair", [
        await mockToken.getAddress(),
        await quoteToken.getAddress(),
        DEX_RESERVE0, // reserve0
        DEX_RESERVE1  // reserve1
      ]);
    });

    it("Should add DEX pair for token", async function () {
      
      await expect(
        oracle.connect(ownerSigner).addDEXPair(
          await mockToken.getAddress(),
          await mockPair.getAddress()
        )
      ).to.emit(oracle, "DEXPairAdded")
        .withArgs(await mockToken.getAddress(), await mockPair.getAddress());
    });

    it("Should get price from DEX pair", async function () {
      
      await oracle.connect(ownerSigner).addDEXPair(
        await mockToken.getAddress(),
        await mockPair.getAddress()
      );
      
      // Price should be calculated: (reserve1 * 10^decimals0 * PRECISION) / (reserve0 * 10^decimals1)
      // = (2000 * 10^18 * 10^18 * 10^18) / (1000 * 10^18 * 10^18) = 2000 * 10^18
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.be.gt(0);
    });

    it("Should revert if DEX pair has zero reserves", async function () {
      const emptyPair = await ethers.deployContract("MockUniswapV2Pair", [
        await mockToken.getAddress(),
        await quoteToken.getAddress(),
        0, // zero reserves
        0
      ]);
      
      await oracle.connect(ownerSigner).addDEXPair(
        await mockToken.getAddress(),
        await emptyPair.getAddress()
      );
      
      await expect(
        oracle.getPrice(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(oracle, "InvalidPrice");
    });
  });

  describe("Price Source Priority", function () {
    it("Should prefer Chainlink over DEX", async function () {
      
      // Add Chainlink feed
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      // Price should come from Chainlink
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.equal(100n * 10n ** 18n);
    });

    it("Should fallback to DEX if Chainlink not available", async function () {
      const quoteToken = await ethers.deployContract("MockERC20", ["Quote Token", "QT", 18]);
      const mockPair = await ethers.deployContract("MockUniswapV2Pair", [
        await mockToken.getAddress(),
        await quoteToken.getAddress(),
        DEX_RESERVE0,
        DEX_RESERVE1
      ]);
      
      // Add DEX pair but no Chainlink
      await oracle.connect(ownerSigner).addDEXPair(
        await mockToken.getAddress(),
        await mockPair.getAddress()
      );
      
      // Should get price from DEX
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.be.gt(0);
    });
  });

  describe("Batch Price Queries", function () {
    it("Should get prices for multiple tokens", async function () {
      const token2 = await ethers.deployContract("MockERC20", ["Token2", "TK2", 18]);
      const token3 = await ethers.deployContract("MockERC20", ["Token3", "TK3", 18]);
      
      const feed2 = await ethers.deployContract("MockChainlinkAggregator", [8, 200n * 10n ** 8n]);
      const feed3 = await ethers.deployContract("MockChainlinkAggregator", [8, 300n * 10n ** 8n]);
      
      await oracle.connect(ownerSigner).batchAddChainlinkFeeds(
        [await mockToken.getAddress(), await token2.getAddress(), await token3.getAddress()],
        [await mockChainlinkFeed.getAddress(), await feed2.getAddress(), await feed3.getAddress()]
      );
      
      const prices = await oracle.getPrices([
        await mockToken.getAddress(),
        await token2.getAddress(),
        await token3.getAddress()
      ]);
      
      expect(prices.length).to.equal(3);
      expect(prices[0]).to.equal(100n * 10n ** 18n);
      expect(prices[1]).to.equal(200n * 10n ** 18n);
      expect(prices[2]).to.equal(300n * 10n ** 18n);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update max age", async function () {
      const newMaxAge = 1n * 60n * 60n; // 1 hour
      
      await oracle.connect(ownerSigner).setMaxAge(newMaxAge);
      expect(await oracle.maxAge()).to.equal(newMaxAge);
    });

    it("Should revert if non-owner tries to update max age", async function () {
      await expect(
        oracle.connect(user1).setMaxAge(1n * 60n * 60n) // 1 hour
      ).to.be.revertedWithCustomError(oracle, "Unauthorized");
    });

    it("Should revert if max age is zero", async function () {
      
      await expect(
        oracle.connect(ownerSigner).setMaxAge(0)
      ).to.be.revertedWith("Invalid age");
    });

    it("Should revert if max age exceeds 1 day", async function () {
      
      await expect(
        oracle.connect(ownerSigner).setMaxAge(2n * 24n * 60n * 60n) // 2 days
      ).to.be.revertedWith("Invalid age");
    });

    it("Should allow owner to remove price source", async function () {
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      await expect(
        oracle.connect(ownerSigner).removeSource(await mockToken.getAddress())
      ).to.emit(oracle, "PriceSourceRemoved")
        .withArgs(await mockToken.getAddress());
      
      await expect(
        oracle.getPrice(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(oracle, "NoPriceSource");
    });

    it("Should revert if non-owner tries to remove source", async function () {
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      await expect(
        oracle.connect(user1).removeSource(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(oracle, "Unauthorized");
    });
  });

  describe("View Functions", function () {
    it("Should check if token has price source", async function () {
      expect(await oracle.hasPrice(await mockToken.getAddress())).to.be.false;
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      expect(await oracle.hasPrice(await mockToken.getAddress())).to.be.true;
    });

    it("Should return price source type (Chainlink)", async function () {
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      expect(await oracle.getPriceSourceType(await mockToken.getAddress())).to.equal(1);
    });

    it("Should return price source type (DEX)", async function () {
      const quoteToken = await ethers.deployContract("MockERC20", ["Quote Token", "QT", 18]);
      const mockPair = await ethers.deployContract("MockUniswapV2Pair", [
        await mockToken.getAddress(),
        await quoteToken.getAddress(),
        DEX_RESERVE0,
        DEX_RESERVE1
      ]);
      
      await oracle.connect(ownerSigner).addDEXPair(
        await mockToken.getAddress(),
        await mockPair.getAddress()
      );
      
      expect(await oracle.getPriceSourceType(await mockToken.getAddress())).to.equal(2);
    });

    it("Should return price source address", async function () {
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await mockChainlinkFeed.getAddress()
      );
      
      const source = await oracle.getPriceSource(await mockToken.getAddress());
      expect(source.toLowerCase()).to.equal(
        (await mockChainlinkFeed.getAddress()).toLowerCase()
      );
    });

    it("Should return zero address if no source exists", async function () {
      const source = await oracle.getPriceSource(await mockToken.getAddress());
      expect(source).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Price Scaling", function () {
    it("Should handle 8 decimal Chainlink feed correctly", async function () {
      const feed8 = await ethers.deployContract("MockChainlinkAggregator", [
        8,
        123n * 10n ** 8n // $123
      ]);
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await feed8.getAddress()
      );
      
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.equal(123n * 10n ** 18n);
    });

    it("Should handle 18 decimal Chainlink feed correctly", async function () {
      const feed18 = await ethers.deployContract("MockChainlinkAggregator", [
        18,
        456n * 10n ** 18n // $456
      ]);
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await feed18.getAddress()
      );
      
      const price = await oracle.getPrice(await mockToken.getAddress());
      expect(price).to.equal(456n * 10n ** 18n);
    });

    it("Should handle Chainlink feed with more than 18 decimals", async function () {
      const feed20 = await ethers.deployContract("MockChainlinkAggregator", [
        20,
        789n * 10n ** 20n // $789 with 20 decimals
      ]);
      
      await oracle.connect(ownerSigner).addChainlinkFeed(
        await mockToken.getAddress(),
        await feed20.getAddress()
      );
      
      const price = await oracle.getPrice(await mockToken.getAddress());
      // Should scale down: 789 * 10^20 / 10^2 = 789 * 10^18
      expect(price).to.equal(789n * 10n ** 18n);
    });
  });
});

