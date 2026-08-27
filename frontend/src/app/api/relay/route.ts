import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { computeInboxMessageHash, decodeEmitterFromTopic, signAsMockAttestors } from './mockAttestor'

// Needs real Node (ethers, process.env secrets) — not the Edge runtime.
export const runtime = 'nodejs'

const CC3_CHAIN_ID = 102031n

// bytes32 chain key Inbox was deployed with on Sepolia — see deployment.json's
// sepolia.writeAbilityChainKey (Sepolia's EVM chain id, 11155111, encoded as bytes32). Purely
// internal to this stub deployment's own chain-key scheme, must match Inbox's constructor arg
// exactly or every message hash here would mismatch what Inbox itself computes.
const SEPOLIA_LOCAL_CHAIN_KEY = '0x0000000000000000000000000000000000000000000000000000000000aa36a7'

const SPACE_FINANCE_ABI = [
  'event RepaymentPublished(uint256 indexed loanId, bytes32 indexed messageId)',
]
const OUTBOX_ABI = ['event MessagePublished(bytes32 indexed messageId, bytes32 indexed emitterAddress, bool canAck, bytes payload)']
const INBOX_ABI = [
  'function processedAt(bytes32 messageId) external view returns (uint256)',
  'function deliverMessage(bytes32 messageId, address emitterAddress, bytes calldata payload, bytes calldata votes) external returns (bool)',
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Server misconfigured: ${name} is not set`)
  return value
}

// The CC3 testnet public RPC times out (10s) on an eth_getLogs range much wider than this — same
// window contracts/scripts/relayer/relay-repayment.ts already uses successfully. Searches
// backward from the latest block in chunks, stopping at the first chunk with a match (a given
// loanId's RepaymentPublished/messageId's MessagePublished each fire at most once, so the first
// hit is the only one).
const LOG_SCAN_CHUNK_BLOCKS = 10_000
const LOG_SCAN_MAX_LOOKBACK_BLOCKS = 100_000

async function queryFilterBatched(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  latestBlock: number
): Promise<ethers.EventLog[]> {
  let toBlock = latestBlock
  let scanned = 0
  while (scanned < LOG_SCAN_MAX_LOOKBACK_BLOCKS && toBlock >= 0) {
    const fromBlock = Math.max(0, toBlock - LOG_SCAN_CHUNK_BLOCKS + 1)
    const events = (await contract.queryFilter(filter, fromBlock, toBlock)) as ethers.EventLog[]
    if (events.length > 0) return events
    if (fromBlock === 0) break
    scanned += toBlock - fromBlock + 1
    toBlock = fromBlock - 1
  }
  return []
}

/**
 * Stands in for a real USC attestor network's watch+sign+relay loop (see
 * contracts/scripts/relayer/relay-repayment.ts for the CLI equivalent). Triggered by the frontend
 * right after a borrower's `repay()` confirms, so collateral release needs no separate manual
 * step — but this endpoint always re-derives what to sign from real on-chain state, it never
 * trusts the request body for the message content. That's what makes it safe to leave
 * permissionless: a caller can only ever get us to relay a message SpaceFinance itself already
 * published for a real, fully-repaid loan — never an arbitrary fabricated one.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const loanIdRaw = body?.loanId
    if (loanIdRaw === undefined || loanIdRaw === null || loanIdRaw === '') {
      return NextResponse.json({ error: 'loanId is required' }, { status: 400 })
    }
    const loanId = BigInt(loanIdRaw)

    const cc3Provider = new ethers.JsonRpcProvider(requireEnv('NEXT_PUBLIC_CC3_TESTNET_RPC_URL'))
    const sepoliaProvider = new ethers.JsonRpcProvider(requireEnv('NEXT_PUBLIC_SEPOLIA_RPC_URL'))

    const spaceFinance = new ethers.Contract(requireEnv('NEXT_PUBLIC_SPACE_FINANCE'), SPACE_FINANCE_ABI, cc3Provider)
    const outbox = new ethers.Contract(requireEnv('OUTBOX_ADDRESS'), OUTBOX_ABI, cc3Provider)
    const inboxAddress = requireEnv('INBOX_ADDRESS')

    // 1. Find the real messageId SpaceFinance published for this loan — never trust a
    //    client-supplied messageId/payload directly.
    const cc3Latest = await cc3Provider.getBlockNumber()
    const publishedEvents = await queryFilterBatched(spaceFinance, spaceFinance.filters.RepaymentPublished(loanId), cc3Latest)
    if (publishedEvents.length === 0) {
      return NextResponse.json(
        { error: `No RepaymentPublished event found for loanId ${loanId} yet — has repay() been confirmed?` },
        { status: 404 }
      )
    }
    const messageId = (publishedEvents[publishedEvents.length - 1] as ethers.EventLog).args.messageId as string

    // 2. Already delivered? No-op (idempotent — safe to call this endpoint more than once).
    const inboxRead = new ethers.Contract(inboxAddress, INBOX_ABI, sepoliaProvider)
    const processedAt: bigint = await inboxRead.processedAt(messageId)
    if (processedAt !== 0n) {
      return NextResponse.json({ status: 'already-delivered', messageId })
    }

    // 3. Pull the payload from Outbox's MessagePublished log — Outbox only stores the payload
    //    hash on-chain, not the payload itself.
    const outboxLatest = await cc3Provider.getBlockNumber()
    const publishLogEvents = await queryFilterBatched(outbox, outbox.filters.MessagePublished(messageId), outboxLatest)
    if (publishLogEvents.length === 0) {
      return NextResponse.json({ error: `No MessagePublished log found for messageId ${messageId}` }, { status: 404 })
    }
    const publishLog = publishLogEvents[publishLogEvents.length - 1] as ethers.EventLog
    const payload = publishLog.args.payload as string
    const emitterAddress = decodeEmitterFromTopic(publishLog.topics[2])

    // 4. Sign with the mock attestor set and deliver.
    const messageHash = computeInboxMessageHash({
      messageId,
      emitterAddress,
      localChainKey: SEPOLIA_LOCAL_CHAIN_KEY,
      creditcoinChainId: CC3_CHAIN_ID,
      payload,
    })
    const mockAttestorKeys = requireEnv('MOCK_ATTESTOR_PRIVATE_KEYS')
      .split(',')
      .map((k) => k.trim())
    const votes = signAsMockAttestors(messageHash, mockAttestorKeys)

    const relayerWallet = new ethers.Wallet(requireEnv('RELAYER_PRIVATE_KEY'), sepoliaProvider)
    const inbox = inboxRead.connect(relayerWallet) as ethers.Contract
    const tx = await inbox.deliverMessage(messageId, emitterAddress, payload, votes)
    await tx.wait()

    return NextResponse.json({ status: 'delivered', messageId, txHash: tx.hash })
  } catch (err) {
    console.error('[api/relay] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
