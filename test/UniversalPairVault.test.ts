import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { OWNER_ADDRESS, parseEther, parseUnits } from "./helpers";

const { ethers } = hre;

describe("UniversalPairVault", function () {
  async function deployVaultFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const cfxToken = await MockERC20Factory.deploy("CFX", "CFX", 18);
    const token0 = await MockERC20Factory.deploy("Token0", "TK0", 18);
    const token1 = await MockERC20Factory.deploy("Token1", "TK1", 18);
    
    // Deploy oracle
    const SimpleOracleRouterFactory = await ethers.getContractFactory("SimpleOracleRouter");
    const oracle = await SimpleOracleRouterFactory.deploy();
    
    // Deploy mock chainlink feeds
    const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
    const cfxFeed = await MockChainlinkFeedFactory.deploy(8, ethers.parseEther("1").toString()); // $1
    const token0Feed = await MockChainlinkFeedFactory.deploy(8, ethers.parseEther("2").toString()); // $2
    const token1Feed = await MockChainlinkFeedFactory.deploy(8, ethers.parseEther("3").toString()); // $3
    
    // Add feeds to oracle
    await oracle.addChainlinkFeed(cfxToken.target, cfxFeed.target);
    await oracle.addChainlinkFeed(token0.target, token0Feed.target);
    await oracle.addChainlinkFeed(token1.target, token1Feed.target);
    
    // Deploy vault
    const UniversalPairVaultFactory = await ethers.getContractFactory("UniversalPairVault");
    const vault = await UniversalPairVaultFactory.deploy();
    
    // Deploy PET token
    const PETTokenFactory = await ethers.getContractFactory("PETToken");
    const petToken = await PETTokenFactory.deploy();
    await petToken.initialize("PET-TK0/TK1", "PET-TK0TK1", vault.target, "ipfs://test");
    
    // Initialize vault
    await vault.initialize(
      cfxToken.target,
      petToken.target,
      token0.target,
      token1.target,
      oracle.target,
      OWNER_ADDRESS
    );
    
    // Mint initial tokens
    await cfxToken.mint(user1.address, parseEther("100000"));
    await cfxToken.mint(user2.address, parseEther("100000"));
    
    return { vault, cfxToken, token0, token1, petToken, oracle, owner, user1, user2 };
  }

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { vault, cfxToken, token0, token1, petToken, oracle } = await loadFixture(deployVaultFixture);
      
      expect(await vault.cfxToken()).to.equal(cfxToken.target);
      expect(await vault.petToken()).to.equal(petToken.target);
      expect(await vault.token0()).to.equal(token0.target);
      expect(await vault.token1()).to.equal(token1.target);
      expect(await vault.oracle()).to.equal(oracle.target);
      expect(await vault.owner()).to.equal(OWNER_ADDRESS);
      expect(await vault.mintFee()).to.equal(10);
      expect(await vault.burnFee()).to.equal(10);
      expect(await vault.paused()).to.be.false;
    });

    it("Should revert when initialized twice", async function () {
      const { vault, cfxToken, token0, token1, petToken, oracle } = await loadFixture(deployVaultFixture);
      
      await expect(
        vault.initialize(cfxToken.target, petToken.target, token0.target, token1.target, oracle.target, OWNER_ADDRESS)
      ).to.be.revertedWithCustomError(vault, "AlreadyInitialized");
    });
  });

  describe("Deposit", function () {
    it("Should deposit CFX and mint PET tokens", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      
      const balanceBefore = await petToken.balanceOf(user1.address);
      
      await expect(vault.connect(user1).deposit(depositAmount, 0))
        .to.emit(vault, "Deposited");
      
      const balanceAfter = await petToken.balanceOf(user1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should calculate NAV correctly", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      
      // NAV = (price0 + price1) / 2 = (2 + 3) / 2 = 2.5e18
      const nav = await vault.getCurrentNAV();
      expect(nav).to.equal(parseEther("2.5"));
    });

    it("Should apply mint fee", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      
      const expectedOutput = await vault.calculateDepositOutput(depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const userBalance = await petToken.balanceOf(user1.address);
      expect(userBalance).to.equal(expectedOutput);
      
      // Check that fee was minted to owner
      const ownerBalance = await petToken.balanceOf(OWNER_ADDRESS);
      expect(ownerBalance).to.be.gt(0);
    });

    it("Should revert when paused", async function () {
      const { vault, cfxToken, user1 } = await loadFixture(deployVaultFixture);
      
      await vault.setPaused(true);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      
      await expect(vault.connect(user1).deposit(depositAmount, 0))
        .to.be.revertedWithCustomError(vault, "Paused");
    });

    it("Should revert on zero amount", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      
      await expect(vault.connect(user1).deposit(0, 0))
        .to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert on slippage exceeded", async function () {
      const { vault, cfxToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      
      const expectedOutput = await vault.calculateDepositOutput(depositAmount);
      const minOut = expectedOutput + parseEther("1"); // Too high
      
      await expect(vault.connect(user1).deposit(depositAmount, minOut))
        .to.be.revertedWithCustomError(vault, "SlippageExceeded");
    });
  });

  describe("Redeem", function () {
    it("Should redeem PET tokens for CFX", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      // First deposit
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const cfxBalanceBefore = await cfxToken.balanceOf(user1.address);
      
      await expect(vault.connect(user1).redeem(petBalance, 0))
        .to.emit(vault, "Redeemed");
      
      const cfxBalanceAfter = await cfxToken.balanceOf(user1.address);
      expect(cfxBalanceAfter).to.be.gt(cfxBalanceBefore);
    });

    it("Should apply burn fee", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const expectedOutput = await vault.calculateRedeemOutput(petBalance);
      
      const cfxBalanceBefore = await cfxToken.balanceOf(user1.address);
      await vault.connect(user1).redeem(petBalance, 0);
      const cfxBalanceAfter = await cfxToken.balanceOf(user1.address);
      
      const received = cfxBalanceAfter - cfxBalanceBefore;
      expect(received).to.equal(expectedOutput);
    });

    it("Should revert on zero amount", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      
      await expect(vault.connect(user1).redeem(0, 0))
        .to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert on slippage exceeded", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const expectedOutput = await vault.calculateRedeemOutput(petBalance);
      const minOut = expectedOutput + parseEther("1"); // Too high
      
      await expect(vault.connect(user1).redeem(petBalance, minOut))
        .to.be.revertedWithCustomError(vault, "SlippageExceeded");
    });
  });

  describe("View Functions", function () {
    it("Should calculate deposit output correctly", async function () {
      const { vault, cfxToken } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      const output = await vault.calculateDepositOutput(depositAmount);
      
      expect(output).to.be.gt(0);
    });

    it("Should calculate redeem output correctly", async function () {
      const { vault, cfxToken, petToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const output = await vault.calculateRedeemOutput(petBalance);
      
      expect(output).to.be.gt(0);
    });

    it("Should get user position", async function () {
      const { vault, cfxToken, user1 } = await loadFixture(deployVaultFixture);
      
      const depositAmount = parseEther("1000");
      await cfxToken.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const [petBalance, cfxValue] = await vault.getUserPosition(user1.address);
      
      expect(petBalance).to.be.gt(0);
      expect(cfxValue).to.be.gt(0);
    });
  });

  describe("Owner Functions", function () {
    it("Should set fees", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      
      await vault.setFees(50, 50);
      
      expect(await vault.mintFee()).to.equal(50);
      expect(await vault.burnFee()).to.equal(50);
    });

    it("Should revert when fee too high", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      
      await expect(vault.setFees(1001, 10))
        .to.be.revertedWithCustomError(vault, "FeeTooHigh");
    });

    it("Should toggle paused state", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      
      await vault.setPaused(true);
      expect(await vault.paused()).to.be.true;
      
      await vault.setPaused(false);
      expect(await vault.paused()).to.be.false;
    });

    it("Should revert when non-owner tries to set fees", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      
      await expect(vault.connect(user1).setFees(50, 50))
        .to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("Should revert when non-owner tries to pause", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      
      await expect(vault.connect(user1).setPaused(true))
        .to.be.revertedWithCustomError(vault, "Unauthorized");
    });
  });
});

