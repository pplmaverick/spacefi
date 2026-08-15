'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Nav */}
      <nav className="border-b border-[#1a2744] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <span className="text-cyan-400 text-xs font-mono">SF</span>
          </div>
          <span className="font-mono text-sm text-gray-300 tracking-widest uppercase">SpaceFinance</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors font-mono">Dashboard</Link>
          <Link href="/revenue" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors font-mono">Revenue</Link>
          <WalletButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-16 max-w-5xl mx-auto">
        <div className="mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-400 text-xs font-mono tracking-widest uppercase">Creditcoin CC3 · DePIN Track</span>
        </div>
        <h1 className="text-5xl font-bold leading-tight mb-6">
          Finance your<br />
          <span className="text-cyan-400">Spacecoin node</span><br />
          on-chain.
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mb-10 leading-relaxed">
          Deposit ETH as collateral on Sepolia. Prove your node identity via USC cross-chain attestation.
          Receive mUSDF financing on Creditcoin CC3 — trustlessly, without intermediaries.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/apply"
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
          >
            Apply for Financing →
          </Link>
          <Link
            href="/revenue"
            className="px-6 py-3 border border-[#1a2744] text-gray-300 rounded-lg hover:border-cyan-500/50 hover:text-cyan-400 transition-colors font-mono text-sm"
          >
            View Node Revenue
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-t border-b border-[#1a2744] px-6 py-6">
        <div className="max-w-5xl mx-auto grid grid-cols-4 gap-8">
          {[
            { label: 'Protocol', value: 'USC Attestcoin' },
            { label: 'Collateral Chain', value: 'Sepolia ETH' },
            { label: 'Financing Chain', value: 'CC3 Testnet' },
            { label: 'Attestation Time', value: '8–10 min' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">{label}</div>
              <div className="text-white font-mono text-sm">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-10">How it works</h2>
        <div className="space-y-0">
          {[
            { chain: 'SEPOLIA', step: 'Deposit collateral', desc: 'Lock ETH in CollateralVault. Receive a loanId on-chain.', color: 'border-blue-500/40 text-blue-400' },
            { chain: 'USC', step: 'Attestation #1', desc: 'Creditcoin USC attests your Deposited event. Wait 8–10 minutes.', color: 'border-purple-500/40 text-purple-400' },
            { chain: 'SEPOLIA', step: 'Register node identity', desc: 'Submit your Spacecoin nodeId to NodeRegistry.', color: 'border-blue-500/40 text-blue-400' },
            { chain: 'USC', step: 'Attestation #2', desc: 'USC attests NodeRegistered. SpaceFinance auto-releases mUSDF.', color: 'border-purple-500/40 text-purple-400' },
            { chain: 'CC3', step: 'Financing active', desc: 'Loan status turns Active. mUSDF arrives in your wallet.', color: 'border-cyan-500/40 text-cyan-400' },
          ].map(({ chain, step, desc, color }, i) => (
            <div key={i} className="flex gap-6 items-start py-6 border-b border-[#1a2744]">
              <div className="flex-shrink-0 w-6 text-gray-600 font-mono text-sm pt-0.5">{String(i + 1).padStart(2, '0')}</div>
              <div className={`flex-shrink-0 px-2 py-0.5 border rounded text-xs font-mono ${color}`}>{chain}</div>
              <div>
                <div className="text-white font-medium mb-1">{step}</div>
                <div className="text-gray-500 text-sm">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1a2744] px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-gray-600 text-xs font-mono">SpaceFinance · BUIDL CTC 2026</span>
          <span className="text-gray-600 text-xs font-mono">Built on Creditcoin USC Protocol</span>
        </div>
      </footer>
    </div>
  )
}
