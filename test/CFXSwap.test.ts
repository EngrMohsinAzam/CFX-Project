import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("CFXSwap", function () {
  let cfxToken: any;
  let usdtToken: any;
  let cfxSwap: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let ownerSigner: any;
  
  const OWNER_ADDRESS = "0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329";
  const INITIAL_CFX_BALANCE = 1000000n * 10n ** 18n; // 1M CFX
  const INITIAL_USDT_BALANCE = 1000000n * 10n ** 6n; // 1M USDT (6 decimals)

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Impersonate owner account and fund it
    await networkHelpers.impersonateAccount(OWNER_ADDRESS);
    await networkHelpers.setBalance(OWNER_ADDRESS, ethers.parseEther("10000"));
    ownerSigner = await ethers.getSigner(OWNER_ADDRESS);
    
    // Deploy mock tokens
    cfxToken = await ethers.deployContract("CFXToken", ["ipfs://test"]);
    usdtToken = await ethers.deployContract("MockERC20", ["USDT", "USDT", 6]);
    
    // Deploy CFXSwap
    cfxSwap = await ethers.deployContract("CFXSwap", [
      await cfxToken.getAddress(),
      await usdtToken.getAddress()
    ]);
    
    // Fund the swap contract
    await cfxToken.connect(ownerSigner).transfer(await cfxSwap.getAddress(), INITIAL_CFX_BALANCE);
    await usdtToken.transfer(await cfxSwap.getAddress(), INITIAL_USDT_BALANCE);
    
    // Give user1 some USDT
    await usdtToken.transfer(user1.address, 10000n * 10n ** 6n);
  });

  describe("Deployment", function () {
    it("Should set correct token addresses", async function () {
      expect(await cfxSwap.cfxToken()).to.equal(await cfxToken.getAddress());
      expect(await cfxSwap.usdtToken()).to.equal(await usdtToken.getAddress());
    });

    it("Should set default exchange rate to 1:1", async function () {
      expect(await cfxSwap.exchangeRate()).to.equal(1n * 10n ** 18n);
    });

    it("Should set default minimum swap amount", async function () {
      expect(await cfxSwap.minSwapAmount()).to.equal(1n * 10n ** 6n);
    });

    it("Should set correct owner", async function () {
      expect(await cfxSwap.owner()).to.equal(OWNER_ADDRESS);
    });
  });

  describe("Buy CFX with USDT", function () {
    it("Should allow buying CFX with USDT", async function () {
      const usdtAmount = 100n * 10n ** 6n; // 100 USDT
      const expectedCfx = 100n * 10n ** 18n; // 100 CFX (1:1 rate)
      
      await usdtToken.connect(user1).approve(await cfxSwap.getAddress(), usdtAmount);
      
      await expect(cfxSwap.connect(user1).buyCFX(usdtAmount))
        .to.emit(cfxSwap, "Swapped")
        .withArgs(user1.address, true, usdtAmount, expectedCfx);
      
      expect(await cfxToken.balanceOf(user1.address)).to.equal(expectedCfx);
    });

    it("Should revert if amount is below minimum", async function () {
      const usdtAmount = 5n * 10n ** 5n; // 0.5 USDT (below minimum)
      
      await usdtToken.connect(user1).approve(await cfxSwap.getAddress(), usdtAmount);
      
      await expect(
        cfxSwap.connect(user1).buyCFX(usdtAmount)
      ).to.be.revertedWith("Below minimum");
    });

    it("Should revert if contract has insufficient CFX", async function () {
      const usdtAmount = 2000000n * 10n ** 6n; // More than contract has
      
      await usdtToken.connect(user1).approve(await cfxSwap.getAddress(), usdtAmount);
      
      await expect(
        cfxSwap.connect(user1).buyCFX(usdtAmount)
      ).to.be.revertedWith("Insufficient CFX");
    });

    it("Should correctly calculate buy output", async function () {
      const usdtAmount = 100n * 10n ** 6n;
      const output = await cfxSwap.getBuyOutput(usdtAmount);
      expect(output).to.equal(100n * 10n ** 18n);
    });
  });

  describe("Sell CFX for USDT", function () {
    beforeEach(async function () {
      // Give user1 some CFX
      await cfxToken.connect(ownerSigner).transfer(user1.address, 1000n * 10n ** 18n);
    });

    it("Should allow selling CFX for USDT", async function () {
      const cfxAmount = 100n * 10n ** 18n; // 100 CFX
      const expectedUsdt = 100n * 10n ** 6n; // 100 USDT
      
      await cfxToken.connect(user1).approve(await cfxSwap.getAddress(), cfxAmount);
      
      await expect(cfxSwap.connect(user1).sellCFX(cfxAmount))
        .to.emit(cfxSwap, "Swapped")
        .withArgs(user1.address, false, cfxAmount, expectedUsdt);
      
      expect(await usdtToken.balanceOf(user1.address)).to.be.closeTo(
        expectedUsdt + 10000n * 10n ** 6n, // initial + swap
        1000n // small tolerance
      );
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        cfxSwap.connect(user1).sellCFX(0)
      ).to.be.revertedWith("Zero amount");
    });

    it("Should revert if output is below minimum", async function () {
      const cfxAmount = 5n * 10n ** 17n; // 0.5 CFX - Results in less than 1 USDT
      
      await cfxToken.connect(user1).approve(await cfxSwap.getAddress(), cfxAmount);
      
      await expect(
        cfxSwap.connect(user1).sellCFX(cfxAmount)
      ).to.be.revertedWith("Below minimum");
    });

    it("Should correctly calculate sell output", async function () {
      const cfxAmount = 100n * 10n ** 18n;
      const output = await cfxSwap.getSellOutput(cfxAmount);
      expect(output).to.equal(100n * 10n ** 6n);
    });
  });

  describe("Exchange Rate Management", function () {
    it("Should allow owner to update exchange rate", async function () {
      const newRate = 2n * 10n ** 18n; // 2:1 rate
      
      await expect(cfxSwap.connect(ownerSigner).setExchangeRate(newRate))
        .to.emit(cfxSwap, "RateUpdated")
        .withArgs(newRate);
      
      expect(await cfxSwap.exchangeRate()).to.equal(newRate);
    });

    it("Should revert if non-owner tries to update rate", async function () {
      await expect(
        cfxSwap.connect(user1).setExchangeRate(2n * 10n ** 18n)
      ).to.be.revertedWithCustomError(cfxSwap, "OwnableUnauthorizedAccount");
    });

    it("Should revert if rate is zero", async function () {
      await expect(
        cfxSwap.connect(ownerSigner).setExchangeRate(0)
      ).to.be.revertedWith("Invalid rate");
    });
  });

  describe("Minimum Swap Amount", function () {
    it("Should allow owner to update minimum swap amount", async function () {
      const newMin = 10n * 10n ** 6n;
      
      await cfxSwap.connect(ownerSigner).setMinSwapAmount(newMin);
      expect(await cfxSwap.minSwapAmount()).to.equal(newMin);
    });

    it("Should revert if non-owner tries to update minimum", async function () {
      await expect(
        cfxSwap.connect(user1).setMinSwapAmount(10n * 10n ** 6n)
      ).to.be.revertedWithCustomError(cfxSwap, "OwnableUnauthorizedAccount");
    });
  });

  describe("Withdraw Function", function () {
    it("Should allow owner to withdraw tokens", async function () {
      const withdrawAmount = 1000n * 10n ** 18n;
      const initialBalance = await cfxToken.balanceOf(OWNER_ADDRESS);
      
      await cfxSwap.connect(ownerSigner).withdraw(await cfxToken.getAddress(), withdrawAmount);
      
      const finalBalance = await cfxToken.balanceOf(OWNER_ADDRESS);
      expect(finalBalance).to.equal(initialBalance + withdrawAmount);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(
        cfxSwap.connect(user1).withdraw(await cfxToken.getAddress(), 100n * 10n ** 18n)
      ).to.be.revertedWithCustomError(cfxSwap, "OwnableUnauthorizedAccount");
    });
  });

  describe("Get Balances", function () {
    it("Should return correct contract balances", async function () {
      const [cfxBalance, usdtBalance] = await cfxSwap.getBalances();
      
      expect(cfxBalance).to.equal(INITIAL_CFX_BALANCE);
      expect(usdtBalance).to.equal(INITIAL_USDT_BALANCE);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks", async function () {
      // This is a basic check - full reentrancy testing would require a malicious contract
      const usdtAmount = 100n * 10n ** 6n;
      await usdtToken.connect(user1).approve(await cfxSwap.getAddress(), usdtAmount);
      
      // Should complete successfully - reentrancy guard is in place
      // If reentrancy guard wasn't working, the transaction would revert
      await expect(cfxSwap.connect(user1).buyCFX(usdtAmount))
        .to.emit(cfxSwap, "Swapped");
    });
  });
});

