import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { loadDeployment } from "./utils/deployment";
import { generateProofFor, computeGasLimitForSpaceFinance, submitProofToSpaceFinance } from "./utils/usc";

import CollateralVaultAbi from "../artifacts/contracts/sepolia/CollateralVault.sol/CollateralVault.json";
import NodeRegistryAbi from "../artifacts/contracts/sepolia/NodeRegistry.sol/NodeRegistry.json";
import SpaceFinanceAbi from "../artifacts/contracts/cc3/SpaceFinance.sol/SpaceFinance.json";
import MockPayoutTokenAbi from "../artifacts/contracts/cc3/mocks/MockPayoutToken.sol/MockPayoutToken.json";

// Deposit a small amount — the test wallet's Sepolia ETH is shared across every tutorial run
// this session, keep it modest.
const DEPOSIT_ETH = "0.001";
const NODE_ID = ethers.keccak256(ethers.toUtf8Bytes("spacefi-demo-node-1"));

const Actions = {
  CollateralDeposited: 0,
  NodeRegistered: 1,
} as const;

const LoanStatus = ["None", "CollateralVerified", "NodeVerified", "Active", "Repaid"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not configured`);
  return value;
}

async function main() {
  const deployment = loadDeployment();
  if (!deployment.sepolia?.collateralVault || !deployment.sepolia?.nodeRegistry) {
    throw new Error("deployment.json is missing sepolia.collateralVault / sepolia.nodeRegistry — run deploy-sepolia.ts first");
  }
  if (!deployment.cc3?.spaceFinance || !deployment.cc3?.mockPayoutToken) {
    throw new Error("deployment.json is missing cc3.spaceFinance / cc3.mockPayoutToken — run deploy-cc3.ts first");
  }

  const privateKey = requireEnv("PRIVATE_KEY");
  const sepoliaRpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const cc3RpcUrl = requireEnv("CC3_TESTNET_RPC_URL");
  const proofBuilderUrl = requireEnv("PROOF_BUILDER_URL");
  const chainKey = Number(process.env.SOURCE_CHAIN_KEY ?? "1");

  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
  const ccProvider = new ethers.JsonRpcProvider(cc3RpcUrl);

  const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);
  const ccWallet = new ethers.Wallet(privateKey, ccProvider);

  // Same wallet plays both borrower (Sepolia) and node operator (Sepolia) — SpaceFinance's
  // borrowerToLoanId mapping assumes operator == borrower, see SpaceFinance.sol design notes.
  console.log(`Borrower / operator wallet: ${sepoliaWallet.address}`);

  const collateralVault = new ethers.Contract(deployment.sepolia.collateralVault, CollateralVaultAbi.abi, sepoliaWallet);
  const nodeRegistry = new ethers.Contract(deployment.sepolia.nodeRegistry, NodeRegistryAbi.abi, sepoliaWallet);
  const spaceFinance = new ethers.Contract(deployment.cc3.spaceFinance, SpaceFinanceAbi.abi, ccWallet);
  const payoutToken = new ethers.Contract(deployment.cc3.mockPayoutToken, MockPayoutTokenAbi.abi, ccProvider);

  // ─── Step 1: deposit collateral on Sepolia ──────────────────────────────────
  console.log(`\n[1/6] Depositing ${DEPOSIT_ETH} ETH into CollateralVault...`);
  const depositTx = await collateralVault.deposit({ value: ethers.parseEther(DEPOSIT_ETH) });
  const depositReceipt = await depositTx.wait();
  console.log(`Deposit tx mined: ${depositTx.hash} (block ${depositReceipt.blockNumber})`);

  const depositedEvent = depositReceipt.logs
    .map((log: any) => {
      try {
        return collateralVault.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find((parsed: any) => parsed?.name === "Deposited");

  if (!depositedEvent) throw new Error("Deposited event not found in deposit receipt");
  const loanId = depositedEvent.args.loanId as bigint;
  console.log(`Deposited event: borrower=${depositedEvent.args.borrower}, amount=${depositedEvent.args.amount}, loanId=${loanId}`);

  // ─── Step 2: register node identity on Sepolia ──────────────────────────────
  console.log(`\n[2/6] Registering node ${NODE_ID}...`);
  const registerTx = await nodeRegistry.registerNode(NODE_ID);
  const registerReceipt = await registerTx.wait();
  console.log(`registerNode tx mined: ${registerTx.hash} (block ${registerReceipt.blockNumber})`);

  // ─── Step 3: generate both USC proofs in parallel ───────────────────────────
  // Both Sepolia txs need to wait for attestation independently — running the two waits
  // concurrently instead of sequentially roughly halves the total wait (one ~8-10min window
  // instead of two back-to-back). Submission order to SpaceFinance is still enforced below
  // (CollateralDeposited must land before NodeRegistered, since the latter requires the loan to
  // already be in CollateralVerified status).
  console.log(`\n[3/6] Generating USC proofs for both txs in parallel (this is the ~8-10min wait)...`);
  const [depositProof, nodeProof] = await Promise.all([
    generateProofFor(depositTx.hash, chainKey, proofBuilderUrl, ccProvider, sepoliaProvider),
    generateProofFor(registerTx.hash, chainKey, proofBuilderUrl, ccProvider, sepoliaProvider),
  ]);

  if (!depositProof.success || !depositProof.data) {
    throw new Error(`Failed to generate proof for deposit tx: ${depositProof.error}`);
  }
  if (!nodeProof.success || !nodeProof.data) {
    throw new Error(`Failed to generate proof for registerNode tx: ${nodeProof.error}`);
  }

  // ─── Step 4: submit both proofs to SpaceFinance, in order ───────────────────
  console.log(`\n[4/6] Submitting CollateralDeposited proof (loanId ${loanId})...`);
  const depositGasLimit = await computeGasLimitForSpaceFinance(
    ccProvider,
    spaceFinance,
    Actions.CollateralDeposited,
    depositProof.data,
    ccWallet.address
  );
  const depositExecuteTx = await submitProofToSpaceFinance(
    spaceFinance,
    Actions.CollateralDeposited,
    depositProof.data,
    depositGasLimit
  );
  console.log(`Waiting for CC3 execute() tx to be mined: ${depositExecuteTx.hash}`);
  await depositExecuteTx.wait();
  console.log(`CollateralDeposited proved on CC3: ${depositExecuteTx.hash}`);

  let loan = await spaceFinance.getLoan(loanId);
  console.log(`Loan ${loanId} status: ${LoanStatus[Number(loan.status)]}`);

  console.log(`\nSubmitting NodeRegistered proof...`);
  const nodeGasLimit = await computeGasLimitForSpaceFinance(
    ccProvider,
    spaceFinance,
    Actions.NodeRegistered,
    nodeProof.data,
    ccWallet.address
  );
  const nodeExecuteTx = await submitProofToSpaceFinance(spaceFinance, Actions.NodeRegistered, nodeProof.data, nodeGasLimit);
  console.log(`Waiting for CC3 execute() tx to be mined: ${nodeExecuteTx.hash}`);
  await nodeExecuteTx.wait();
  console.log(`NodeRegistered proved on CC3: ${nodeExecuteTx.hash} (this should also trigger disbursement)`);

  // ─── Step 5: confirm loan status ────────────────────────────────────────────
  console.log(`\n[5/6] Checking final loan status...`);
  loan = await spaceFinance.getLoan(loanId);
  console.log(`Loan ${loanId}:`, {
    borrower: loan.borrower,
    collateralAmount: loan.collateralAmount.toString(),
    nodeId: loan.nodeId,
    status: LoanStatus[Number(loan.status)],
  });
  if (Number(loan.status) !== 3) {
    throw new Error(`Expected loan status Active(3), got ${LoanStatus[Number(loan.status)]}`);
  }

  // ─── Step 6: confirm payout ──────────────────────────────────────────────────
  console.log(`\n[6/6] Checking borrower's mUSDF balance...`);
  const balance = await payoutToken.balanceOf(sepoliaWallet.address);
  console.log(`Borrower mUSDF balance: ${ethers.formatUnits(balance, 18)} mUSDF`);

  console.log("\n✅ e2e flow complete: deposit -> register node -> USC verify (x2) -> Active -> disbursed");
}

main().catch((error) => {
  console.error("\n❌ e2e flow failed:", error);
  process.exitCode = 1;
});
