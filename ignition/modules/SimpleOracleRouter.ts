import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SimpleOracleRouterModule", (m) => {
  // Deploy SimpleOracleRouter (no constructor parameters)
  const simpleOracleRouter = m.contract("SimpleOracleRouter", []);

  return { simpleOracleRouter };
});

