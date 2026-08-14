import { ethers, network } from "hardhat";
import { saveDeployment } from "./utils/deployment";

/**
 * Deploys the Sepolia-side (collateral) contracts: CollateralVault + NodeRegistry.
 * Usage: npx hardhat run scripts/deploy-sepolia.ts --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`\nCollateralVault deployed to: ${vaultAddress}`);

  const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
  const registry = await NodeRegistry.deploy();
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
