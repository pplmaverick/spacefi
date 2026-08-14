import { ethers } from "ethers";

/**
 * Reads a Spacecoin node's on-chain revenue history from TokenPaymentEscrow on Creditcoin
 * MAINNET (not testnet — this contract lives on chain 102030, separate from anything SpaceFinance
 * itself deploys to). See project research notes: this is same-chain data relative to a CC3
 * deployment of SpaceFinance, no USC cross-chain proof needed to read it.
 *
 * Data source: Blockscout's indexed logs API, not direct RPC eth_getLogs. Direct RPC against
 * mainnet3.creditcoin.network was empirically tested and hits a ~10s server-side timeout on any
 * eth_getLogs range beyond ~5,000 blocks (10,000 already hangs) — scanning this contract's full
 * history that way would take 1000+ chunked requests. Blockscout returns the full indexed history
 * in ~50-item pages, each request <1s, and conveniently includes block_timestamp per log entry so
 * no separate block lookups are needed either.
 *
 * Usage: npx ts-node scripts/query-node-revenue.ts <nodeId (bytes32 hex)>
 */

const TOKEN_PAYMENT_ESCROW = "0xC130F5D76f0b4Ce8FE2ceA0D2C2b8f53A39a5cd0"; // proxy, CC3 mainnet
const BLOCKSCOUT_LOGS_URL = `https://creditcoin.blockscout.com/api/v2/addresses/${TOKEN_PAYMENT_ESCROW}/logs`;

const RECEIPT_CLAIMED_IFACE = new ethers.Interface([
  "event ReceiptClaimed(address indexed client, bytes32 indexed node, string requestUUID, uint256 dataAmount, uint256 amountPaid)",
]);
const RECEIPT_CLAIMED_TOPIC0 = RECEIPT_CLAIMED_IFACE.getEvent("ReceiptClaimed")!.topicHash;

interface ReceiptRecord {
  client: string;
  requestUUID: string;
  dataAmount: bigint;
  amountPaid: bigint;
  blockNumber: number;
  blockTimestamp: number; // unix seconds
  txHash: string;
}

interface BlockscoutLogItem {
  // Blockscout pads this to a fixed length of 4 (max possible Solidity event topics), filling
  // unused slots with `null` — must be stripped before handing to ethers.Interface.parseLog.
  topics: (string | null)[] | null;
  data: string;
  block_number: number;
  block_timestamp: string; // ISO 8601
  transaction_hash: string;
}

interface BlockscoutLogsResponse {
  items: BlockscoutLogItem[];
  next_page_params: Record<string, string | number> | null;
}

/** Left-pads an address or bytes32-ish input to a full 32-byte topic for comparison. */
function normalizeTopic(value: string): string {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  return "0x" + hex.toLowerCase().padStart(64, "0");
}

async function fetchAllReceiptsForNode(nodeId: string): Promise<ReceiptRecord[]> {
  const targetTopic = normalizeTopic(nodeId);
  const results: ReceiptRecord[] = [];
  let queryParams: Record<string, string> = {};
  let page = 0;
  const MAX_PAGES = 200; // safety cap; this contract's full history is nowhere near this many pages

  while (page < MAX_PAGES) {
    page++;
    const url = new URL(BLOCKSCOUT_LOGS_URL);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Blockscout logs request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as BlockscoutLogsResponse;

    for (const log of data.items ?? []) {
      const topics = log.topics;
      if (!topics || topics[0]?.toLowerCase() !== RECEIPT_CLAIMED_TOPIC0.toLowerCase()) continue;
      if (normalizeTopic(topics[2] ?? "") !== targetTopic) continue;

      // Strip the trailing null pad slot(s) before decoding.
      const realTopics = topics.filter((t): t is string => t !== null);
      const parsed = RECEIPT_CLAIMED_IFACE.parseLog({ topics: realTopics, data: log.data });
      if (!parsed) continue;

      results.push({
        client: parsed.args.client as string,
        requestUUID: parsed.args.requestUUID as string,
        dataAmount: parsed.args.dataAmount as bigint,
        amountPaid: parsed.args.amountPaid as bigint,
        blockNumber: log.block_number,
        blockTimestamp: Math.floor(new Date(log.block_timestamp).getTime() / 1000),
        txHash: log.transaction_hash,
      });
    }

    console.log(`  page ${page}: scanned ${data.items?.length ?? 0} logs, ${results.length} matching receipts so far`);

    if (!data.next_page_params) break;
    queryParams = Object.fromEntries(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)]));
  }

  return results;
}

async function main() {
  const nodeId = process.argv[2];
  if (!nodeId) {
    console.error("Usage: npx ts-node scripts/query-node-revenue.ts <nodeId (bytes32 hex)>");
    process.exit(1);
  }

  console.log(`Querying ReceiptClaimed history for node ${nodeId}`);
  console.log(`Contract: ${TOKEN_PAYMENT_ESCROW} (Creditcoin mainnet)\n`);

  const receipts = await fetchAllReceiptsForNode(nodeId);

  if (receipts.length === 0) {
    console.log("\nNo ReceiptClaimed events found for this node.");
    return;
  }

  // ─── Total revenue ────────────────────────────────────────────────────────
  const totalRevenue = receipts.reduce((sum, r) => sum + r.amountPaid, 0n);
  console.log(`\n=== Total revenue ===`);
  console.log(`${receipts.length} receipts, total ${ethers.formatUnits(totalRevenue, 18)} SPACE`);

  // ─── Most recent 10 ───────────────────────────────────────────────────────
  const sortedByBlock = [...receipts].sort((a, b) => b.blockNumber - a.blockNumber);
  console.log(`\n=== Most recent 10 receipts ===`);
  for (const r of sortedByBlock.slice(0, 10)) {
    const date = new Date(r.blockTimestamp * 1000).toISOString();
    console.log(
      `block ${r.blockNumber} (${date}) | client ${r.client} | dataAmount ${r.dataAmount} | ` +
        `amountPaid ${ethers.formatUnits(r.amountPaid, 18)} SPACE | tx ${r.txHash}`
    );
  }

  // ─── Trailing-30-day revenue estimate ─────────────────────────────────────
  console.log(`\n=== Trailing 30-day revenue estimate ===`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = nowSeconds - 30 * 24 * 60 * 60;

  const last30dReceipts = receipts.filter((r) => r.blockTimestamp >= thirtyDaysAgo);
  const last30dRevenue = last30dReceipts.reduce((sum, r) => sum + r.amountPaid, 0n);

  console.log(
    `${last30dReceipts.length} receipts in the trailing 30 days, ` +
      `totaling ${ethers.formatUnits(last30dRevenue, 18)} SPACE`
  );

  if (last30dReceipts.length === 0 && receipts.length > 0) {
    const mostRecentTs = Math.max(...receipts.map((r) => r.blockTimestamp));
    const daysSinceLast = Math.round((nowSeconds - mostRecentTs) / (24 * 60 * 60));
    console.log(
      `(No activity in the last 30 days — most recent receipt was ~${daysSinceLast} days ago. ` +
        `This node may be inactive, or all its history predates the 30-day window.)`
    );
  }
}

main().catch((error) => {
  console.error("\n❌ query-node-revenue failed:", error);
  process.exitCode = 1;
});
