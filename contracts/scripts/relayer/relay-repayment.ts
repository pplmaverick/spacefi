import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { loadDeployment } from "../utils/deployment";
import { computeInboxMessageHash, decodeEmitterFromTopic, signAsMockAttestors } from "../utils/mockAttestor";

import SpaceFinanceAbi from "../../artifacts/contracts/cc3/SpaceFinance.sol/SpaceFinance.json";
import OutboxAbi from "../../artifacts/usc-write-ability/contracts/write-ability/Outbox.sol/Outbox.json";
import InboxAbi from "../../artifacts/usc-write-ability/contracts/write-ability/Inbox.sol/Inbox.json";

/**
 * The off-chain half of the USC write-ability mock: watches CC3's Outbox for repayment messages
 * SpaceFinance published, has the mock attestor set (MOCK_ATTESTOR_PRIVATE_KEYS) sign them exactly
 * as a real USC attestor node would, and delivers them to the Sepolia Inbox — which is what
 * finally lets CollateralVault auto-authorize the withdrawal. This script stands in for the real
 * attestor network's watch+sign+relay loop; the Outbox/Inbox/EOAValidator contracts it talks to
 * are the genuine `@gluwa/usc-contracts` write-ability contracts, unmodified.
 *
 * Usage: npx hardhat run scripts/relayer/relay-repayment.ts [-- <cc3RepayTxHash>]
 *   - With a tx hash: relays exactly the message that repay() (or markRepaid()) published in it.
 *   - Without one: scans the last CC3_SCAN_BLOCK_WINDOW blocks for RepaymentPublished events and
 *     relays the most recent one Sepolia hasn't already processed.
 */

const CC3_SCAN_BLOCK_WINDOW = 10_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not configured`);
  return value;
}

function loadMockAttestorPrivateKeys(): string[] {
  const raw = requireEnv("MOCK_ATTESTOR_PRIVATE_KEYS");
  const keys = raw.split(",").map((k) => k.trim());
  if (keys.length < 3) {
    throw new Error(`MOCK_ATTESTOR_PRIVATE_KEYS must list at least 3 keys, got ${keys.length}`);
  }
  return keys;
}

async function findMessageIdFromRepayTx(
  spaceFinance: ethers.Contract,
  txHash: string
): Promise<{ messageId: string; loanId: bigint }> {
  const receipt = await spaceFinance.runner!.provider!.getTransactionReceipt(txHash);
  if (!receipt) throw new Error(`Transaction ${txHash} not found on CC3`);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (await spaceFinance.getAddress()).toLowerCase()) continue;
    try {
      const parsed = spaceFinance.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "RepaymentPublished") {
        return { messageId: parsed.args.messageId as string, loanId: parsed.args.loanId as bigint };
      }
    } catch {
      continue;
    }
  }
  throw new Error(`No RepaymentPublished event found in tx ${txHash} — was outbox registered when it ran?`);
}

async function findLatestUnrelayedMessage(
  spaceFinance: ethers.Contract,
  ccProvider: ethers.JsonRpcProvider,
  inbox: ethers.Contract
): Promise<{ messageId: string; loanId: bigint } | null> {
  const latestBlock = await ccProvider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - CC3_SCAN_BLOCK_WINDOW);

  const filter = spaceFinance.filters.RepaymentPublished();
  const events = await spaceFinance.queryFilter(filter, fromBlock, latestBlock);

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as ethers.EventLog;
    const messageId = event.args.messageId as string;
    const processedAt = await inbox.processedAt(messageId);
    if (processedAt === 0n) {
      return { messageId, loanId: event.args.loanId as bigint };
    }
  }
  return null;
}

async function main() {
  const deployment = loadDeployment();
  const outboxAddress = deployment.cc3?.outbox;
  const spaceFinanceAddress = deployment.cc3?.spaceFinance;
  const inboxAddress = deployment.sepolia?.inbox;
  const localChainKey = deployment.sepolia?.writeAbilityChainKey;
  const cc3ChainId = deployment.cc3?.chainId;
  if (!outboxAddress || !spaceFinanceAddress) {
    throw new Error("deployment.json missing cc3.outbox / cc3.spaceFinance — run deploy-cc3-writeability.ts first");
  }
  if (!inboxAddress || !localChainKey || !cc3ChainId) {
    throw new Error("deployment.json missing sepolia.inbox / writeAbilityChainKey, or cc3.chainId");
  }

  const cc3RpcUrl = requireEnv("CC3_TESTNET_RPC_URL");
  const sepoliaRpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const relayerPrivateKey = requireEnv("PRIVATE_KEY");
  const mockAttestorKeys = loadMockAttestorPrivateKeys();

  const ccProvider = new ethers.JsonRpcProvider(cc3RpcUrl);
  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
  const relayerWallet = new ethers.Wallet(relayerPrivateKey, sepoliaProvider);

  const spaceFinance = new ethers.Contract(spaceFinanceAddress, SpaceFinanceAbi.abi, ccProvider);
  const outbox = new ethers.Contract(outboxAddress, OutboxAbi.abi, ccProvider);
  const inbox = new ethers.Contract(inboxAddress, InboxAbi.abi, relayerWallet);

  const explicitTxHash = process.argv[2];
  const target = explicitTxHash
    ? await findMessageIdFromRepayTx(spaceFinance, explicitTxHash)
    : await findLatestUnrelayedMessage(spaceFinance, ccProvider, inbox);

  if (!target) {
    console.log("No unrelayed RepaymentPublished messages found in the scan window. Nothing to do.");
    return;
  }
  console.log(`Relaying loanId ${target.loanId}, messageId ${target.messageId}...`);

  const message = await outbox.getMessage(target.messageId);
  console.log(`  emitter=${message.emitter} sequence=${message.sequence} canAck=${message.canAck}`);

  // getMessage only returns payloadHash, not the payload itself — the payload has to come from the
  // MessagePublished log, so fetch it from the block the message was recorded in.
  const publishFilter = outbox.filters.MessagePublished(target.messageId);
  const publishEvents = await outbox.queryFilter(
    publishFilter,
    Math.max(0, (await ccProvider.getBlockNumber()) - CC3_SCAN_BLOCK_WINDOW)
  );
  if (publishEvents.length === 0) throw new Error(`No MessagePublished log found for ${target.messageId}`);
  const publishEvent = publishEvents[publishEvents.length - 1] as ethers.EventLog;
  const payload = publishEvent.args.payload as string;
  const emitterAddress = decodeEmitterFromTopic(publishEvent.topics[2]);

  const messageHash = computeInboxMessageHash({
    messageId: target.messageId,
    emitterAddress,
    localChainKey,
    creditcoinChainId: cc3ChainId,
    payload,
  });
  const votes = signAsMockAttestors(messageHash, mockAttestorKeys);

  console.log(`\nSubmitting Inbox.deliverMessage on Sepolia (relayer: ${relayerWallet.address})...`);
  const tx = await inbox.deliverMessage(target.messageId, emitterAddress, payload, votes);
  const receipt = await tx.wait();
  console.log(`deliverMessage tx mined: ${tx.hash} (block ${receipt.blockNumber})`);

  const deliveredLog = receipt.logs.find((log: any) => log.address.toLowerCase() === inboxAddress.toLowerCase());
  const parsed = deliveredLog ? inbox.interface.parseLog({ topics: [...deliveredLog.topics], data: deliveredLog.data }) : null;
  if (parsed?.name === "MessageDelivered") {
    console.log(`\n✅ Delivered — CollateralVault should now show loanId ${target.loanId} as withdrawalAuthorized.`);
  } else if (parsed?.name === "MessagePending") {
    console.log(
      `\n⚠️  Stored as pending (CollateralVault._processMessage reverted — check trustedEmitter/loanId/borrower wiring). ` +
        `Retry with Inbox.retryPendingMessage(${target.messageId}) once fixed.`
    );
  }
}

main().catch((error) => {
  console.error("\n❌ relay-repayment failed:", error);
  process.exitCode = 1;
});
