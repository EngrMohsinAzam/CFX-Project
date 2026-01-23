import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deployment module for PairVaultFactory
 * 
 * This module deploys PairVaultFactory using existing deployed contracts on XRPL EVM Mainnet.
 * Mainnet addresses are hardcoded, but can be overridden via environment variables.
 * 
 * Mainnet Deployed Addresses:
 * - CFXToken: 0xe63718fD395564b87B310cD3e374ca554BaF5F55
 * - SimpleOracleRouter: 0x5e4724CfC90e327de28d570d38550AE4c87C1392
 * - PETToken: 0xDf983ADa4Cf693C3b8fba5F1a2AD1f6fa4d44De6
 * - UniversalPairVault: 0x30C89cfae115d65f309A63f8D18Ad4eC6708F2F9
 * 
 * Environment variables (optional - overrides mainnet addresses):
 * - CFX_TOKEN_ADDRESS: Override CFXToken address
 * - ORACLE_ADDRESS: Override SimpleOracleRouter address
 * - PET_TOKEN_IMPL_ADDRESS: Override PETToken implementation address
 * - VAULT_IMPL_ADDRESS: Override UniversalPairVault implementation address
 * 
 * Usage:
 * npx hardhat ignition deploy ignition/modules/PairVaultFactory.ts --network xrplMainnet
 */
export default buildModule("PairVaultFactoryModule", (m) => {
  // Mainnet deployed addresses (XRPL EVM Mainnet)
  const MAINNET_CFX_TOKEN = "0xe63718fD395564b87B310cD3e374ca554BaF5F55";
  const MAINNET_ORACLE = "0x5e4724CfC90e327de28d570d38550AE4c87C1392";
  const MAINNET_PET_TOKEN = "0xDf983ADa4Cf693C3b8fba5F1a2AD1f6fa4d44De6";
  const MAINNET_VAULT = "0x30C89cfae115d65f309A63f8D18Ad4eC6708F2F9";

  // Use environment variables if provided, otherwise use mainnet addresses or deploy fresh
  const cfxTokenAddress = process.env.CFX_TOKEN_ADDRESS || MAINNET_CFX_TOKEN;
  const oracleAddress = process.env.ORACLE_ADDRESS || MAINNET_ORACLE;
  const petTokenAddress = process.env.PET_TOKEN_IMPL_ADDRESS || MAINNET_PET_TOKEN;
  const vaultAddress = process.env.VAULT_IMPL_ADDRESS || MAINNET_VAULT;

  // Use existing deployed contracts
  const cfxToken = m.contractAt("CFXToken", cfxTokenAddress);
  const oracle = m.contractAt("SimpleOracleRouter", oracleAddress);
  const petToken = m.contractAt("PETToken", petTokenAddress);
  const vault = m.contractAt("UniversalPairVault", vaultAddress);

  // Deploy PairVaultFactory with all required parameters
  const pairVaultFactory = m.contract("PairVaultFactory", [
    cfxToken,
    oracle,
    petToken,
    vault
  ]);

  return {
    cfxToken,
    oracle,
    petToken,
    vault,
    pairVaultFactory,
  };
});
