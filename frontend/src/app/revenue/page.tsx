'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount } from 'wagmi'
import { fetchNodeRevenue, type RevenueRecord } from '@/lib/blockscout'

const ESCROW = process.env.NEXT_PUBLIC_TOKEN_PAYMENT_ESCROW ?? ''
const BLOCKSCOUT_CC3 = 'https://creditcoin.blockscout.com'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

const PAGE_SIZE = 10

function splitNumber(value: string) {
  const [intPart, decPart = '00'] = value.split('.')
  return { intPart: Number(intPart).toLocaleString('en-US'), decPart }
}

export default function RevenuePage() {
  const OWNER_ADDRESS = process.env.NEXT_PUBLIC_OWNER_ADDRESS?.toLowerCase()
  const { address } = useAccount()
  const isOwner = address?.toLowerCase() === OWNER_ADDRESS
  const [nodeIdInput, setNodeIdInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<RevenueRecord[] | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [currentPage, setCurrentPage] = useState(0)

  useEffect(() => {
    setCurrentPage(0)
  }, [records])

  function validate(): boolean {
    if (!nodeIdInput.startsWith('0x') || nodeIdInput.length !== 66) {
      setInputError('Node ID must be 0x + 64 hex characters')
      return false
    }
    setInputError('')
    return true
  }

  async function handleQuery() {
    if (!validate()) return
    setLoading(true)
    setFetchError('')
    setRecords(null)
    try {
      const data = await fetchNodeRevenue(nodeIdInput)
      setRecords(data)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const total = records ? records.reduce((s, r) => s + parseFloat(r.amount), 0).toFixed(2) : '0'
  const avg = records && records.length > 0 ? (parseFloat(total) / records.length).toFixed(2) : '0'

  const totalSplit = splitNumber(total)
  const avgSplit = splitNumber(avg)

  const pageStart = currentPage * PAGE_SIZE
  const pageRecords = records ? records.slice(pageStart, pageStart + PAGE_SIZE) : []
  const pageEnd = records ? Math.min(pageStart + PAGE_SIZE, records.length) : 0
  const hasPrevPage = currentPage > 0
  const hasNextPage = records ? pageStart + PAGE_SIZE < records.length : false

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      <nav className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
          </Link>
          <Link href="/" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">HOME</Link>
          <Link href="/dashboard" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Dashboard</Link>
          <Link href="/revenue" className="text-xs font-mono uppercase tracking-wider text-[#00C2FF] border-b border-[#00C2FF] pb-1">Revenue</Link>
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
          <h1 style={spaceGrotesk} className="text-3xl font-semibold mb-1 uppercase">Node Revenue Verification</h1>
          <p className="text-[#94A3B8] text-sm font-mono">Query on-chain reward distributions for validated DePIN nodes.</p>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] p-4 mb-6 flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex flex-col gap-1 w-full md:w-96">
            <label className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Node ID / Public Key</label>
            <input
              type="text"
              value={nodeIdInput}
              onChange={e => { setNodeIdInput(e.target.value); setInputError('') }}
              placeholder="0x0000000000000000000000000000000000000000000000000000000000000001"
              disabled={loading}
              className="bg-[#0F172A] border border-[#334155] text-white font-mono px-4 py-2 w-full text-sm focus:outline-none focus:border-2 focus:border-[#00C2FF] disabled:opacity-50 transition-all"
            />
            {inputError && <div className="text-xs font-mono text-red-400 mt-1">{inputError}</div>}
          </div>
          <button
            onClick={handleQuery}
            disabled={loading}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 h-[42px] hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50 flex items-center justify-center gap-2 w-full md:w-auto"
          >
            {loading ? 'Loading...' : <>🔍 Query</>}
          </button>
          <div className="text-xs text-[#64748B] font-mono md:ml-2">
            Escrow:{' '}
            <a
              href={`${BLOCKSCOUT_CC3}/address/${ESCROW}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#64748B] hover:text-[#00C2FF] transition-colors"
            >
              {ESCROW ? `${ESCROW.slice(0, 10)}...${ESCROW.slice(-6)}` : 'loading...'}
            </a>
          </div>
        </div>

        {fetchError && (
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3 mb-6">
            {fetchError}
          </div>
        )}

        {records !== null && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-[#1E293B] border border-[#334155] p-4 flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#00C2FF]" />
                <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Total Revenue (CTC)</span>
                <span style={spaceGrotesk} className="text-3xl md:text-4xl font-bold text-white">
                  {totalSplit.intPart}<span className="text-lg text-[#00C2FF]">.{totalSplit.decPart}</span>
                </span>
              </div>
              <div className="bg-[#1E293B] border border-[#334155] p-4 flex flex-col gap-2">
                <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Monthly Avg (CTC)</span>
                <span style={spaceGrotesk} className="text-3xl md:text-4xl font-bold text-white">
                  {avgSplit.intPart}<span className="text-lg text-[#64748B]">.{avgSplit.decPart}</span>
                </span>
              </div>
              <div className="bg-[#1E293B] border border-[#334155] p-4 flex flex-col gap-2">
                <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Records Count</span>
                <span style={spaceGrotesk} className="text-3xl md:text-4xl font-bold text-white">{records.length.toLocaleString('en-US')}</span>
              </div>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-16 text-[#64748B] font-mono text-sm">
                No revenue records found for this node ID
              </div>
            ) : (
              <div className="bg-[#1E293B] border border-[#334155] flex flex-col">
                <div className="border-b border-[#334155] p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                  <h2 style={spaceGrotesk} className="text-lg font-medium text-white">Reward Transactions</h2>
                  <div className="bg-[#00C2FF]/10 border border-[#00C2FF] px-3 py-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#3DFFC0] animate-pulse" />
                    <span className="text-xs font-mono text-[#00C2FF] uppercase tracking-wider">Spacecoin TokenPaymentEscrow · CC3 Mainnet</span>
                  </div>
                </div>

                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-[#334155]">
                        <th className="p-4 text-xs font-mono text-[#64748B] uppercase tracking-wider font-normal w-1/4">Date (UTC)</th>
                        <th className="p-4 text-xs font-mono text-[#64748B] uppercase tracking-wider font-normal w-1/4 text-right">Amount (CTC)</th>
                        <th className="p-4 text-xs font-mono text-[#64748B] uppercase tracking-wider font-normal w-1/2">Tx Hash</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-sm text-white">
                      {pageRecords.map(r => (
                        <tr key={`${r.txHash}-${r.logIndex}`} className="border-b border-[#334155] last:border-0 hover:bg-[#334155]/30 transition-colors">
                          <td className="p-4 text-gray-300">{r.date}</td>
                          <td className="p-4 text-right text-[#00C2FF]">{r.amount}</td>
                          <td className="p-4">
                            <a
                              href={`${BLOCKSCOUT_CC3}/tx/${r.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#64748B] hover:text-[#00C2FF] transition-colors"
                            >
                              {r.txHash.slice(0, 10)}...{r.txHash.slice(-8)}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-[#334155] p-2 flex justify-between items-center">
                  <span className="text-xs font-mono text-[#64748B] px-2">
                    Showing {pageStart + 1}-{pageEnd} of {records.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={!hasPrevPage}
                      className="p-1 border border-[#334155] text-white hover:border-[#00C2FF] hover:text-[#00C2FF] transition-colors disabled:opacity-50 disabled:hover:border-[#334155] disabled:hover:text-white"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => (hasNextPage ? p + 1 : p))}
                      disabled={!hasNextPage}
                      className="p-1 border border-[#334155] text-white hover:border-[#00C2FF] hover:text-[#00C2FF] transition-colors disabled:opacity-50 disabled:hover:border-[#334155] disabled:hover:text-white"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {records === null && !loading && !fetchError && (
          <div className="text-center py-16 text-[#64748B] font-mono text-sm">
            Enter a node ID above to load revenue history
          </div>
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
