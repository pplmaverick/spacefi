import { decodeEventLog, formatUnits } from 'viem'

const BLOCKSCOUT_CC3_MAINNET = 'https://creditcoin.blockscout.com/api/v2'
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_PAYMENT_ESCROW!

// 跟 ~/spacefi-contracts/scripts/query-node-revenue.ts 用同一份簽名（已驗證跑通）：
// event ReceiptClaimed(address indexed client, bytes32 indexed node, string requestUUID, uint256 dataAmount, uint256 amountPaid)
// topic0 = keccak256("ReceiptClaimed(address,bytes32,string,uint256,uint256)")，用 ethers 算過並跟 viem 交叉驗證一致
const RECEIPT_CLAIMED_ABI = [
  {
    type: 'event',
    name: 'ReceiptClaimed',
    inputs: [
      { type: 'address', name: 'client', indexed: true },
      { type: 'bytes32', name: 'node', indexed: true },
      { type: 'string', name: 'requestUUID' },
      { type: 'uint256', name: 'dataAmount' },
      { type: 'uint256', name: 'amountPaid' },
    ],
  },
] as const

const RECEIPT_CLAIMED_TOPIC0 = '0x7d6cc3c483f3de5eda2c38c7e1a94575eae31eb75440f690d047ece1c4d3e041'

export type RevenueRecord = {
  date: string
  nodeId: string
  amount: string
  txHash: string
  blockNumber: number
  logIndex: number
}

type BlockscoutLogItem = {
  // Blockscout 把 topics 補到固定長度 4，沒用到的欄位是 null，decode 前要先濾掉
  topics: (string | null)[] | null
  data: string
  block_number: number
  block_timestamp: string // ISO 8601
  transaction_hash: string
  // 同一筆 tx 可能一次觸發多個 ReceiptClaimed（例如批次結算），txHash 不足以當唯一 key，
  // 要靠這個 log 在該筆 tx 裡的 index 區分（實測驗證過會發生，不是理論上的邊界情況）
  index: number
}

type BlockscoutLogsResponse = {
  items: BlockscoutLogItem[]
  next_page_params: Record<string, string | number> | null
}

/** Left-pads an address or bytes32-ish input to a full 32-byte topic for comparison. */
function normalizeTopic(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value
  return '0x' + hex.toLowerCase().padStart(64, '0')
}

const MAX_PAGES = 200 // 安全上限，跟 query-node-revenue.ts 一致

export async function fetchNodeRevenue(nodeId: string): Promise<RevenueRecord[]> {
  const targetTopic = normalizeTopic(nodeId)
  const records: RevenueRecord[] = []
  let queryParams: Record<string, string> = {}
  let page = 0

  // Blockscout 的 /addresses/{address}/logs 不保證支援 topic0/topic2 這種 URL query filter，
  // 跟 query-node-revenue.ts 一樣改成抓全部（分頁）再在前端過濾。
  while (page < MAX_PAGES) {
    page++
    const url = new URL(`${BLOCKSCOUT_CC3_MAINNET}/addresses/${ESCROW_ADDRESS}/logs`)
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value)
    }

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Blockscout API error: ${res.status}`)
    const json = (await res.json()) as BlockscoutLogsResponse

    for (const log of json.items ?? []) {
      const topics = log.topics
      if (!topics || topics[0]?.toLowerCase() !== RECEIPT_CLAIMED_TOPIC0.toLowerCase()) continue
      if (normalizeTopic(topics[2] ?? '') !== targetTopic) continue

      const realTopics = topics.filter((t): t is string => t !== null) as [`0x${string}`, ...`0x${string}`[]]

      try {
        const decoded = decodeEventLog({
          abi: RECEIPT_CLAIMED_ABI,
          eventName: 'ReceiptClaimed',
          topics: realTopics,
          data: log.data as `0x${string}`,
        })

        records.push({
          date: new Date(log.block_timestamp).toISOString().slice(0, 10),
          nodeId: decoded.args.node,
          amount: formatUnits(decoded.args.amountPaid, 18),
          txHash: log.transaction_hash,
          blockNumber: log.block_number,
          logIndex: log.index,
        })
      } catch {
        // 不是我們要的 event 或解碼失敗，跳過
      }
    }

    if (!json.next_page_params) break
    queryParams = Object.fromEntries(
      Object.entries(json.next_page_params).map(([k, v]) => [k, String(v)])
    )
  }

  return records.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
}
