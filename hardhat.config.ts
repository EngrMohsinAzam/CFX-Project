import * as dotenv from "dotenv";
dotenv.config();

import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-ignition-ethers";
import "@nomicfoundation/hardhat-verify";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
    },
    bscMainnet: {
      type: "http",
      chainType: "l1",
      url: "https://bsc-dataseed1.binance.org/",
      chainId: 56,
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
    },
    xrplMainnet: {
      type: "http",
      chainType: "l1",
      // IMPORTANT: Alchemy does NOT support XRPL EVM - always use direct RPC
      url: "https://rpc.xrplevm.org",
      chainId: 1440000,
      currency: "XRP",
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
      timeout: 180000, // 3 minutes for large deployments
      // XRPL EVM Mainnet Configuration
      // RPC: https://rpc.xrplevm.org
      // Explorer: https://explorer.xrplevm.org
      // Chain ID: 1440000
    },
    xrplTestnet: {
      type: "http",
      chainType: "l1",
      // IMPORTANT: Alchemy does NOT support XRPL EVM - always use direct RPC
      url: "https://rpc.testnet.xrplevm.org",
      chainId: 1449000,
      currency: "XRP",
      accounts: process.env.BSC_PRIVATE_KEY ? [process.env.BSC_PRIVATE_KEY] : [],
      timeout: 180000, // 3 minutes
      // XRPL EVM Testnet Configuration
      // RPC: https://rpc.testnet.xrplevm.org
      // Explorer: https://explorer.testnet.xrplevm.org
      // Chain ID: 1449000
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSC_API_KEY || "3KP1XTM23ET3KHIENBXCBC5HWEMRENXNCT",
      bsc: process.env.BSC_API_KEY || "3KP1XTM23ET3KHIENBXCBC5HWEMRENXNCT",
      xrplMainnet: process.env.XRPL_MAINNET_API_KEY || "",
      xrplTestnet: process.env.XRPL_TESTNET_API_KEY || "",
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      },
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com"
        }
      },
      {
        network: "xrplMainnet",
        chainId: 1440000,
        urls: {
          apiURL: "https://explorer.xrplevm.org/api",
          browserURL: "https://explorer.xrplevm.org"
        }
      },
      {
        network: "xrplTestnet",
        chainId: 1449000,
        urls: {
          apiURL: "https://explorer.testnet.xrplevm.org/api",
          browserURL: "https://explorer.testnet.xrplevm.org"
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  }
};

export default config;