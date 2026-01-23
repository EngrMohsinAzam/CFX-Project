import { parseEther as ethersParseEther, parseUnits as ethersParseUnits, formatEther as ethersFormatEther, formatUnits as ethersFormatUnits } from "ethers";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const OWNER_ADDRESS = "0x5E66Dd4d6FCce965E8F55Cc0D8749badA0D9a329";

export async function increaseTime(provider: any, seconds: number) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

export async function setNextBlockTimestamp(provider: any, timestamp: number) {
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await provider.send("evm_mine", []);
}

export function parseEther(amount: string) {
  return ethersParseEther(amount);
}

export function parseUnits(amount: string, decimals: number) {
  return ethersParseUnits(amount, decimals);
}

export function formatEther(amount: bigint) {
  return ethersFormatEther(amount);
}

export function formatUnits(amount: bigint, decimals: number) {
  return ethersFormatUnits(amount, decimals);
}

