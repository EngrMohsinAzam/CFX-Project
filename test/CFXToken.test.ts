import { expect } from "chai";
import { ethers } from "ethers";
import { JsonRpcProvider } from "ethers";
import hre from "hardhat";
import { OWNER_ADDRESS, parseEther } from "./helpers";

// Helper to get ethers signers from Hardhat
async function getSigners() {
  const provider = new JsonRpcProvider(hre.network.provider);
  const accounts = await provider.send("eth_accounts", []);
  return accounts.map((addr: string) => provider.getSigner(addr));
}

describe("CFXToken", function () {
  async function deployCFXTokenFixture() {
    const [owner, user1, user2] = await getSigners();
    
    const logoURI = "ipfs://QmTest123";
    const CFXTokenArtifact = await hre.artifacts.readArtifact("CFXToken");
    const factory = new ethers.ContractFactory(
      CFXTokenArtifact.abi,
      CFXTokenArtifact.bytecode,
      owner
    );
    const cfxToken = await factory.deploy(logoURI);
    await cfxToken.waitForDeployment();
    
    return { cfxToken, owner, user1, user2, logoURI };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial supply", async function () {
      const { cfxToken } = await deployCFXTokenFixture();
      const totalSupply = await cfxToken.totalSupply();
      const expectedSupply = parseEther("20000000000");
      expect(totalSupply).to.equal(expectedSupply);
    });

    it("Should mint initial supply to owner", async function () {
      const { cfxToken } = await deployCFXTokenFixture();
      const ownerBalance = await cfxToken.balanceOf(OWNER_ADDRESS);
      const expectedSupply = parseEther("20000000000");
      expect(ownerBalance).to.equal(expectedSupply);
    });

    it("Should set correct name and symbol", async function () {
      const { cfxToken } = await deployCFXTokenFixture();
      expect(await cfxToken.name()).to.equal("CFX Token");
      expect(await cfxToken.symbol()).to.equal("CFX");
    });

    it("Should set logo URI", async function () {
      const { cfxToken, logoURI } = await deployCFXTokenFixture();
      expect(await cfxToken.logoURI()).to.equal(logoURI);
    });

    it("Should return correct cap", async function () {
      const { cfxToken } = await deployCFXTokenFixture();
      const cap = await cfxToken.cap();
      const expectedSupply = parseEther("20000000000");
      expect(cap).to.equal(expectedSupply);
    });
  });

  describe("Burning", function () {
    it("Should allow users to burn their own tokens", async function () {
      const { cfxToken, user1 } = await deployCFXTokenFixture();
      
      const transferAmount = parseEther("1000");
      await (await cfxToken.transfer(await user1.getAddress(), transferAmount)).wait();
      
      const burnAmount = parseEther("100");
      const balanceBefore = await cfxToken.balanceOf(await user1.getAddress());
      
      const tx = await cfxToken.connect(user1).burn(burnAmount);
      await expect(tx).to.emit(cfxToken, "TokensBurned").withArgs(await user1.getAddress(), burnAmount);
      
      const balanceAfter = await cfxToken.balanceOf(await user1.getAddress());
      expect(balanceAfter).to.equal(balanceBefore - burnAmount);
    });

    it("Should revert when burning zero amount", async function () {
      const { cfxToken, user1 } = await deployCFXTokenFixture();
      
      await (await cfxToken.transfer(await user1.getAddress(), parseEther("1000"))).wait();
      
      await expect(cfxToken.connect(user1).burn(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert when burning more than balance", async function () {
      const { cfxToken, user1 } = await deployCFXTokenFixture();
      
      await (await cfxToken.transfer(await user1.getAddress(), parseEther("1000"))).wait();
      
      await expect(cfxToken.connect(user1).burn(parseEther("2000")))
        .to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Logo URI Management", function () {
    it("Should allow owner to update logo URI", async function () {
      const { cfxToken } = await deployCFXTokenFixture();
      
      const newLogoURI = "ipfs://QmNewLogo";
      const tx = await cfxToken.setLogoURI(newLogoURI);
      await expect(tx).to.emit(cfxToken, "LogoURIUpdated").withArgs(newLogoURI);
      
      expect(await cfxToken.logoURI()).to.equal(newLogoURI);
    });

    it("Should revert when non-owner tries to update logo URI", async function () {
      const { cfxToken, user1 } = await deployCFXTokenFixture();
      
      await expect(cfxToken.connect(user1).setLogoURI("ipfs://QmNewLogo"))
        .to.be.revertedWithCustomError(cfxToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("ERC20 Functionality", function () {
    it("Should transfer tokens correctly", async function () {
      const { cfxToken, user1 } = await deployCFXTokenFixture();
      
      const amount = parseEther("1000");
      await (await cfxToken.transfer(await user1.getAddress(), amount)).wait();
      
      expect(await cfxToken.balanceOf(await user1.getAddress())).to.equal(amount);
    });

    it("Should approve and transferFrom correctly", async function () {
      const { cfxToken, user1, user2 } = await deployCFXTokenFixture();
      
      const amount = parseEther("1000");
      await (await cfxToken.transfer(await user1.getAddress(), amount)).wait();
      
      await (await cfxToken.connect(user1).approve(await user2.getAddress(), amount)).wait();
      await (await cfxToken.connect(user2).transferFrom(await user1.getAddress(), await user2.getAddress(), amount)).wait();
      
      expect(await cfxToken.balanceOf(await user2.getAddress())).to.equal(amount);
      expect(await cfxToken.balanceOf(await user1.getAddress())).to.equal(0);
    });
  });
});
