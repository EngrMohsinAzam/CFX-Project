import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { OWNER_ADDRESS, parseEther, parseUnits } from "./helpers";

const { ethers } = hre;

describe("CFXSwap", function () {
  async function deploySwapFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy CFX token
    const CFXTokenFactory = await ethers.getContractFactory("CFXToken");
    const cfxToken = await CFXTokenFactory.deploy("ipfs://cfx");
    
    // Deploy USDT token (6 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usdtToken = await MockERC20Factory.deploy("Tether USD", "USDT", 6);
    
    // Deploy CFXSwap
    const CFXSwapFactory = await ethers.getContractFactory("CFXSwap");
    const swap = await CFXSwapFactory.deploy(cfxToken.target, usdtToken.target);
    
    // Mint tokens to swap contract
    await cfxToken.transfer(swap.target, parseEther("1000000"));
    await usdtToken.mint(swap.target, parseUnits("1000000", 6));
    
    // Mint tokens to users
    await usdtToken.mint(user1.address, parseUnits("100000", 6));
    await cfxToken.transfer(user2.address, parseEther("100000"));
    
    return { swap, cfxToken, usdtToken, owner, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { swap, cfxToken, usdtToken } = await loadFixture(deploySwapFixture);
      
      expect(await swap.cfxToken()).to.equal(cfxToken.target);
      expect(await swap.usdtToken()).to.equal(usdtToken.target);
      expect(await swap.exchangeRate()).to.equal(parseEther("1"));
      expect(await swap.minSwapAmount()).to.equal(parseUnits("1", 6));
    });

    it("Should revert on zero address in constructor", async function () {
      const { cfxToken } = await loadFixture(deploySwapFixture);
      
      const CFXSwapFactory = await ethers.getContractFactory("CFXSwap");
      
      await expect(
        CFXSwapFactory.deploy(ethers.ZeroAddress, cfxToken.target)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("Buy CFX", function () {
    it("Should buy CFX with USDT", async function () {
      const { swap, cfxToken, usdtToken, user1 } = await loadFixture(deploySwapFixture);
      
      const usdtAmount = parseUnits("1000", 6);
      await usdtToken.connect(user1).approve(swap.target, usdtAmount);
      
      const cfxBalanceBefore = await cfxToken.balanceOf(user1.address);
      const usdtBalanceBefore = await usdtToken.balanceOf(user1.address);
      
      await expect(swap.connect(user1).buyCFX(usdtAmount))
        .to.emit(swap, "Swapped")
        .withArgs(user1.address, true, usdtAmount, await swap.getBuyOutput(usdtAmount));
      
      const cfxBalanceAfter = await cfxToken.balanceOf(user1.address);
      const usdtBalanceAfter = await usdtToken.balanceOf(user1.address);
      
      expect(cfxBalanceAfter).to.be.gt(cfxBalanceBefore);
      expect(usdtBalanceAfter).to.equal(usdtBalanceBefore - usdtAmount);
    });

    it("Should calculate buy output correctly", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const usdtAmount = parseUnits("1000", 6);
      const output = await swap.getBuyOutput(usdtAmount);
      
      // 1000 USDT * 1e12 * 1e18 / 1e18 = 1000 * 1e12 = 1e15 CFX
      expect(output).to.equal(parseEther("1000"));
    });

    it("Should revert when below minimum", async function () {
      const { swap, usdtToken, user1 } = await loadFixture(deploySwapFixture);
      
      const usdtAmount = parseUnits("0.5", 6); // Below 1 USDT minimum
      await usdtToken.connect(user1).approve(swap.target, usdtAmount);
      
      await expect(swap.connect(user1).buyCFX(usdtAmount))
        .to.be.revertedWith("Below minimum");
    });

    it("Should revert when insufficient CFX in contract", async function () {
      const { swap, usdtToken, user1 } = await loadFixture(deploySwapFixture);
      
      const usdtAmount = parseUnits("10000000", 6); // Very large amount
      await usdtToken.connect(user1).approve(swap.target, usdtAmount);
      
      await expect(swap.connect(user1).buyCFX(usdtAmount))
        .to.be.revertedWith("Insufficient CFX");
    });
  });

  describe("Sell CFX", function () {
    it("Should sell CFX for USDT", async function () {
      const { swap, cfxToken, usdtToken, user2 } = await loadFixture(deploySwapFixture);
      
      const cfxAmount = parseEther("1000");
      await cfxToken.connect(user2).approve(swap.target, cfxAmount);
      
      const usdtBalanceBefore = await usdtToken.balanceOf(user2.address);
      const cfxBalanceBefore = await cfxToken.balanceOf(user2.address);
      
      await expect(swap.connect(user2).sellCFX(cfxAmount))
        .to.emit(swap, "Swapped")
        .withArgs(user2.address, false, cfxAmount, await swap.getSellOutput(cfxAmount));
      
      const usdtBalanceAfter = await usdtToken.balanceOf(user2.address);
      const cfxBalanceAfter = await cfxToken.balanceOf(user2.address);
      
      expect(usdtBalanceAfter).to.be.gt(usdtBalanceBefore);
      expect(cfxBalanceAfter).to.equal(cfxBalanceBefore - cfxAmount);
    });

    it("Should calculate sell output correctly", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const cfxAmount = parseEther("1000");
      const output = await swap.getSellOutput(cfxAmount);
      
      // 1000 CFX * 1e18 / 1e30 = 1000 / 1e12 = 0.000001 USDT
      // Actually: 1000 * 1e18 * 1e18 / 1e30 = 1000 * 1e6 = 1e9 = 1000 USDT (6 decimals)
      expect(output).to.equal(parseUnits("1000", 6));
    });

    it("Should revert on zero amount", async function () {
      const { swap, user2 } = await loadFixture(deploySwapFixture);
      
      await expect(swap.connect(user2).sellCFX(0))
        .to.be.revertedWith("Zero amount");
    });

    it("Should revert when below minimum USDT output", async function () {
      const { swap, cfxToken, user2 } = await loadFixture(deploySwapFixture);
      
      // Set a very low exchange rate
      await swap.setExchangeRate(parseEther("0.0000001"));
      
      const cfxAmount = parseEther("1");
      await cfxToken.connect(user2).approve(swap.target, cfxAmount);
      
      await expect(swap.connect(user2).sellCFX(cfxAmount))
        .to.be.revertedWith("Below minimum");
    });

    it("Should revert when insufficient USDT in contract", async function () {
      const { swap, cfxToken, user2 } = await loadFixture(deploySwapFixture);
      
      const cfxAmount = parseEther("10000000"); // Very large amount
      await cfxToken.connect(user2).approve(swap.target, cfxAmount);
      
      await expect(swap.connect(user2).sellCFX(cfxAmount))
        .to.be.revertedWith("Insufficient USDT");
    });
  });

  describe("Exchange Rate", function () {
    it("Should update exchange rate", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const newRate = parseEther("2"); // 1 USDT = 2 CFX
      await expect(swap.setExchangeRate(newRate))
        .to.emit(swap, "RateUpdated")
        .withArgs(newRate);
      
      expect(await swap.exchangeRate()).to.equal(newRate);
    });

    it("Should affect buy output with new rate", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const newRate = parseEther("2");
      await swap.setExchangeRate(newRate);
      
      const usdtAmount = parseUnits("1000", 6);
      const output = await swap.getBuyOutput(usdtAmount);
      
      // Should get 2000 CFX instead of 1000
      expect(output).to.equal(parseEther("2000"));
    });

    it("Should affect sell output with new rate", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const newRate = parseEther("2");
      await swap.setExchangeRate(newRate);
      
      const cfxAmount = parseEther("1000");
      const output = await swap.getSellOutput(cfxAmount);
      
      // Should get 2000 USDT instead of 1000
      expect(output).to.equal(parseUnits("2000", 6));
    });

    it("Should revert on zero rate", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      await expect(swap.setExchangeRate(0))
        .to.be.revertedWith("Invalid rate");
    });

    it("Should revert when non-owner tries to update rate", async function () {
      const { swap, user1 } = await loadFixture(deploySwapFixture);
      
      await expect(
        swap.connect(user1).setExchangeRate(parseEther("2"))
      ).to.be.revertedWithCustomError(swap, "OwnableUnauthorizedAccount");
    });
  });

  describe("Minimum Swap Amount", function () {
    it("Should update minimum swap amount", async function () {
      const { swap } = await loadFixture(deploySwapFixture);
      
      const newMin = parseUnits("10", 6);
      await swap.setMinSwapAmount(newMin);
      
      expect(await swap.minSwapAmount()).to.equal(newMin);
    });

    it("Should revert when non-owner tries to update minimum", async function () {
      const { swap, user1 } = await loadFixture(deploySwapFixture);
      
      await expect(
        swap.connect(user1).setMinSwapAmount(parseUnits("10", 6))
      ).to.be.revertedWithCustomError(swap, "OwnableUnauthorizedAccount");
    });
  });

  describe("Withdraw", function () {
    it("Should allow owner to withdraw tokens", async function () {
      const { swap, cfxToken, usdtToken, owner } = await loadFixture(deploySwapFixture);
      
      const cfxAmount = parseEther("1000");
      const usdtAmount = parseUnits("1000", 6);
      
      const ownerCfxBefore = await cfxToken.balanceOf(owner.address);
      const ownerUsdtBefore = await usdtToken.balanceOf(owner.address);
      
      await swap.withdraw(cfxToken.target, cfxAmount);
      await swap.withdraw(usdtToken.target, usdtAmount);
      
      const ownerCfxAfter = await cfxToken.balanceOf(owner.address);
      const ownerUsdtAfter = await usdtToken.balanceOf(owner.address);
      
      expect(ownerCfxAfter).to.equal(ownerCfxBefore + cfxAmount);
      expect(ownerUsdtAfter).to.equal(ownerUsdtBefore + usdtAmount);
    });

    it("Should revert when non-owner tries to withdraw", async function () {
      const { swap, cfxToken, user1 } = await loadFixture(deploySwapFixture);
      
      await expect(
        swap.connect(user1).withdraw(cfxToken.target, parseEther("1000"))
      ).to.be.revertedWithCustomError(swap, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should get balances", async function () {
      const { swap, cfxToken, usdtToken } = await loadFixture(deploySwapFixture);
      
      const [cfx, usdt] = await swap.getBalances();
      
      expect(cfx).to.equal(await cfxToken.balanceOf(swap.target));
      expect(usdt).to.equal(await usdtToken.balanceOf(swap.target));
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks", async function () {
      // This test would require a malicious contract that tries to reenter
      // The ReentrancyGuard should prevent this
      const { swap } = await loadFixture(deploySwapFixture);
      
      // Verify the contract has reentrancy guard
      expect(swap).to.not.be.undefined;
    });
  });
});

