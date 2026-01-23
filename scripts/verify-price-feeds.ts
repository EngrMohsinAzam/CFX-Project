import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Script to verify price feeds in SimpleOracleRouter
 * 
 * Usage:
 * npx hardhat run scripts/verify-price-feeds.ts --network xrplMainnet
 */

async function main() {
  const oracleAddress = process.env.ORACLE_ADDRESS;
  if (!oracleAddress) {
    throw new Error("ORACLE_ADDRESS must be set in .env file");
  }

  console.log(`Verifying price feeds in SimpleOracleRouter at: ${oracleAddress}`);

  const SimpleOracleRouter = await ethers.getContractAt(
    "SimpleOracleRouter",
    oracleAddress
  );

  // Get price feeds from environment
  let priceFeeds: Array<{ token: string; feed: string; type: string }> = [];
  
  if (process.env.PRICE_FEEDS_JSON) {
    try {
      priceFeeds = JSON.parse(process.env.PRICE_FEEDS_JSON);
    } catch (e) {
      throw new Error("Invalid PRICE_FEEDS_JSON format.");
    }
  } else {
    console.log("⚠️  No PRICE_FEEDS_JSON provided. Cannot verify specific feeds.");
    console.log("⚠️  This script requires PRICE_FEEDS_JSON to verify feeds.");
    return;
  }

  console.log(`\nVerifying ${priceFeeds.length} price feeds...\n`);

  let verifiedCount = 0;
  let failedCount = 0;
  const failedFeeds: string[] = [];

  for (let i = 0; i < priceFeeds.length; i++) {
    const feed = priceFeeds[i];
    const hasPrice = await SimpleOracleRouter.hasPrice(feed.token);
    
    if (hasPrice) {
      verifiedCount++;
      const sourceType = await SimpleOracleRouter.getPriceSourceType(feed.token);
      const sourceAddress = await SimpleOracleRouter.getPriceSource(feed.token);
      
      const typeName = sourceType === 1 ? "Chainlink" : sourceType === 2 ? "DEX" : "Unknown";
      console.log(`✓ [${i + 1}/${priceFeeds.length}] ${feed.token.slice(0, 10)}... - ${typeName} (${sourceAddress.slice(0, 10)}...)`);
    } else {
      failedCount++;
      failedFeeds.push(feed.token);
      console.log(`✗ [${i + 1}/${priceFeeds.length}] ${feed.token.slice(0, 10)}... - NO PRICE SOURCE`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Verified: ${verifiedCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  console.log(`   📈 Total: ${priceFeeds.length}`);

  if (verifiedCount < 200) {
    console.log(`\n⚠️  WARNING: Only ${verifiedCount} feeds verified, but need at least 200.`);
    if (failedFeeds.length > 0) {
      console.log(`\nFailed feeds:`);
      failedFeeds.slice(0, 10).forEach((feed) => console.log(`  - ${feed}`));
      if (failedFeeds.length > 10) {
        console.log(`  ... and ${failedFeeds.length - 10} more`);
      }
    }
  } else {
    console.log(`\n✅ SUCCESS: ${verifiedCount} price feeds verified (meets minimum requirement of 200)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


