import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CFXTokenModule", (m) => {
  // Deploy CFXToken - constructor takes no parameters
  // Tokens will be minted later using the mint() function
  const cfxToken = m.contract("CFXToken", []);
  
  return { cfxToken };
});
