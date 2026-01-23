import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PETTokenModule", (m) => {
  // Deploy PETToken implementation contract (for cloning)
  // This is the implementation that will be cloned by PairVaultFactory
  const petToken = m.contract("PETToken", []);
  
  return { petToken };
});

