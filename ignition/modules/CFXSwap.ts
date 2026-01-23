import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CFXSwapModule", (m) => {
  // CFX Token address on XRPL EVM Mainnet (already deployed)
  const cfxTokenAddress = "0xe63718fD395564b87B310cD3e374ca554BaF5F55";
  
  // Deploy CFXSwap - only needs CFX token address
  // Contract allows buying CFX with native XRP
  const cfxSwap = m.contract("CFXSwap", [cfxTokenAddress]);
  
  return { cfxSwap };
});
