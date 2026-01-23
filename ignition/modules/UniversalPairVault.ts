import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("UniversalPairVaultModule", (m) => {
  // Deploy UniversalPairVault implementation contract (for cloning)
  // This is the implementation that will be cloned by PairVaultFactory
  const universalPairVault = m.contract("UniversalPairVault", []);
  
  return { universalPairVault };
});

