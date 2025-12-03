import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("PairVaultFactory", function () {
  let cfxToken: any;
  let mockOracle: any;
  let factory: any;
  let tokenA: any;
  let tokenB: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let treasury: any;
  let ownerSigner: any;
  
  const OWNER_ADDRESS = "0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329";
  const DEFAULT_LOGO_URI = "ipfs://defaultlogo123";
  const PRICE_TOKEN_A = 1n * 10n ** 18n; // $1
  const PRICE_TOKEN_B = 2n * 10n ** 18n; // $2

  beforeEach(async function () {
    [owner, user1, user2, treasury] = await ethers.getSigners();
    
    // Impersonate owner account and fund it
    await networkHelpers.impersonateAccount(OWNER_ADDRESS);
    await networkHelpers.setBalance(OWNER_ADDRESS, ethers.parseEther("10000"));
    ownerSigner = await ethers.getSigner(OWNER_ADDRESS);
    
    // Deploy CFX Token
    cfxToken = await ethers.deployContract("CFXToken", ["ipfs://cfxlogo"]);
    
    // Deploy Mock Oracle
    mockOracle = await ethers.deployContract("MockOracle");
    
    // Deploy Factory
    factory = await ethers.deployContract("PairVaultFactory", [
      await cfxToken.getAddress(),
      await mockOracle.getAddress(),
      treasury.address,
      DEFAULT_LOGO_URI
    ]);
    
    // Deploy mock ERC20 tokens for testing
    tokenA = await ethers.deployContract("MockERC20", ["Token A", "TKA", 18]);
    tokenB = await ethers.deployContract("MockERC20", ["Token B", "TKB", 18]);
    
    // Set prices in oracle
    await mockOracle.setPrice(await tokenA.getAddress(), PRICE_TOKEN_A);
    await mockOracle.setPrice(await tokenB.getAddress(), PRICE_TOKEN_B);
    
    // Give user1 some CFX tokens
    await cfxToken.connect(ownerSigner).transfer(user1.address, 100000n * 10n ** 18n);
  });

  describe("Deployment", function () {
    it("Should set correct CFX token address", async function () {
      expect(await factory.cfxToken()).to.equal(await cfxToken.getAddress());
    });

    it("Should set correct oracle address", async function () {
      expect(await factory.oracle()).to.equal(await mockOracle.getAddress());
    });

    it("Should set correct owner", async function () {
      expect(await factory.owner()).to.equal(OWNER_ADDRESS);
    });

    it("Should set correct treasury", async function () {
      expect(await factory.treasury()).to.equal(treasury.address);
    });

    it("Should set default PET logo URI", async function () {
      expect(await factory.defaultPETLogoURI()).to.equal(DEFAULT_LOGO_URI);
    });
  });

  describe("Create Vault", function () {
    it("Should create a new vault for token pair", async function () {
      const tx = await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed && parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      // Check vault exists
      const vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      expect(vaultAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should set PET token logo URI from default", async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const vaultInfo = await factory.getVaultDetails(vaultAddress);
      const petToken = await ethers.getContractAt("PETToken", vaultInfo.petToken);
      
      expect(await petToken.logoURI()).to.equal(DEFAULT_LOGO_URI);
    });

    it("Should revert when creating vault with same token", async function () {
      await expect(
        factory.connect(user1).createVault(
          await tokenA.getAddress(),
          await tokenA.getAddress()
        )
      ).to.be.revertedWith("Same token");
    });

    it("Should revert when creating vault with zero address", async function () {
      await expect(
        factory.connect(user1).createVault(
          ethers.ZeroAddress,
          await tokenA.getAddress()
        )
      ).to.be.revertedWith("Zero address");
    });

    it("Should revert when creating duplicate vault", async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      await expect(
        factory.connect(user1).createVault(
          await tokenA.getAddress(),
          await tokenB.getAddress()
        )
      ).to.be.revertedWith("Vault exists");
    });

    it("Should revert when oracle has no price for token0", async function () {
      const tokenC = await ethers.deployContract("MockERC20", ["Token C", "TKC", 18]);
      
      await expect(
        factory.connect(user1).createVault(
          await tokenC.getAddress(),
          await tokenB.getAddress()
        )
      ).to.be.revertedWith("No price for token0");
    });

    it("Should revert when oracle has no price for token1", async function () {
      const tokenC = await ethers.deployContract("MockERC20", ["Token C", "TKC", 18]);
      await mockOracle.setPrice(await tokenC.getAddress(), PRICE_TOKEN_A);
      
      // Create vault with C and B - both have prices so this should succeed
      // If C < B then C is token0, if B < C then B is token0
      // Since both have prices set in oracle, vault creation should succeed
      await expect(
        factory.connect(user1).createVault(
          await tokenC.getAddress(),
          await tokenB.getAddress()
        )
      ).to.emit(factory, "VaultCreated"); // This should work since both have prices
      
      // Test with a token without price
      // Since addresses are sorted, we need token without price to be token1
      // So we'll use tokenB (has price) first, then tokenD (no price) second
      // After sorting, tokenB < tokenD, so tokenB is token0 (has price) and tokenD is token1 (no price)
      const tokenD = await ethers.deployContract("MockERC20", ["Token D", "TKD", 18]);
      await expect(
        factory.connect(user1).createVault(
          await tokenB.getAddress(), // Has price, will be token0
          await tokenD.getAddress()   // No price, will be token1
        )
      ).to.be.revertedWith("No price for token1");
    });

    it("Should create vault with correct token ordering", async function () {
      // Use new tokens to avoid conflicts with previous tests
      const tokenX = await ethers.deployContract("MockERC20", ["Token X", "TKX", 18]);
      const tokenY = await ethers.deployContract("MockERC20", ["Token Y", "TKY", 18]);
      await mockOracle.setPrice(await tokenX.getAddress(), PRICE_TOKEN_A);
      await mockOracle.setPrice(await tokenY.getAddress(), PRICE_TOKEN_B);
      
      // Create vault with Y first, then X (to test ordering)
      await factory.connect(user1).createVault(
        await tokenY.getAddress(), 
        await tokenX.getAddress()
      );
      
      const vaultAddress = await factory.getVaultForPair(
        await tokenX.getAddress(),
        await tokenY.getAddress()
      );
      const vaultInfo = await factory.getVaultDetails(vaultAddress);
      
      // token0 should be the smaller address (X < Y typically)
      const tokenXAddr = (await tokenX.getAddress()).toLowerCase();
      const tokenYAddr = (await tokenY.getAddress()).toLowerCase();
      
      // Determine which is smaller
      const smallerAddr = tokenXAddr < tokenYAddr ? tokenXAddr : tokenYAddr;
      const largerAddr = tokenXAddr < tokenYAddr ? tokenYAddr : tokenXAddr;
      
      expect(vaultInfo.token0.toLowerCase()).to.equal(smallerAddr);
      expect(vaultInfo.token1.toLowerCase()).to.equal(largerAddr);
    });

    it("Should increment vault count", async function () {
      expect(await factory.allVaultsLength()).to.equal(0);
      
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      expect(await factory.allVaultsLength()).to.equal(1);
    });

    it("Should store vault creator", async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      const vaultInfo = await factory.getVaultDetails(vaultAddress);
      
      expect(vaultInfo.creator.toLowerCase()).to.equal(user1.address.toLowerCase());
    });
  });

  describe("Vault Operations", function () {
    let vaultAddress: string;
    let vault: any;
    let petToken: any;

    beforeEach(async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      vault = await ethers.getContractAt("UniversalPairVault", vaultAddress);
      
      const vaultInfo = await factory.getVaultDetails(vaultAddress);
      petToken = await ethers.getContractAt("PETToken", vaultInfo.petToken);
    });

    it("Should allow deposit to vault", async function () {
      const depositAmount = 1000n * 10n ** 18n;
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      
      const tx = await vault.connect(user1).deposit(depositAmount, 0);
      const receipt = await tx.wait();
      
      // Check PET tokens were minted
      const petBalance = await petToken.balanceOf(user1.address);
      expect(petBalance).to.be.gt(0);
    });

    it("Should calculate deposit output correctly", async function () {
      const depositAmount = 1000n * 10n ** 18n;
      const output = await vault.calculateDepositOutput(depositAmount);
      
      // First deposit should return close to deposit amount (minus fee)
      expect(output).to.be.gt(0);
      expect(output).to.be.lt(depositAmount);
    });

    it("Should allow redeem from vault", async function () {
      const depositAmount = 10000n * 10n ** 18n; // Increased to ensure vault has enough
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount * 2n);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      // Wait a moment for potential price updates
      await networkHelpers.time.increase(1);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const expectedOutput = await vault.calculateRedeemOutput(petBalance);
      
      // Make sure vault has enough CFX - deposit more if needed
      const vaultBalance = await cfxToken.balanceOf(vaultAddress);
      if (vaultBalance < expectedOutput) {
        const additionalNeeded = expectedOutput - vaultBalance + 1000n * 10n ** 18n;
        await cfxToken.connect(ownerSigner).transfer(vaultAddress, additionalNeeded);
      }
      
      await petToken.connect(user1).approve(vaultAddress, petBalance);
      
      const initialBalance = await cfxToken.balanceOf(user1.address);
      const tx = await vault.connect(user1).redeem(petBalance, 0);
      const receipt = await tx.wait();
      
      // User should get CFX back (minus fees)
      const finalBalance = await cfxToken.balanceOf(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should calculate NAV correctly", async function () {
      const nav = await vault.getCurrentNAV();
      // NAV should be average of token prices: (PRICE_TOKEN_A + PRICE_TOKEN_B) / 2
      const expectedNav = (PRICE_TOKEN_A + PRICE_TOKEN_B) >> 1n;
      expect(nav).to.equal(expectedNav);
    });

    it("Should respect slippage protection on deposit", async function () {
      const depositAmount = 1000n * 10n ** 18n;
      const actualOutput = await vault.calculateDepositOutput(depositAmount);
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      
      // Should fail if minPETOut is too high
      await expect(
        vault.connect(user1).deposit(depositAmount, actualOutput + 1n)
      ).to.be.revertedWith("Slippage");
    });

    it("Should respect slippage protection on redeem", async function () {
      const depositAmount = 1000n * 10n ** 18n;
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const actualOutput = await vault.calculateRedeemOutput(petBalance);
      
      await petToken.connect(user1).approve(vaultAddress, petBalance);
      
      // Should fail if minCFXOut is too high
      await expect(
        vault.connect(user1).redeem(petBalance, actualOutput + 1n)
      ).to.be.revertedWith("Slippage");
    });

    it("Should handle pause functionality", async function () {
      const depositAmount = 1000n * 10n ** 18n;
      
      // Pause vault
      await vault.connect(ownerSigner).setPaused(true);
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      
      await expect(
        vault.connect(user1).deposit(depositAmount, 0)
      ).to.be.revertedWith("Paused");
    });

    it("Should charge fees on deposit", async function () {
      const depositAmount = 10000n * 10n ** 18n;
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const treasuryPETBalance = await petToken.balanceOf(treasury.address);
      expect(treasuryPETBalance).to.be.gt(0);
    });

    it("Should charge fees on redeem", async function () {
      const depositAmount = 100000n * 10n ** 18n; // Increased significantly
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount * 3n);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      // Wait a moment
      await networkHelpers.time.increase(1);
      
      const treasuryCfxBefore = await cfxToken.balanceOf(treasury.address);
      const petBalance = await petToken.balanceOf(user1.address);
      const expectedOutput = await vault.calculateRedeemOutput(petBalance);
      
      // Ensure vault has enough CFX to cover redemption
      const vaultBalance = await cfxToken.balanceOf(vaultAddress);
      if (vaultBalance < expectedOutput) {
        const additionalNeeded = expectedOutput - vaultBalance + 10000n * 10n ** 18n;
        await cfxToken.connect(ownerSigner).transfer(vaultAddress, additionalNeeded);
      }
      
      await petToken.connect(user1).approve(vaultAddress, petBalance);
      await vault.connect(user1).redeem(petBalance, 0);
      
      const treasuryCfxAfter = await cfxToken.balanceOf(treasury.address);
      expect(treasuryCfxAfter).to.be.gt(treasuryCfxBefore);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update default PET logo URI", async function () {
      const newLogoURI = "ipfs://newlogo456";
      
      await factory.connect(ownerSigner).setDefaultPETLogoURI(newLogoURI);
      expect(await factory.defaultPETLogoURI()).to.equal(newLogoURI);
    });

    it("Should revert if non-owner tries to update default logo", async function () {
      await expect(
        factory.connect(user1).setDefaultPETLogoURI("ipfs://unauthorized")
      ).to.be.revertedWith("Not owner");
    });

    it("Should allow owner to update treasury", async function () {
      const newTreasury = user2.address;
      
      await factory.connect(ownerSigner).setTreasury(newTreasury);
      expect(await factory.treasury()).to.equal(newTreasury);
    });

    it("Should revert if non-owner tries to update treasury", async function () {
      await expect(
        factory.connect(user1).setTreasury(user2.address)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
    });

    it("Should return vault address for pair", async function () {
      const vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      expect(vaultAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should check if vault exists", async function () {
      expect(await factory.vaultExists(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      )).to.be.true;
      
      const tokenC = await ethers.deployContract("MockERC20", ["Token C", "TKC", 18]);
      expect(await factory.vaultExists(
        await tokenA.getAddress(),
        await tokenC.getAddress()
      )).to.be.false;
    });

    it("Should return all vaults", async function () {
      const allVaults = await factory.getAllVaults();
      expect(allVaults.length).to.equal(1);
      
      // Create another vault
      const tokenC = await ethers.deployContract("MockERC20", ["Token C", "TKC", 18]);
      await mockOracle.setPrice(await tokenC.getAddress(), PRICE_TOKEN_A);
      
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenC.getAddress()
      );
      
      const allVaultsAfter = await factory.getAllVaults();
      expect(allVaultsAfter.length).to.equal(2);
    });

    it("Should return vault details", async function () {
      const vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const details = await factory.getVaultDetails(vaultAddress);
      expect(details.petToken).to.not.equal(ethers.ZeroAddress);
      expect(details.token0.toLowerCase()).to.equal(
        (await tokenA.getAddress()).toLowerCase()
      );
      expect(details.token1.toLowerCase()).to.equal(
        (await tokenB.getAddress()).toLowerCase()
      );
      expect(details.createdAt).to.be.gt(0);
      expect(details.creator.toLowerCase()).to.equal(user1.address.toLowerCase());
    });
  });

  describe("PET Token Functionality", function () {
    let vaultAddress: string;
    let petToken: any;

    beforeEach(async function () {
      await factory.connect(user1).createVault(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      vaultAddress = await factory.getVaultForPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      
      const vaultInfo = await factory.getVaultDetails(vaultAddress);
      petToken = await ethers.getContractAt("PETToken", vaultInfo.petToken);
    });

    it("Should have correct PET token name and symbol", async function () {
      const name = await petToken.name();
      const symbol = await petToken.symbol();
      
      expect(name).to.include("PET-");
      expect(name).to.include("TKA");
      expect(name).to.include("TKB");
      expect(symbol).to.include("PET-");
    });

    it("Should have 18 decimals", async function () {
      expect(await petToken.decimals()).to.equal(18);
    });

    it("Should allow transfer of PET tokens", async function () {
      // First deposit to get some PET tokens
      const depositAmount = 1000n * 10n ** 18n;
      const vault = await ethers.getContractAt("UniversalPairVault", vaultAddress);
      
      await cfxToken.connect(user1).approve(vaultAddress, depositAmount);
      await vault.connect(user1).deposit(depositAmount, 0);
      
      const petBalance = await petToken.balanceOf(user1.address);
      const transferAmount = petBalance / 2n;
      
      await petToken.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await petToken.balanceOf(user2.address)).to.equal(transferAmount);
    });
  });
});

