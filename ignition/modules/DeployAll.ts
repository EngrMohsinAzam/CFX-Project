import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Complete deployment module that deploys all contracts in the correct order
 * Usage: npx hardhat ignition deploy ignition/modules/DeployAll.ts --network xrplTestnet
 */
export default buildModule("DeployAllModule", (m) => {
  // Step 1: Deploy SimpleOracleRouter (no dependencies)
  const simpleOracleRouter = m.contract("SimpleOracleRouter", []);
  
  // Step 2: Deploy CFXToken
  const logoURI = process.env.CFX_LOGO_URI || "ipfs://bafybeifosoop4gtxof3k7pqrug2mrlrzbgtr6fsspcyh3e2j2iudcfsynm";
  const cfxToken = m.contract("CFXToken", [logoURI]);
  
  // Step 3: Deploy PETToken implementation
  const petToken = m.contract("PETToken", []);
  
  // Step 4: Deploy UniversalPairVault implementation
  const universalPairVault = m.contract("UniversalPairVault", []);
  
  // Step 5: Deploy CFXSwap (requires CFXToken and USDT)
  const usdtAddress = process.env.USDT_ADDRESS || "0x0000000000000000000000000000000000000000";
  if (usdtAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("USDT_ADDRESS must be set in .env file");
  }
  const cfxSwap = m.contract("CFXSwap", [cfxToken, usdtAddress]);
  
  // Step 6: Deploy PairVaultFactory (requires all previous contracts)
  const pairVaultFactory = m.contract("PairVaultFactory", [
    cfxToken,
    simpleOracleRouter,
    petToken,
    universalPairVault
  ]);
  
  return {
    simpleOracleRouter,
    cfxToken,
    petToken,
    universalPairVault,
    cfxSwap,
    pairVaultFactory,
  };
});

