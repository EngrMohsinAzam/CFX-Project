import * as fs from "fs";
import * as path from "path";

/**
 * Helper script to generate a template JSON file for price feeds
 * 
 * Usage:
 * npx ts-node scripts/generate-price-feeds-template.ts
 * 
 * This will create a price-feeds-template.json file that you can fill in
 * with your actual token addresses and Chainlink feed addresses or DEX pair addresses
 */

interface PriceFeedConfig {
  token: string;
  feed: string;
  type: "chainlink" | "dex";
  name?: string; // Optional: token name for reference
}

function generateTemplate() {
  const template: PriceFeedConfig[] = [];
  
  // Generate 200 placeholder entries
  for (let i = 1; i <= 200; i++) {
    template.push({
      token: `0x${"0".repeat(40)}`, // Replace with actual token address
      feed: `0x${"0".repeat(40)}`, // Replace with Chainlink feed or DEX pair address
      type: "chainlink", // or "dex"
      name: `Token${i}`, // Optional: for your reference
    });
  }

  const outputPath = path.join(__dirname, "..", "price-feeds-template.json");
  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
  
  console.log(`✅ Generated template file: ${outputPath}`);
  console.log(`📝 Fill in the token and feed addresses, then use it in your .env:`);
  console.log(`   PRICE_FEEDS_JSON='${JSON.stringify(template).replace(/'/g, "\\'")}'`);
  console.log(`\nOr load it directly in the script.`);
}

generateTemplate();


