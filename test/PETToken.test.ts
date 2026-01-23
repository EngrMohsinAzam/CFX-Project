import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "./helpers";

const { ethers } = hre;

describe("PETToken", function () {
  async function deployPETTokenFixture() {
    const [owner, vault, user1] = await ethers.getSigners();
    
    const PETTokenFactory = await ethers.getContractFactory("PETToken");
    const petToken = await PETTokenFactory.deploy();
    
    return { petToken, owner, vault, user1 };
  }

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { petToken, vault } = await loadFixture(deployPETTokenFixture);
      
      const name = "PET-TokenA/TokenB";
      const symbol = "PET-AB";
      const logoURI = "ipfs://QmTest";
      
      await petToken.initialize(name, symbol, vault.address, logoURI);
      
      expect(await petToken.name()).to.equal(name);
      expect(await petToken.symbol()).to.equal(symbol);
      expect(await petToken.vault()).to.equal(vault.address);
      expect(await petToken.logoURI()).to.equal(logoURI);
      expect(await petToken.decimals()).to.equal(18);
    });

    it("Should revert when initialized twice", async function () {
      const { petToken, vault } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("Name", "SYM", vault.address, "ipfs://test");
      
      await expect(
        petToken.initialize("Name2", "SYM2", vault.address, "ipfs://test2")
      ).to.be.revertedWithCustomError(petToken, "AlreadyInitialized");
    });
  });

  describe("Minting", function () {
    it("Should allow vault to mint tokens", async function () {
      const { petToken, vault, user1 } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      
      const amount = parseEther("1000");
      await petToken.connect(vault).mint(user1.address, amount);
      
      expect(await petToken.balanceOf(user1.address)).to.equal(amount);
      expect(await petToken.totalSupply()).to.equal(amount);
    });

    it("Should revert when non-vault tries to mint", async function () {
      const { petToken, vault, user1 } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      
      await expect(
        petToken.connect(user1).mint(user1.address, parseEther("1000"))
      ).to.be.revertedWithCustomError(petToken, "Unauthorized");
    });
  });

  describe("Burning", function () {
    it("Should allow vault to burn tokens", async function () {
      const { petToken, vault, user1 } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      
      const mintAmount = parseEther("1000");
      const burnAmount = parseEther("300");
      
      await petToken.connect(vault).mint(user1.address, mintAmount);
      await petToken.connect(vault).burn(user1.address, burnAmount);
      
      expect(await petToken.balanceOf(user1.address)).to.equal(mintAmount - burnAmount);
      expect(await petToken.totalSupply()).to.equal(mintAmount - burnAmount);
    });

    it("Should revert when non-vault tries to burn", async function () {
      const { petToken, vault, user1 } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      await petToken.connect(vault).mint(user1.address, parseEther("1000"));
      
      await expect(
        petToken.connect(user1).burn(user1.address, parseEther("100"))
      ).to.be.revertedWithCustomError(petToken, "Unauthorized");
    });
  });

  describe("ERC20 Functionality", function () {
    it("Should transfer tokens correctly", async function () {
      const { petToken, vault, user1, owner } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      await petToken.connect(vault).mint(user1.address, parseEther("1000"));
      
      const transferAmount = parseEther("300");
      await petToken.connect(user1).transfer(owner.address, transferAmount);
      
      expect(await petToken.balanceOf(owner.address)).to.equal(transferAmount);
      expect(await petToken.balanceOf(user1.address)).to.equal(parseEther("700"));
    });

    it("Should approve and transferFrom correctly", async function () {
      const { petToken, vault, user1, owner } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      await petToken.connect(vault).mint(user1.address, parseEther("1000"));
      
      const amount = parseEther("500");
      await petToken.connect(user1).approve(owner.address, amount);
      await petToken.connect(owner).transferFrom(user1.address, owner.address, amount);
      
      expect(await petToken.balanceOf(owner.address)).to.equal(amount);
      expect(await petToken.balanceOf(user1.address)).to.equal(parseEther("500"));
    });

    it("Should handle max approval correctly", async function () {
      const { petToken, vault, user1, owner } = await loadFixture(deployPETTokenFixture);
      
      await petToken.initialize("PET", "PET", vault.address, "ipfs://test");
      await petToken.connect(vault).mint(user1.address, parseEther("1000"));
      
      const maxApproval = ethers.MaxUint256;
      await petToken.connect(user1).approve(owner.address, maxApproval);
      
      // First transfer
      await petToken.connect(owner).transferFrom(user1.address, owner.address, parseEther("300"));
      
      // Second transfer should work without reducing allowance
      await petToken.connect(owner).transferFrom(user1.address, owner.address, parseEther("200"));
      
      expect(await petToken.allowance(user1.address, owner.address)).to.equal(maxApproval);
    });
  });
});

