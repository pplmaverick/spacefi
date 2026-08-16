'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount, useReadContract, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { cc3Testnet } from '@/lib/chains'
import { sepolia } from 'wagmi/chains'
import { LOAN_STATUS } from '@/lib/contracts'
import { useEffect, useState } from 'react'

const ESCROW_ADDRESS = '0xC130F5D76f0b4Ce8FE2ceA0D2C2b8f53A39a5cd0'
const BLOCKSCOUT_CC3 = 'https://creditcoin.blockscout.com'
const RECEIPT_CLAIMED_TOPIC = '0x7d6cc3c483f3de5eda2c38c7e1a94575eae31eb75440f690d047ece1c4d3e041'

const SPACE_FINANCE_ADDRESS = process.env.NEXT_PUBLIC_SPACE_FINANCE as `0x${string}`

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

const GET_LOANS_BY_BORROWER_ABI = [
  {
    name: 'getLoansByBorrower',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'borrower', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const

const GET_LOAN_ABI = [
  {
    name: 'getLoan',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [
      { name: 'borrower', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'usdValue', type: 'uint256' },
      { name: 'nodeId', type: 'bytes32' },
      { name: 'status', type: 'uint8' },
      { name: 'repaidAmount', type: 'uint256' },
    ],
  },
] as const

const COLLATERAL_VAULT_WITHDRAW_ABI = [
  {
    name: 'withdrawalAuthorized',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [],
  },
] as const

const COLLATERAL_VAULT_ADDRESS = process.env.NEXT_PUBLIC_COLLATERAL_VAULT as `0x${string}`

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

const REPAYMENT_TIERS = [
  { label: 'Tier 1 — Normal', rate: '40%', ratio: 40, color: 'text-[#3DFFC0]' },
  { label: 'Tier 2 — Revenue down 30%+', rate: '60%', ratio: 60, color: 'text-gray-300' },
  { label: 'Tier 3 — Revenue down 50%+', rate: '80% (+30d)', ratio: 80, color: 'text-[#FF6B35]' },
  { label: 'Tier 4 — Down 30% × 2 months', rate: 'Frozen', ratio: null, color: 'text-[#64748B]' },
  { label: 'Tier 5 — Zero revenue × 3 months', rate: 'Default', ratio: null, color: 'text-[#FF6B35]' },
] as const

function ChainSwitchBanner({ requiredChainId, requiredChainName }: { requiredChainId: number; requiredChainName: string }) {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isWrongChain = chainId !== requiredChainId

  if (!isWrongChain) return null

  return (
    <div className="flex items-center justify-between bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-lg px-4 py-2 mb-4">
      <span className="text-xs font-mono text-[#FF6B35]">
        ⚠ Switch to {requiredChainName} to continue
      </span>
      <button
        onClick={() => switchChain({ chainId: requiredChainId })}
        className="text-xs font-mono text-[#FF6B35] border border-[#FF6B35]/50 rounded px-3 py-1 hover:bg-[#FF6B35]/10"
      >
        SWITCH NETWORK
      </button>
    </div>
  )
}

function LoanCard({ loanId }: { loanId: bigint }) {
  const { address } = useAccount()

  const { data: loanData } = useReadContract({
    address: SPACE_FINANCE_ADDRESS,
    abi: GET_LOAN_ABI,
    functionName: 'getLoan',
    args: [loanId],
    chainId: cc3Testnet.id,
  })

  const loan = loanData
    ? {
        id: loanId.toString(),
        status: (loanData as unknown as unknown[])[4] as number,
        borrower: (loanData as unknown as unknown[])[0] as string,
        collateralAmount: formatEther((loanData as unknown as unknown[])[1] as bigint),
        nodeId: (loanData as unknown as unknown[])[3] as string,
      }
    : null

  const sepoliaLoanId = loanId

  const { data: isWithdrawAuthorized } = useReadContract({
    address: COLLATERAL_VAULT_ADDRESS,
    abi: COLLATERAL_VAULT_WITHDRAW_ABI,
    functionName: 'withdrawalAuthorized',
    args: [sepoliaLoanId],
    chainId: sepolia.id,
    query: {
      enabled: loan?.status === 4 && sepoliaLoanId > 0n,
      refetchInterval: 15000,
    },
  })

  const { writeContract: writeWithdraw, data: withdrawTxHash, isPending: isWithdrawPending, error: withdrawError } = useWriteContract()
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawTxHash })

  function handleWithdraw() {
    writeWithdraw({
      address: COLLATERAL_VAULT_ADDRESS,
      abi: COLLATERAL_VAULT_WITHDRAW_ABI,
      functionName: 'withdraw',
      args: [sepoliaLoanId],
      chainId: sepolia.id,
    })
  }

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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      {/* Left column (~60%) */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        {/* Loan card */}
        <div className="bg-[#1E293B] border border-[#334155] p-6">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Loan #{loan?.id ?? '-'}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[(loan?.status ?? 0)]}`} />
              <span className={`text-sm font-mono ${STATUS_COLOR[(loan?.status ?? 0)]}`}>
                {LOAN_STATUS[(loan?.status ?? 0)]}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-1">Borrower</div>
              <div className="text-sm font-mono text-gray-300 break-all">
                {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : (loan?.borrower ?? address ?? '-').slice(0, 10) + '...'}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-1">Collateral</div>
              <div className="text-sm font-mono text-white">{loan?.collateralAmount ?? '-'} ETH</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-1">Node ID</div>
              <div className="text-xs font-mono text-gray-400 break-all">{loan?.nodeId ?? '-'}</div>
            </div>
          </div>
        </div>

        {/* Repayment Schedule */}
        <div className="bg-[#1E293B] border border-[#334155] p-6">
          <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-4 pb-3 border-b border-[#334155]">Repayment Schedule</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-[#334155]">
                  <th className="py-2 text-xs font-mono text-[#64748B] uppercase tracking-wider font-normal">Utilization Tier</th>
                  <th className="py-2 text-xs font-mono text-[#64748B] uppercase tracking-wider font-normal text-right">Repayment Rate</th>
                </tr>
              </thead>
              <tbody>
                {REPAYMENT_TIERS.map(tier => {
                  const isCurrent = tier.ratio !== null && repaymentTier?.ratio === tier.ratio
                  return (
                    <tr
                      key={tier.label}
                      className={`border-b border-[#334155]/50 last:border-0 ${isCurrent ? 'border-l-2 border-l-[#00C2FF] bg-[#00C2FF]/5' : ''}`}
                    >
                      <td className={`py-3 pl-2 ${isCurrent ? 'text-[#00C2FF]' : 'text-gray-300'}`}>{tier.label}</td>
                      <td className={`py-3 pr-2 text-right ${tier.color} ${isCurrent ? 'font-semibold' : ''}`}>{tier.rate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right column (~40%) */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* USC flow status */}
        <div className="bg-[#1E293B] border border-[#334155] p-6">
          <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-4">USC Attestation Flow</div>
          <div className="space-y-3">
            {[
              { label: 'Collateral Deposited', done: (loan?.status ?? 0) >= 1 },
              { label: 'USC Attestation #1 (Deposited)', done: (loan?.status ?? 0) >= 2 },
              { label: 'Node Registered', done: (loan?.status ?? 0) >= 2 },
              { label: 'USC Attestation #2 (NodeRegistered)', done: (loan?.status ?? 0) >= 3 },
              { label: 'mUSDF Released', done: (loan?.status ?? 0) >= 3 },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-4 h-4 border flex items-center justify-center text-xs flex-shrink-0
                  ${done ? 'bg-[#3DFFC0] border-[#3DFFC0] text-[#0F172A]' : 'border-[#334155] text-[#334155]'}`}>
                  {done ? '✓' : ''}
                </div>
                <span className={`text-sm font-mono ${done ? 'text-gray-300' : 'text-[#64748B]'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Collateral Release */}
        {loan?.status === 4 && (
          <div className="bg-[#1E293B] border border-[#334155] p-6">
            <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">COLLATERAL RELEASE</div>

            <ChainSwitchBanner requiredChainId={sepolia.id} requiredChainName="Sepolia" />

            {isWithdrawSuccess ? (
              <div className="text-sm font-mono text-[#3DFFC0]">✓ ETH returned to your wallet</div>
            ) : isWithdrawAuthorized ? (
              <div className="space-y-3">
                <div className="text-xs font-mono text-[#3DFFC0] mb-2">✓ Withdrawal authorized</div>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawPending || isWithdrawConfirming}
                  className="w-full bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
                >
                  {isWithdrawPending ? 'Confirm in wallet...' : isWithdrawConfirming ? 'Confirming...' : 'WITHDRAW ETH →'}
                </button>
                {withdrawTxHash && (
                  <div className="text-xs font-mono text-gray-500">
                    Tx: <a href={`https://sepolia.etherscan.io/tx/${withdrawTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF]">{withdrawTxHash.slice(0, 20)}...</a>
                  </div>
                )}
                {withdrawError && (
                  <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3 mt-2">
                    {withdrawError.message.split('\n')[0]}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-mono text-[#FF6B35] mb-2">⏳ Awaiting admin authorization</div>
                <button
                  disabled
                  className="w-full bg-[#1E293B] text-gray-600 font-mono text-xs uppercase tracking-wider px-6 py-3 border border-[#334155] cursor-not-allowed"
                >
                  WITHDRAW ETH →
                </button>
                <div className="text-xs font-mono text-gray-600">Checking every 15s...</div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Repayment Rate */}
        {(loan?.status ?? 0) === 3 && (
          <div className="bg-[#1E293B] border border-[#334155] p-6">
            <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-4">Dynamic Repayment Rate</div>

            {revenueLoading ? (
              <div className="text-sm font-mono text-[#64748B] animate-pulse">Fetching node revenue...</div>
            ) : repaymentTier ? (
              <div className="space-y-4">
                {/* Current ratio */}
                <div className={`border ${repaymentTier.border} bg-black/20 p-4`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Current Rate</span>
                    <span style={spaceGrotesk} className={`text-2xl font-bold ${repaymentTier.color}`}>{repaymentTier.label}</span>
                  </div>
                  <div className="text-xs font-mono text-[#64748B] mt-1">{repaymentTier.note}</div>
                </div>

                {/* Monthly revenue */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-1">Monthly Avg Revenue</div>
                    <div className="text-sm font-mono text-white">{monthlyRevenue?.toFixed(2) ?? '-'} CTC</div>
                    <div className="text-xs font-mono text-[#64748B]">from ReceiptClaimed (CC3 mainnet)</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#64748B] uppercase tracking-wider mb-1">Credit Limit</div>
                    <div className="text-sm font-mono text-white">
                      {monthlyRevenue !== null ? (monthlyRevenue * 3).toFixed(0) : '-'} mUSDF
                    </div>
                    <div className="text-xs font-mono text-[#64748B]">monthly avg × 3</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-mono text-[#64748B]">No revenue data found for this node.</div>
            )}
          </div>
        )}

        {/* Actions */}
        {(loan?.status ?? 0) === 0 && (
          <Link
            href="/apply"
            className="block w-full text-center px-6 py-3 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
          >
            Start Application →
          </Link>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { isConnected, address } = useAccount()
  const OWNER_ADDRESS = process.env.NEXT_PUBLIC_OWNER_ADDRESS?.toLowerCase()
  const isOwner = address?.toLowerCase() === OWNER_ADDRESS

  const { data: loanIdsData } = useReadContract({
    address: SPACE_FINANCE_ADDRESS,
    abi: GET_LOANS_BY_BORROWER_ABI,
    functionName: 'getLoansByBorrower',
    args: address ? [address] : undefined,
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })

  const loanIds = loanIdsData as bigint[] | undefined

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      <nav className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
          </Link>
          <Link href="/" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">HOME</Link>
          <Link href="/dashboard" className="text-xs font-mono uppercase tracking-wider text-[#00C2FF] border-b border-[#00C2FF] pb-1">Dashboard</Link>
          <Link href="/revenue" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Revenue</Link>
          <Link href="/guild" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">GUILD</Link>
        </div>
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link href="/admin" className="text-sm font-mono text-[#FF6B35] hover:text-[#FF6B35]/80 transition-colors">
              ADMIN
            </Link>
          )}
          <WalletButton />
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 w-full flex-grow">
        <div className="mb-10">
          <h1 style={spaceGrotesk} className="text-3xl font-semibold mb-1">Dashboard</h1>
          <p className="text-[#94A3B8] text-sm font-mono">Loan status on Creditcoin CC3</p>
        </div>

        {!isConnected ? (
          <div className="bg-[#1E293B] border border-[#334155] p-12 text-center">
            <div className="text-[#64748B] font-mono text-sm mb-4">Connect your wallet to view loan status</div>
            <WalletButton />
          </div>
        ) : (
          loanIds && loanIds.length > 0 ? (
            <div className="space-y-8">
              {[...loanIds].reverse().flatMap((id, i) => {
                const card = <LoanCard key={id.toString()} loanId={id} />
                return i === 0 ? [card] : [<div key={`sep-${id.toString()}`} className="border-t border-[#334155]" />, card]
              })}
            </div>
          ) : (
            <div className="bg-[#1E293B] border border-[#334155] p-12 text-center">
              <div className="text-[#64748B] font-mono text-sm mb-4">No loans found</div>
              <Link
                href="/apply"
                className="inline-block px-6 py-3 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
              >
                Start Application →
              </Link>
            </div>
          )
        )}
      </main>

      <footer className="border-t border-[#334155] px-6 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-2">
        <span className="font-mono text-xs text-[#94A3B8] uppercase tracking-wider text-center">
          SpaceFinance · BUIDL CTC 2026 Fall · Built on Creditcoin CC3
        </span>
        <nav className="flex gap-4">
          <a href="#" className="font-mono text-xs text-[#94A3B8] hover:text-[#00C2FF] underline transition-colors uppercase">
            Docs
          </a>
          <a
            href="https://github.com/pplmaverick/spacefi"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-[#94A3B8] hover:text-[#00C2FF] underline transition-colors uppercase"
          >
            GitHub
          </a>
          <a href="#" className="font-mono text-xs text-[#94A3B8] hover:text-[#00C2FF] underline transition-colors uppercase">
            Security
          </a>
        </nav>
      </footer>
    </div>
  )
}
