import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Script to add price feeds to SimpleOracleRouter
 * 
 * Usage:
 * npx hardhat run scripts/add-price-feeds.ts --network xrplMainnet
 * 
 * Make sure to set ORACLE_ADDRESS in .env file
 * 
 * You can provide price feeds via:
 * 1. PRICE_FEEDS_JSON environment variable (JSON string)
 * 2. Or modify this script to include your token/feed pairs
 */

interface PriceFeedConfig {
  token: string;
  feed: string; // Chainlink feed address or DEX pair address
  type: "chainlink" | "dex";
}

async function main() {
  const oracleAddress = process.env.ORACLE_ADDRESS;
  if (!oracleAddress) {
    throw new Error("ORACLE_ADDRESS must be set in .env file");
  }

  console.log(`Connecting to SimpleOracleRouter at: ${oracleAddress}`);

  const SimpleOracleRouter = await ethers.getContractAt(
    "SimpleOracleRouter",
    oracleAddress
  );

  // Check current owner
  const owner = await SimpleOracleRouter.owner();
  const [deployer] = await ethers.getSigners();
  
  console.log(`Oracle Owner: ${owner}`);
  console.log(`Deployer Address: ${deployer.address}`);
  
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer (${deployer.address}) is not the oracle owner (${owner}). ` +
      `Only the owner can add price feeds.`
    );
  }

  // Get price feeds from environment or use default configuration
  let priceFeeds: PriceFeedConfig[] = [];
  
  if (process.env.PRICE_FEEDS_JSON) {
    try {
      priceFeeds = JSON.parse(process.env.PRICE_FEEDS_JSON);
    } catch (e) {
      throw new Error("Invalid PRICE_FEEDS_JSON format. Must be valid JSON array.");
    }
  } else {
    // Default: You need to provide at least 200 token/feed pairs
    // This is a template - replace with your actual token addresses and feeds
    console.log("⚠️  No PRICE_FEEDS_JSON provided. Using empty array.");
    console.log("⚠️  You need to provide at least 200 price feeds.");
    console.log("⚠️  Set PRICE_FEEDS_JSON in .env with format:");
    console.log(`PRICE_FEEDS_JSON='[{"token":"0x...","feed":"0x...","type":"chainlink"},...]'`);
  }

  if (priceFeeds.length < 200) {
    throw new Error(
      `Insufficient price feeds. Need at least 200, but only ${priceFeeds.length} provided.`
    );
  }

  console.log(`\nAdding ${priceFeeds.length} price feeds...`);

  // Separate Chainlink feeds and DEX pairs
  const chainlinkFeeds: PriceFeedConfig[] = priceFeeds.filter(
    (pf) => pf.type === "chainlink"
  );
  const dexPairs: PriceFeedConfig[] = priceFeeds.filter(
    (pf) => pf.type === "dex"
  );

  // Add Chainlink feeds in batches (to avoid gas limits)
  if (chainlinkFeeds.length > 0) {
    console.log(`\nAdding ${chainlinkFeeds.length} Chainlink feeds...`);
    
    const BATCH_SIZE = 50; // Process in batches to avoid gas limits
    for (let i = 0; i < chainlinkFeeds.length; i += BATCH_SIZE) {
      const batch = chainlinkFeeds.slice(i, i + BATCH_SIZE);
      const tokens = batch.map((pf) => pf.token);
      const feeds = batch.map((pf) => pf.feed);

      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Adding ${batch.length} feeds...`);
      
      const tx = await SimpleOracleRouter.batchAddChainlinkFeeds(tokens, feeds);
      await tx.wait();
      
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} completed. Tx: ${tx.hash}`);
    }
  }

  // Add DEX pairs one by one (no batch function available)
  if (dexPairs.length > 0) {
    console.log(`\nAdding ${dexPairs.length} DEX pairs...`);
    
    for (let i = 0; i < dexPairs.length; i++) {
      const pair = dexPairs[i];
      console.log(`  ${i + 1}/${dexPairs.length}: Adding DEX pair for token ${pair.token}...`);
      
      const tx = await SimpleOracleRouter.addDEXPair(pair.token, pair.feed);
      await tx.wait();
      
      console.log(`  ✓ DEX pair ${i + 1} added. Tx: ${tx.hash}`);
    }
  }

  // Verify feeds were added
  console.log("\n✓ Verifying price feeds...");
  let verifiedCount = 0;
  for (const feed of priceFeeds) {
    const hasPrice = await SimpleOracleRouter.hasPrice(feed.token);
    if (hasPrice) {
      verifiedCount++;
    }
  }

  console.log(`\n✅ Successfully added and verified ${verifiedCount}/${priceFeeds.length} price feeds`);
  
  if (verifiedCount < 200) {
    throw new Error(
      `Verification failed: Only ${verifiedCount} feeds verified, but need at least 200.`
    );
  }

  console.log("\n✅ All price feeds successfully added! Oracle is ready for PairVaultFactory deployment.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


