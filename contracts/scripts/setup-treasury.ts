import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { loadDeployment } from "./utils/deployment";
import MockPayoutTokenAbi from "../artifacts/contracts/cc3/mocks/MockPayoutToken.sol/MockPayoutToken.json";

async function main() {
  const deployment = loadDeployment();
  const privateKey = process.env.PRIVATE_KEY!;
  const cc3RpcUrl = process.env.CC3_TESTNET_RPC_URL!;

  const provider = new ethers.JsonRpcProvider(cc3RpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const payoutToken = new ethers.Contract(
    deployment.cc3!.mockPayoutToken!,
    MockPayoutTokenAbi.abi,
    wallet
  );

  const amount = ethers.parseUnits("10000", 18);

  console.log("Minting 10000 mUSDF to treasury...");
  const mintTx = await payoutToken.mint(wallet.address, amount);
  await mintTx.wait();
  console.log(`Mint tx: ${mintTx.hash}`);

  console.log("Approving SpaceFinance to spend mUSDF...");
  const approveTx = await payoutToken.approve(deployment.cc3!.spaceFinance!, amount);
  await approveTx.wait();
  console.log(`Approve tx: ${approveTx.hash}`);

  console.log("✅ Treasury setup complete");
}

main().catch(console.error);
