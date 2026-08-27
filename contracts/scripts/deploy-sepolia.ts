import { ethers, network } from "hardhat";
import { saveDeployment } from "./utils/deployment";

// Used only until deploy-sepolia-writeability.ts deploys the real Inbox and swaps it in via
// CollateralVault.setTrustedInbox — same "deploy now, wire later" pattern deploy-cc3.ts uses for
// its own placeholder Sepolia addresses. Never actually callable as an Inbox (it's a dead address),
// so it can't cause a spurious message delivery in between.
const PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * Deploys the Sepolia-side (collateral) contracts: CollateralVault + NodeRegistry.
 * Usage: npx hardhat run scripts/deploy-sepolia.ts --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(PLACEHOLDER_ADDRESS, deployer.address, SEPOLIA_ETH_USD_FEED);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`\nCollateralVault deployed to: ${vaultAddress}`);
  console.log(
    "  (trusted inbox is a placeholder for now — run deploy-sepolia-writeability.ts after " +
      "deploy-cc3.ts to wire up the real Inbox)"
  );

  const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
  const registry = await NodeRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`NodeRegistry deployed to:    ${registryAddress}`);

  saveDeployment("sepolia", {
    chainId: Number(net.chainId),
    collateralVault: vaultAddress,
    nodeRegistry: registryAddress,
  });

  console.log("\n=== Sepolia deployment summary ===");
  console.log(`CollateralVault: ${vaultAddress}`);
  console.log(`NodeRegistry:    ${registryAddress}`);
  console.log(
    "\nNext: run deploy-cc3.ts (it will pick these addresses up automatically from deployment.json)."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
