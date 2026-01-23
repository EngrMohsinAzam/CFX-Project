import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deployment module for 4 contracts: SimpleOracleRouter, PETToken, UniversalPairVault, PairVaultFactory
 * 
 * Usage: 
 * npx hardhat ignition deploy ignition/modules/DeployFourContracts.ts --network xrplTestnet
 * npx hardhat ignition deploy ignition/modules/DeployFourContracts.ts --network xrplMainnet
 * 
 * IMPORTANT: After deploying SimpleOracleRouter, you MUST add at least 200 token price feeds
 * before deploying PairVaultFactory. Use the script:
 * 
 * 1. Deploy SimpleOracleRouter first:
 *    npx hardhat ignition deploy ignition/modules/SimpleOracleRouter.ts --network xrplMainnet
 * 
 * 2. Add price feeds (set ORACLE_ADDRESS in .env):
 *    npx hardhat run scripts/add-price-feeds.ts --network xrplMainnet
 * 
 * 3. Then deploy remaining contracts:
 *    npx hardhat ignition deploy ignition/modules/DeployFourContracts.ts --network xrplMainnet
 * 
 * Note: CFXToken address is hardcoded in this script (rKDiWp7vSpq1QzV4jK6s66r81aSTaoYoPF)
 * 
 * See DEPLOYMENT_WITH_PRICE_FEEDS.md for detailed instructions
 */
export default buildModule("DeployFourContractsModule", (m) => {
  // Step 1: Deploy SimpleOracleRouter (no dependencies)
  const simpleOracleRouter = m.contract("SimpleOracleRouter", []);
  
  // Step 2: Deploy PETToken implementation (for cloning)
  const petToken = m.contract("PETToken", []);
  
  // Step 3: Deploy UniversalPairVault implementation (for cloning)
  const universalPairVault = m.contract("UniversalPairVault", []);
  
  // Step 4: Deploy PairVaultFactory (requires CFXToken address and all previous contracts)
  // CFX Token address already deployed on XRPL EVM
  const cfxTokenAddress = "rKDiWp7vSpq1QzV4jK6s66r81aSTaoYoPF";
  const pairVaultFactory = m.contract("PairVaultFactory", [
    cfxTokenAddress,
    simpleOracleRouter,
    petToken,
    universalPairVault
  ]);
  
  return {
    simpleOracleRouter,
    petToken,
    universalPairVault,
    pairVaultFactory,
  };
});

