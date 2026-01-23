import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { OWNER_ADDRESS, increaseTime } from "./helpers";

const { ethers } = hre;

describe("SimpleOracleRouter", function () {
  async function deployOracleFixture() {
    const [owner, user1] = await ethers.getSigners();
    
    const SimpleOracleRouterFactory = await ethers.getContractFactory("SimpleOracleRouter");
    const oracle = await SimpleOracleRouterFactory.deploy();
    
    // Deploy mock contracts
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20Factory.deploy("TokenA", "TKA", 18);
    const tokenB = await MockERC20Factory.deploy("TokenB", "TKB", 6);
    
    const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
    const chainlinkFeed = await MockChainlinkFeedFactory.deploy(8, 100000000); // $1 with 8 decimals
    
    const MockUniswapPairFactory = await ethers.getContractFactory("MockUniswapPair");
    const dexPair = await MockUniswapPairFactory.deploy(tokenA.target, tokenB.target);
    
    return { oracle, owner, user1, tokenA, tokenB, chainlinkFeed, dexPair };
  }

  describe("Deployment", function () {
    it("Should deploy with correct owner", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      expect(await oracle.owner()).to.equal(OWNER_ADDRESS);
    });

    it("Should have default maxAge of 2 hours", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      expect(await oracle.maxAge()).to.equal(2 * 60 * 60);
    });
  });

  describe("Chainlink Feed", function () {
    it("Should add chainlink feed and get price", async function () {
      const { oracle, tokenA, chainlinkFeed } = await loadFixture(deployOracleFixture);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      
      const price = await oracle.getPrice(tokenA.target);
      // 100000000 (8 decimals) * 10^10 = 1e18
      expect(price).to.equal(ethers.parseEther("1"));
    });

    it("Should handle different feed decimals", async function () {
      const { oracle, tokenA } = await loadFixture(deployOracleFixture);
      
      // Feed with 18 decimals
      const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
      const feed18 = await MockChainlinkFeedFactory.deploy(18, ethers.parseEther("2").toString());
      
      await oracle.addChainlinkFeed(tokenA.target, feed18.target);
      const price = await oracle.getPrice(tokenA.target);
      expect(price).to.equal(ethers.parseEther("2"));
    });

    it("Should revert on stale price", async function () {
      const { oracle, tokenA, chainlinkFeed } = await loadFixture(deployOracleFixture);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      
      // Set price to be stale (3 hours ago)
      const provider = ethers.provider;
      const threeHoursAgo = Math.floor(Date.now() / 1000) - (3 * 60 * 60);
      await chainlinkFeed.setUpdatedAt(threeHoursAgo);
      
      await expect(oracle.getPrice(tokenA.target))
        .to.be.revertedWithCustomError(oracle, "StalePrice");
    });

    it("Should revert on invalid price (negative)", async function () {
      const { oracle, tokenA, chainlinkFeed } = await loadFixture(deployOracleFixture);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      await chainlinkFeed.setPrice(-100000000);
      
      await expect(oracle.getPrice(tokenA.target))
        .to.be.revertedWithCustomError(oracle, "InvalidPrice");
    });

    it("Should revert when non-owner tries to add feed", async function () {
      const { oracle, tokenA, chainlinkFeed, user1 } = await loadFixture(deployOracleFixture);
      
      await expect(
        oracle.connect(user1).addChainlinkFeed(tokenA.target, chainlinkFeed.target)
      ).to.be.revertedWithCustomError(oracle, "Unauthorized");
    });
  });

  describe("DEX Pair", function () {
    it("Should add DEX pair and get price", async function () {
      const { oracle, tokenA, tokenB, dexPair } = await loadFixture(deployOracleFixture);
      
      // Set reserves: 1000 tokenA, 2000 tokenB (both 18 decimals for simplicity)
      await dexPair.setReserves(ethers.parseEther("1000"), ethers.parseEther("2000"));
      
      await oracle.addDEXPair(tokenA.target, dexPair.target);
      
      const price = await oracle.getPrice(tokenA.target);
      // Price = (reserve1 * 10^decimals0 * PRECISION) / (reserve0 * 10^decimals1)
      // = (2000 * 10^18 * 10^18) / (1000 * 10^18) = 2 * 10^18
      expect(price).to.equal(ethers.parseEther("2"));
    });

    it("Should handle different token decimals", async function () {
      const { oracle, tokenA, tokenB, dexPair } = await loadFixture(deployOracleFixture);
      
      // tokenA: 18 decimals, tokenB: 6 decimals
      // Reserves: 1000 tokenA (18 decimals), 2000 tokenB (6 decimals)
      await dexPair.setReserves(ethers.parseEther("1000"), ethers.parseUnits("2000", 6));
      
      await oracle.addDEXPair(tokenA.target, dexPair.target);
      
      const price = await oracle.getPrice(tokenA.target);
      // Price = (2000 * 10^6 * 10^18 * 10^18) / (1000 * 10^18 * 10^6) = 2 * 10^18
      expect(price).to.be.closeTo(ethers.parseEther("2"), ethers.parseEther("0.01"));
    });

    it("Should revert on zero reserves", async function () {
      const { oracle, tokenA, dexPair } = await loadFixture(deployOracleFixture);
      
      await dexPair.setReserves(0, 0);
      await oracle.addDEXPair(tokenA.target, dexPair.target);
      
      await expect(oracle.getPrice(tokenA.target))
        .to.be.revertedWithCustomError(oracle, "InvalidPrice");
    });

    it("Should revert when non-owner tries to add pair", async function () {
      const { oracle, tokenA, dexPair, user1 } = await loadFixture(deployOracleFixture);
      
      await expect(
        oracle.connect(user1).addDEXPair(tokenA.target, dexPair.target)
      ).to.be.revertedWithCustomError(oracle, "Unauthorized");
    });
  });

  describe("Price Priority", function () {
    it("Should prefer chainlink over DEX", async function () {
      const { oracle, tokenA, chainlinkFeed, dexPair } = await loadFixture(deployOracleFixture);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      await oracle.addDEXPair(tokenA.target, dexPair.target);
      await dexPair.setReserves(ethers.parseEther("1000"), ethers.parseEther("2000"));
      
      const price = await oracle.getPrice(tokenA.target);
      // Should use chainlink price (1e18), not DEX price (2e18)
      expect(price).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Batch Operations", function () {
    it("Should batch add chainlink feeds", async function () {
      const { oracle, tokenA, tokenB } = await loadFixture(deployOracleFixture);
      
      const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
      const feed1 = await MockChainlinkFeedFactory.deploy(8, 100000000);
      const feed2 = await MockChainlinkFeedFactory.deploy(8, 200000000);
      
      await oracle.batchAddChainlinkFeeds(
        [tokenA.target, tokenB.target],
        [feed1.target, feed2.target]
      );
      
      expect(await oracle.getPrice(tokenA.target)).to.equal(ethers.parseEther("1"));
      expect(await oracle.getPrice(tokenB.target)).to.equal(ethers.parseEther("2"));
    });

    it("Should revert on length mismatch", async function () {
      const { oracle, tokenA } = await loadFixture(deployOracleFixture);
      
      const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
      const feed1 = await MockChainlinkFeedFactory.deploy(8, 100000000);
      
      await expect(
        oracle.batchAddChainlinkFeeds(
          [tokenA.target],
          [feed1.target, feed1.target]
        )
      ).to.be.revertedWithCustomError(oracle, "LengthMismatch");
    });
  });

  describe("Utility Functions", function () {
    it("Should check if price source exists", async function () {
      const { oracle, tokenA, chainlinkFeed } = await loadFixture(deployOracleFixture);
      
      expect(await oracle.hasPrice(tokenA.target)).to.be.false;
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      
      expect(await oracle.hasPrice(tokenA.target)).to.be.true;
    });

    it("Should get price source type", async function () {
      const { oracle, tokenA, chainlinkFeed, dexPair } = await loadFixture(deployOracleFixture);
      
      expect(await oracle.getPriceSourceType(tokenA.target)).to.equal(0);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      expect(await oracle.getPriceSourceType(tokenA.target)).to.equal(1);
      
      await oracle.removeSource(tokenA.target);
      await oracle.addDEXPair(tokenA.target, dexPair.target);
      expect(await oracle.getPriceSourceType(tokenA.target)).to.equal(2);
    });

    it("Should get multiple prices", async function () {
      const { oracle, tokenA, tokenB } = await loadFixture(deployOracleFixture);
      
      const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
      const feed1 = await MockChainlinkFeedFactory.deploy(8, 100000000);
      const feed2 = await MockChainlinkFeedFactory.deploy(8, 200000000);
      
      await oracle.addChainlinkFeed(tokenA.target, feed1.target);
      await oracle.addChainlinkFeed(tokenB.target, feed2.target);
      
      const prices = await oracle.getPrices([tokenA.target, tokenB.target]);
      expect(prices[0]).to.equal(ethers.parseEther("1"));
      expect(prices[1]).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Owner Functions", function () {
    it("Should update maxAge", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      
      const newMaxAge = 3600; // 1 hour
      await oracle.setMaxAge(newMaxAge);
      
      expect(await oracle.maxAge()).to.equal(newMaxAge);
    });

    it("Should revert on invalid maxAge", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      
      await expect(oracle.setMaxAge(0))
        .to.be.revertedWithCustomError(oracle, "InvalidAge");
      
      const oneDayPlusOne = 86401; // 1 day + 1 second
      await expect(oracle.setMaxAge(oneDayPlusOne))
        .to.be.revertedWithCustomError(oracle, "InvalidAge");
    });

    it("Should remove price source", async function () {
      const { oracle, tokenA, chainlinkFeed } = await loadFixture(deployOracleFixture);
      
      await oracle.addChainlinkFeed(tokenA.target, chainlinkFeed.target);
      expect(await oracle.hasPrice(tokenA.target)).to.be.true;
      
      await oracle.removeSource(tokenA.target);
      expect(await oracle.hasPrice(tokenA.target)).to.be.false;
      
      await expect(oracle.getPrice(tokenA.target))
        .to.be.revertedWithCustomError(oracle, "NoPriceSource");
    });
  });
});

