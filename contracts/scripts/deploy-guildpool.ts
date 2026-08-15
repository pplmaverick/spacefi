import { ethers, network } from "hardhat";
import { saveDeployment } from "./utils/deployment";

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  // 從 deployment.json 讀 SpaceFinance 地址
  const { loadDeployment } = await import("./utils/deployment");
  const existing = loadDeployment();
  const spaceFinance = existing.cc3?.spaceFinance;
  if (!spaceFinance) throw new Error("SpaceFinance address not found in deployment.json");

  const GuildPool = await ethers.getContractFactory("GuildPool");
  const guildPool = await GuildPool.deploy(deployer.address, spaceFinance);
  await guildPool.waitForDeployment();
  const guildPoolAddress = await guildPool.getAddress();

  console.log(`GuildPool deployed to: ${guildPoolAddress}`);
  saveDeployment("cc3", { ...existing.cc3, guildPool: guildPoolAddress });
}

main().catch(console.error);
