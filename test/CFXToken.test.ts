import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("CFXToken", function () {
  let cfxToken: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let ownerSigner: any;
  
  const INITIAL_SUPPLY = 20_000_000_000n * 10n ** 18n;
  const OWNER_ADDRESS = "0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329";
  const LOGO_URI = "ipfs://testlogo123";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Impersonate owner account and fund it
    await networkHelpers.impersonateAccount(OWNER_ADDRESS);
    await networkHelpers.setBalance(OWNER_ADDRESS, ethers.parseEther("10000"));
    ownerSigner = await ethers.getSigner(OWNER_ADDRESS);
    
    // Deploy CFXToken
    cfxToken = await ethers.deployContract("CFXToken", [LOGO_URI]);
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await cfxToken.name()).to.equal("CFX Token");
      expect(await cfxToken.symbol()).to.equal("CFX");
    });

    it("Should have 18 decimals", async function () {
      expect(await cfxToken.decimals()).to.equal(18);
    });

    it("Should mint initial supply to owner", async function () {
      const ownerBalance = await cfxToken.balanceOf(OWNER_ADDRESS);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the correct logo URI", async function () {
      expect(await cfxToken.logoURI()).to.equal(LOGO_URI);
    });

    it("Should set the correct owner", async function () {
      expect(await cfxToken.owner()).to.equal(OWNER_ADDRESS);
    });

    it("Should return correct cap", async function () {
      expect(await cfxToken.cap()).to.equal(INITIAL_SUPPLY);
    });

    it("Should have correct total supply", async function () {
      expect(await cfxToken.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Logo URI Management", function () {
    it("Should allow owner to update logo URI", async function () {
      const newLogoURI = "ipfs://newlogo456";
      
      await expect(cfxToken.connect(ownerSigner).setLogoURI(newLogoURI))
        .to.emit(cfxToken, "LogoURIUpdated")
        .withArgs(newLogoURI);
      
      expect(await cfxToken.logoURI()).to.equal(newLogoURI);
    });

    it("Should revert if non-owner tries to update logo URI", async function () {
      await expect(
        cfxToken.connect(user1).setLogoURI("ipfs://unauthorized")
      ).to.be.revertedWithCustomError(cfxToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Token Burning", function () {
    beforeEach(async function () {
      // Transfer some tokens to user1 for testing
      const amount = 1000n * 10n ** 18n;
      await cfxToken.connect(ownerSigner).transfer(user1.address, amount);
    });

    it("Should allow users to burn their own tokens", async function () {
      const burnAmount = 100n * 10n ** 18n;
      const initialBalance = await cfxToken.balanceOf(user1.address);
      
      await expect(cfxToken.connect(user1).burn(burnAmount))
        .to.emit(cfxToken, "TokensBurned")
        .withArgs(user1.address, burnAmount);
      
      const finalBalance = await cfxToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance - burnAmount);
      expect(await cfxToken.totalSupply()).to.equal(INITIAL_SUPPLY - burnAmount);
    });

    it("Should revert when trying to burn zero amount", async function () {
      await expect(
        cfxToken.connect(user1).burn(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert when trying to burn more than balance", async function () {
      const balance = await cfxToken.balanceOf(user1.address);
      const burnAmount = balance + 1n;
      
      await expect(
        cfxToken.connect(user1).burn(burnAmount)
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("ERC20 Standard Functions", function () {
    beforeEach(async function () {
      // Transfer some tokens to user1
      const amount = 1000n * 10n ** 18n;
      await cfxToken.connect(ownerSigner).transfer(user1.address, amount);
    });

    it("Should transfer tokens correctly", async function () {
      const transferAmount = 100n * 10n ** 18n;
      await cfxToken.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await cfxToken.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should approve and transferFrom correctly", async function () {
      const approveAmount = 200n * 10n ** 18n;
      const transferAmount = 150n * 10n ** 18n;
      
      await cfxToken.connect(user1).approve(user2.address, approveAmount);
      await cfxToken.connect(user2).transferFrom(user1.address, user2.address, transferAmount);
      
      expect(await cfxToken.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await cfxToken.allowance(user1.address, user2.address)).to.equal(approveAmount - transferAmount);
    });
  });
});

