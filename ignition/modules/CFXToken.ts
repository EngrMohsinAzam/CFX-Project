import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CFXTokenModule", (m) => {
  
  // IPFS logo URI from Pinata
  const logoURI = "ipfs://bafybeifosoop4gtxof3k7pqrug2mrlrzbgtr6fsspcyh3e2j2iudcfsynm";
  
  // Deploy CFXToken with logo
  const cfxToken = m.contract("CFXToken", [logoURI]);
  
  return { cfxToken };
});