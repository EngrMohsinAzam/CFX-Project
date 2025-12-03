import * as dotenv from "dotenv";
dotenv.config();

import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-ignition-ethers";
import "@nomicfoundation/hardhat-verify";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
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
  },
  etherscan: {
  apiKey: {
    bscTestnet: "3KP1XTM23ET3KHIENBXCBC5HWEMRENXNCT",
    bsc: "3KP1XTM23ET3KHIENBXCBC5HWEMRENXNCT",
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
    }
  ]
},
  sourcify: {
    enabled: false
  }
};

export default config;