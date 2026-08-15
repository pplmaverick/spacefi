'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { cc3Testnet } from '@/lib/chains'
import { LOAN_STATUS } from '@/lib/contracts'

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
