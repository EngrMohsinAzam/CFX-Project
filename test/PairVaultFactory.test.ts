import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { OWNER_ADDRESS, parseEther } from "./helpers";

const { ethers } = hre;

describe("PairVaultFactory", function () {
  async function deployFactoryFixture() {
    const [owner, user1] = await ethers.getSigners();
    
    // Deploy CFX token
    const CFXTokenFactory = await ethers.getContractFactory("CFXToken");
    const cfxToken = await CFXTokenFactory.deploy("ipfs://cfx");
    
    // Deploy oracle
    const SimpleOracleRouterFactory = await ethers.getContractFactory("SimpleOracleRouter");
    const oracle = await SimpleOracleRouterFactory.deploy();
    
    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20Factory.deploy("TokenA", "TKA", 18);
    const tokenB = await MockERC20Factory.deploy("TokenB", "TKB", 18);
    
    // Deploy mock chainlink feeds
    const MockChainlinkFeedFactory = await ethers.getContractFactory("MockChainlinkFeed");
    const feedA = await MockChainlinkFeedFactory.deploy(8, ethers.parseEther("1").toString());
    const feedB = await MockChainlinkFeedFactory.deploy(8, ethers.parseEther("2").toString());
    
    // Add feeds to oracle
    await oracle.addChainlinkFeed(tokenA.target, feedA.target);
    await oracle.addChainlinkFeed(tokenB.target, feedB.target);
    
    // Deploy implementations
    const PETTokenFactory = await ethers.getContractFactory("PETToken");
    const petTokenImpl = await PETTokenFactory.deploy();
    
    const UniversalPairVaultFactory = await ethers.getContractFactory("UniversalPairVault");
    const vaultImpl = await UniversalPairVaultFactory.deploy();
    
    // Deploy factory
    const PairVaultFactoryFactory = await ethers.getContractFactory("PairVaultFactory");
    const factory = await PairVaultFactoryFactory.deploy(
      cfxToken.target,
      oracle.target,
      petTokenImpl.target,
      vaultImpl.target,
      "ipfs://default"
    );
    
    return { factory, cfxToken, oracle, tokenA, tokenB, petTokenImpl, vaultImpl, owner, user1 };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { factory, cfxToken, oracle, petTokenImpl, vaultImpl } = await loadFixture(deployFactoryFixture);
      
      expect(await factory.cfxToken()).to.equal(cfxToken.target);
      expect(await factory.oracle()).to.equal(oracle.target);
      expect(await factory.petTokenImplementation()).to.equal(petTokenImpl.target);
      expect(await factory.vaultImplementation()).to.equal(vaultImpl.target);
      expect(await factory.owner()).to.equal(OWNER_ADDRESS);
      expect(await factory.defaultPETLogoURI()).to.equal("ipfs://default");
    });

    it("Should revert on zero address in constructor", async function () {
      const { cfxToken, oracle, petTokenImpl, vaultImpl } = await loadFixture(deployFactoryFixture);
      
      const PairVaultFactoryFactory = await ethers.getContractFactory("PairVaultFactory");
      
      await expect(
        PairVaultFactoryFactory.deploy(
          ethers.ZeroAddress,
          oracle.target,
          petTokenImpl.target,
          vaultImpl.target,
          "ipfs://default"
        )
      ).to.be.revertedWithCustomError(PairVaultFactoryFactory, "ZeroAddress");
    });
  });

  describe("Vault Creation", function () {
    it("Should create vault for token pair", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      await expect(factory.createVault(tokenA.target, tokenB.target))
        .to.emit(factory, "VaultCreated");
      
      const vault = await factory.getVault(tokenA.target, tokenB.target);
      expect(vault).to.not.equal(ethers.ZeroAddress);
    });

    it("Should create vault with reversed token order", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      await factory.createVault(tokenA.target, tokenB.target);
      const vault1 = await factory.getVault(tokenA.target, tokenB.target);
      
      await factory.createVault(tokenB.target, tokenA.target);
      const vault2 = await factory.getVault(tokenB.target, tokenA.target);
      
      // Should return same vault
      expect(vault1).to.equal(vault2);
    });

    it("Should initialize PET token correctly", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      await factory.createVault(tokenA.target, tokenB.target);
      const vault = await factory.getVault(tokenA.target, tokenB.target);
      
      const vaultInfo = await factory.getVaultDetails(vault);
      const petToken = await ethers.getContractAt("PETToken", vaultInfo.petToken);
      
      expect(await petToken.name()).to.include("PET-");
      expect(await petToken.symbol()).to.include("PET-");
      expect(await petToken.vault()).to.equal(vault);
    });

    it("Should initialize vault correctly", async function () {
      const { factory, cfxToken, tokenA, tokenB, oracle } = await loadFixture(deployFactoryFixture);
      
      await factory.createVault(tokenA.target, tokenB.target);
      const vault = await factory.getVault(tokenA.target, tokenB.target);
      
      const vaultContract = await ethers.getContractAt("UniversalPairVault", vault);
      
      expect(await vaultContract.cfxToken()).to.equal(cfxToken.target);
      expect(await vaultContract.token0()).to.equal(tokenA.target);
      expect(await vaultContract.token1()).to.equal(tokenB.target);
      expect(await vaultContract.oracle()).to.equal(oracle.target);
    });

    it("Should add vault to allVaults array", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      const lengthBefore = await factory.allVaultsLength();
      
      await factory.createVault(tokenA.target, tokenB.target);
      
      const lengthAfter = await factory.allVaultsLength();
      expect(lengthAfter).to.equal(lengthBefore + 1n);
      
      const allVaults = await factory.getAllVaults();
      expect(allVaults.length).to.equal(1);
    });

    it("Should store vault info correctly", async function () {
      const { factory, tokenA, tokenB, user1 } = await loadFixture(deployFactoryFixture);
      
      await factory.connect(user1).createVault(tokenA.target, tokenB.target);
      const vault = await factory.getVault(tokenA.target, tokenB.target);
      
      const vaultInfo = await factory.getVaultDetails(vault);
      
      expect(vaultInfo.token0).to.equal(tokenA.target);
      expect(vaultInfo.token1).to.equal(tokenB.target);
      expect(vaultInfo.creator).to.equal(user1.address);
      expect(vaultInfo.createdAt).to.be.gt(0);
      expect(vaultInfo.petToken).to.not.equal(ethers.ZeroAddress);
    });

    it("Should revert when same token pair", async function () {
      const { factory, tokenA } = await loadFixture(deployFactoryFixture);
      
      await expect(factory.createVault(tokenA.target, tokenA.target))
        .to.be.revertedWithCustomError(factory, "SameToken");
    });

    it("Should revert when zero address", async function () {
      const { factory, tokenA } = await loadFixture(deployFactoryFixture);
      
      await expect(factory.createVault(ethers.ZeroAddress, tokenA.target))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("Should revert when vault already exists", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      await factory.createVault(tokenA.target, tokenB.target);
      
      await expect(factory.createVault(tokenA.target, tokenB.target))
        .to.be.revertedWithCustomError(factory, "VaultExists");
    });

    it("Should revert when no price source", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const tokenC = await MockERC20Factory.deploy("TokenC", "TKC", 18);
      const tokenD = await MockERC20Factory.deploy("TokenD", "TKD", 18);
      
      await expect(factory.createVault(tokenC.target, tokenD.target))
        .to.be.revertedWithCustomError(factory, "NoPriceSource");
    });
  });

  describe("View Functions", function () {
    it("Should get vault for pair", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      await factory.createVault(tokenA.target, tokenB.target);
      
      const vault1 = await factory.getVaultForPair(tokenA.target, tokenB.target);
      const vault2 = await factory.getVaultForPair(tokenB.target, tokenA.target);
      
      expect(vault1).to.equal(vault2);
      expect(vault1).to.not.equal(ethers.ZeroAddress);
    });

    it("Should check if vault exists", async function () {
      const { factory, tokenA, tokenB } = await loadFixture(deployFactoryFixture);
      
      expect(await factory.vaultExists(tokenA.target, tokenB.target)).to.be.false;
      
      await factory.createVault(tokenA.target, tokenB.target);
      
      expect(await factory.vaultExists(tokenA.target, tokenB.target)).to.be.true;
    });
  });

  describe("Owner Functions", function () {
    it("Should update default PET logo URI", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      
      const newLogoURI = "ipfs://newlogo";
      await expect(factory.setDefaultPETLogoURI(newLogoURI))
        .to.emit(factory, "DefaultLogoUpdated")
        .withArgs(newLogoURI);
      
      expect(await factory.defaultPETLogoURI()).to.equal(newLogoURI);
    });

    it("Should revert when non-owner tries to update logo", async function () {
      const { factory, user1 } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(user1).setDefaultPETLogoURI("ipfs://newlogo")
      ).to.be.revertedWithCustomError(factory, "Unauthorized");
    });
  });
});

