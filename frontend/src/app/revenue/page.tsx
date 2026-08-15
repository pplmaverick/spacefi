'use client'
import { useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { cc3Testnet } from '@/lib/chains'
import { fetchNodeRevenue, type RevenueRecord } from '@/lib/blockscout'

const ESCROW = process.env.NEXT_PUBLIC_TOKEN_PAYMENT_ESCROW ?? ''
const BLOCKSCOUT_CC3 = 'https://creditcoin.blockscout.com'

export default function RevenuePage() {
  const [nodeIdInput, setNodeIdInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<RevenueRecord[] | null>(null)
  const [fetchError, setFetchError] = useState('')

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
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors font-mono">Dashboard</Link>
          <WalletButton requiredChainId={cc3Testnet.id} />
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">Node Revenue</h1>
          <p className="text-gray-500 text-sm font-mono">
            Spacecoin <span className="text-gray-400">TokenPaymentEscrow</span> · CC3 Mainnet
          </p>
        </div>

        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6 mb-6">
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">Query by Node ID</div>
          <div className="flex gap-3">
            <input
              type="text"
              value={nodeIdInput}
              onChange={e => { setNodeIdInput(e.target.value); setInputError('') }}
              placeholder="0x0000000000000000000000000000000000000000000000000000000000000001"
              disabled={loading}
              className="flex-1 bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm disabled:opacity-50"
            />
            <button
              onClick={handleQuery}
              disabled={loading}
              className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono text-sm disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Query'}
            </button>
          </div>
          {inputError && <div className="text-xs font-mono text-red-400 mt-2">{inputError}</div>}
          <div className="text-xs text-gray-700 mt-2 font-mono">
            Escrow:{' '}
            <a
              href={`${BLOCKSCOUT_CC3}/address/${ESCROW}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-cyan-400 transition-colors"
            >
              {ESCROW ? `${ESCROW.slice(0, 10)}...${ESCROW.slice(-6)}` : 'loading...'}
            </a>
          </div>
        </div>

        {fetchError && (
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3 mb-6">
            {fetchError}
          </div>
        )}

        {records !== null && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Total Revenue', value: `${total} CTC` },
                { label: 'Monthly Avg', value: `${avg} CTC` },
                { label: 'Records', value: records.length.toString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-4">
                  <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                  <div className="text-xl font-mono text-cyan-400">{value}</div>
                </div>
              ))}
            </div>

            {records.length === 0 ? (
              <div className="text-center py-16 text-gray-600 font-mono text-sm">
                No revenue records found for this node ID
              </div>
            ) : (
              <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl overflow-hidden">
                <div className="grid grid-cols-3 px-6 py-3 border-b border-[#1a2744] text-xs font-mono text-gray-500 uppercase tracking-wider">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Tx</span>
                </div>
                {records.map((r) => (
                  <div key={`${r.txHash}-${r.logIndex}`} className="grid grid-cols-3 px-6 py-4 border-b border-[#1a2744] last:border-0 hover:bg-[#111827] transition-colors">
                    <span className="font-mono text-sm text-gray-300">{r.date}</span>
                    <span className="font-mono text-sm text-white">{r.amount} CTC</span>
                    <a
                      href={`${BLOCKSCOUT_CC3}/tx/${r.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-cyan-600 hover:text-cyan-400 transition-colors"
                    >
                      {r.txHash.slice(0, 10)}...{r.txHash.slice(-6)}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {records === null && !loading && !fetchError && (
          <div className="text-center py-16 text-gray-700 font-mono text-sm">
            Enter a node ID above to load revenue history
          </div>
        )}
      </main>
    </div>
  )
}
