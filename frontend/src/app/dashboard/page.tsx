'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { cc3Testnet } from '@/lib/chains'
import { LOAN_STATUS } from '@/lib/contracts'
import { useEffect, useState } from 'react'

const ESCROW_ADDRESS = '0xC130F5D76f0b4Ce8FE2ceA0D2C2b8f53A39a5cd0'
const BLOCKSCOUT_CC3 = 'https://creditcoin.blockscout.com'
const RECEIPT_CLAIMED_TOPIC = '0x7d6cc3c483f3de5eda2c38c7e1a94575eae31eb75440f690d047ece1c4d3e041'

const SPACE_FINANCE_ADDRESS = process.env.NEXT_PUBLIC_SPACE_FINANCE as `0x${string}`

const BORROW_TO_LOAN_ID_ABI = [
  {
    name: 'borrowerToLoanId',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'borrower', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const GET_LOAN_ABI = [
  {
    name: 'getLoan',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'borrower', type: 'address' },
          { name: 'collateralAmount', type: 'uint256' },
          { name: 'nodeId', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
] as const

const STATUS_COLOR: Record<number, string> = {
  0: 'text-gray-500',
  1: 'text-yellow-400',
  2: 'text-blue-400',
  3: 'text-green-400',
  4: 'text-gray-400',
}

const STATUS_DOT: Record<number, string> = {
  0: 'bg-gray-500',
  1: 'bg-yellow-400',
  2: 'bg-blue-400',
  3: 'bg-green-400',
  4: 'bg-gray-400',
}

export default function DashboardPage() {
  const { isConnected, address } = useAccount()

  const { data: loanId } = useReadContract({
    address: SPACE_FINANCE_ADDRESS,
    abi: BORROW_TO_LOAN_ID_ABI,
    functionName: 'borrowerToLoanId',
    args: address ? [address] : undefined,
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })

  const { data: loanData } = useReadContract({
    address: SPACE_FINANCE_ADDRESS,
    abi: GET_LOAN_ABI,
    functionName: 'getLoan',
    args: loanId !== undefined ? [loanId] : undefined,
    chainId: cc3Testnet.id,
    query: { enabled: loanId !== undefined && loanId > 0n },
  })

  const loan = loanData
    ? {
        id: loanId?.toString() ?? '0',
        status: loanData.status,
        borrower: loanData.borrower,
        collateralAmount: formatEther(loanData.collateralAmount),
        nodeId: loanData.nodeId,
      }
    : null

  // --- Dynamic Repayment State ---
  const [monthlyRevenue, setMonthlyRevenue] = useState<number | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)

  useEffect(() => {
    if (!loan?.nodeId) return

    const fetchRevenue = async () => {
      setRevenueLoading(true)
      try {
        // Fetch last 90 days of ReceiptClaimed logs for this node
        const toBlock = 'latest'
        // Use fromBlock far enough back to cover 3 months (~3 months * 30 days * 720 blocks/day)
        const url = `${BLOCKSCOUT_CC3}/api?module=logs&action=getLogs` +
          `&address=${ESCROW_ADDRESS}` +
          `&topic0=${RECEIPT_CLAIMED_TOPIC}` +
          `&fromBlock=0&toBlock=${toBlock}`

        const res = await fetch(url)
        const json = await res.json()

        if (json.status !== '1' || !Array.isArray(json.result)) {
          setMonthlyRevenue(0)
          return
        }

        // Filter by nodeId (topic1 or topic2 depending on contract event signature)
        // ReceiptClaimed event: amountPaid is the revenue field
        // Client-side filter: check if nodeId appears in the log data
        const nodeIdLower = loan.nodeId.toLowerCase()
        const filtered = json.result.filter((log: { topics: string[] }) =>
          log.topics.some((t: string) => t.toLowerCase().includes(nodeIdLower.replace('0x', '')))
        )

        // Sum amountPaid from each log's data field (first 32 bytes = amountPaid)
        let total = 0
        for (const log of filtered) {
          const raw = log.data?.slice(2, 66) // first 32 bytes
          if (raw) {
            const val = parseInt(raw, 16)
            if (!isNaN(val)) total += val
          }
        }

        // Convert from smallest unit (assume 6 decimals for CTC) → USD approximation
        // Using 1 CTC ≈ $0.05 as rough estimate; display in CTC
        const totalCTC = total / 1e18
        const monthly = totalCTC / 3 // 90 days ÷ 3 = monthly avg
        setMonthlyRevenue(Math.round(monthly * 100) / 100)
      } catch (e) {
        console.error('Revenue fetch error:', e)
        setMonthlyRevenue(0)
      } finally {
        setRevenueLoading(false)
      }
    }

    fetchRevenue()
  }, [loan?.nodeId])

  // Determine repayment ratio based on monthly revenue trend
  // For MVP: use absolute monthly revenue level as proxy
  // < 50 CTC → treat as declined 50%+ → 80%
  // < 100 CTC → treat as declined 30%+ → 60%
  // >= 100 CTC → normal → 40%
  const getRepaymentTier = (monthly: number | null) => {
    if (monthly === null) return null
    if (monthly < 50) return { ratio: 80, label: '80%', note: 'Revenue down 50%+ — extended +30 days', color: 'text-red-400', border: 'border-red-900' }
    if (monthly < 100) return { ratio: 60, label: '60%', note: 'Revenue down 30%+', color: 'text-yellow-400', border: 'border-yellow-900' }
    return { ratio: 40, label: '40%', note: 'Normal repayment rate', color: 'text-green-400', border: 'border-green-900' }
  }

  const repaymentTier = getRepaymentTier(monthlyRevenue)

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <nav className="border-b border-[#1a2744] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <span className="text-cyan-400 text-xs font-mono">SF</span>
          </div>
          <span className="font-mono text-sm text-gray-300 tracking-widest uppercase">SpaceFinance</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/apply" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors font-mono">Apply</Link>
          <Link href="/revenue" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors font-mono">Revenue</Link>
          <WalletButton requiredChainId={cc3Testnet.id} />
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
          <p className="text-gray-500 text-sm font-mono">Loan status on Creditcoin CC3</p>
        </div>

        {!isConnected ? (
          <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-12 text-center">
            <div className="text-gray-600 font-mono text-sm mb-4">Connect your wallet to view loan status</div>
            <WalletButton requiredChainId={cc3Testnet.id} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Loan card */}
            <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Loan #{loan?.id ?? '-'}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[(loan?.status ?? 0)]}`} />
                  <span className={`text-sm font-mono ${STATUS_COLOR[(loan?.status ?? 0)]}`}>
                    {LOAN_STATUS[(loan?.status ?? 0)]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Borrower</div>
                  <div className="text-sm font-mono text-gray-300 break-all">
                    {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : (loan?.borrower ?? address ?? '-').slice(0, 10) + '...'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Collateral</div>
                  <div className="text-sm font-mono text-white">{loan?.collateralAmount ?? '-'} ETH</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Node ID</div>
                  <div className="text-xs font-mono text-gray-400 break-all">{loan?.nodeId ?? '-'}</div>
                </div>
              </div>
            </div>

            {/* USC flow status */}
            <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">USC Attestation Flow</div>
              <div className="space-y-3">
                {[
                  { label: 'Collateral Deposited', done: (loan?.status ?? 0) >= 1 },
                  { label: 'USC Attestation #1 (Deposited)', done: (loan?.status ?? 0) >= 2 },
                  { label: 'Node Registered', done: (loan?.status ?? 0) >= 2 },
                  { label: 'USC Attestation #2 (NodeRegistered)', done: (loan?.status ?? 0) >= 3 },
                  { label: 'mUSDF Released', done: (loan?.status ?? 0) >= 3 },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-xs flex-shrink-0
                      ${done ? 'bg-cyan-500 border-cyan-500 text-black' : 'border-gray-700 text-gray-700'}`}>
                      {done ? '✓' : ''}
                    </div>
                    <span className={`text-sm font-mono ${done ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Repayment Rate */}
            {(loan?.status ?? 0) === 3 && (
              <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
                <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">Dynamic Repayment Rate</div>

                {revenueLoading ? (
                  <div className="text-sm font-mono text-gray-600 animate-pulse">Fetching node revenue...</div>
                ) : repaymentTier ? (
                  <div className="space-y-4">
                    {/* Current ratio */}
                    <div className={`border rounded-lg p-4 ${repaymentTier.border} bg-black/20`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Current Rate</span>
                        <span className={`text-2xl font-bold font-mono ${repaymentTier.color}`}>{repaymentTier.label}</span>
                      </div>
                      <div className="text-xs font-mono text-gray-600 mt-1">{repaymentTier.note}</div>
                    </div>

                    {/* Monthly revenue */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Monthly Avg Revenue</div>
                        <div className="text-sm font-mono text-white">{monthlyRevenue?.toFixed(2) ?? '-'} CTC</div>
                        <div className="text-xs font-mono text-gray-600">from ReceiptClaimed (CC3 mainnet)</div>
                      </div>
                      <div>
                        <div className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Credit Limit</div>
                        <div className="text-sm font-mono text-white">
                          {monthlyRevenue !== null ? (monthlyRevenue * 3).toFixed(0) : '-'} mUSDF
                        </div>
                        <div className="text-xs font-mono text-gray-600">monthly avg × 3</div>
                      </div>
                    </div>

                    {/* Tier table */}
                    <div className="border border-[#1a2744] rounded-lg overflow-hidden">
                      <div className="text-xs font-mono text-gray-500 px-4 py-2 border-b border-[#1a2744] uppercase tracking-wider">Repayment Schedule</div>
                      {[
                        { condition: 'Normal', rate: '40%', color: 'text-green-400' },
                        { condition: 'Revenue down 30%+', rate: '60%', color: 'text-yellow-400' },
                        { condition: 'Revenue down 50%+', rate: '80% (+30d)', color: 'text-red-400' },
                        { condition: 'Down 30% × 2 months', rate: 'Frozen', color: 'text-gray-500' },
                        { condition: 'Zero revenue × 3 months', rate: 'Default', color: 'text-gray-500' },
                      ].map(({ condition, rate, color }) => (
                        <div key={condition} className="flex items-center justify-between px-4 py-2 border-b border-[#1a2744] last:border-0">
                          <span className="text-xs font-mono text-gray-500">{condition}</span>
                          <span className={`text-xs font-mono font-semibold ${color}`}>{rate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-mono text-gray-600">No revenue data found for this node.</div>
                )}
              </div>
            )}

            {/* Actions */}
            {(loan?.status ?? 0) === 0 && (
              <Link href="/apply" className="block w-full text-center px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono">
                Start Application →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
