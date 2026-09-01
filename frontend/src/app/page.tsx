'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { Hero } from '@/components/Hero'
import { useAccount } from 'wagmi'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

export default function HomePage() {
  const OWNER_ADDRESS = process.env.NEXT_PUBLIC_OWNER_ADDRESS?.toLowerCase()
  const { address } = useAccount()
  const isOwner = address?.toLowerCase() === OWNER_ADDRESS

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC]">
      {/* Nav */}
      <nav className="border-b border-[#334155] px-6 md:px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0F172A]">
        <div className="flex items-center gap-6">
          <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
          <div className="hidden md:flex gap-6">
            <Link href="/" className="text-sm font-mono text-[#00C2FF] border-b border-[#00C2FF] transition-colors">HOME</Link>
            <Link href="/apply" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">
              Apply
            </Link>
            <Link href="/dashboard" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">
              Dashboard
            </Link>
            <Link href="/revenue" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">
              Revenue
            </Link>
            <Link href="/guild" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">GUILD</Link>
          </div>
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

      <Hero />

      {/* Stats bar */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-200">
          {[
            { label: 'Protocol', value: 'USC Attestcoin' },
            { label: 'Collateral Chain', value: 'Sepolia ETH' },
            { label: 'Financing Chain', value: 'CC3 Testnet' },
            { label: 'Attestation Time', value: '8–10 min', accent: true },
          ].map(({ label, value, accent }) => (
            <div key={label} className="p-4 flex flex-col gap-1">
              <span className="font-mono text-xs text-slate-500 uppercase tracking-wider">{label}</span>
              <span className={`font-mono text-sm ${accent ? 'text-indigo-600' : 'text-slate-900'}`}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Operational Protocol */}
      <section className="bg-white">
        <div className="max-w-[1440px] mx-auto px-6 md:px-8 py-16">
          <div className="mb-8">
            <h2 style={spaceGrotesk} className="text-2xl md:text-3xl font-semibold text-slate-900">
              OPERATIONAL PROTOCOL
            </h2>
            <div className="w-16 h-1 bg-indigo-600 mt-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { chain: 'SEPOLIA', title: 'Deposit & Register', desc: 'Lock ETH in CollateralVault and submit your Spacecoin nodeId to NodeRegistry.' },
              { chain: 'USC', title: 'Parallel Attestation', desc: 'USC simultaneously attests your Deposited and NodeRegistered events. Takes 8–10 minutes.' },
              { chain: 'CC3', title: 'Financing Active', desc: 'SpaceFinance releases mUSDF to your wallet after both attestations confirm.' },
              { chain: 'CC3', title: 'Repay', desc: 'Repay your mUSDF loan at your dynamic rate based on node revenue.' },
              { chain: 'USC', title: 'Write-Ability Attestation', desc: "Your repayment is published to CC3's Outbox, signed by USC attestors, and delivered to Sepolia's Inbox — authorizing the unlock automatically. No admin step required." },
              { chain: 'SEPOLIA', title: 'Unlock Collateral', desc: 'Repayment confirmed, ETH collateral returned to your wallet.' },
            ].map(({ chain, title, desc }, i) => (
              <div
                key={title}
                className="bg-slate-50 border border-slate-200 p-4 flex flex-col gap-2 relative group hover:border-indigo-600 transition-colors"
              >
                <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 font-mono px-2 py-1 text-[10px] opacity-50 group-hover:opacity-100 transition-opacity">
                  [{chain}]
                </div>
                <div className="font-mono text-lg text-indigo-600">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="text-lg font-medium text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Advantages */}
      <section className="bg-white border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-6 md:px-8 py-16">
          <div className="mb-8">
            <h2 style={spaceGrotesk} className="text-2xl md:text-3xl font-semibold text-slate-900">
              SYSTEM ADVANTAGES
            </h2>
            <div className="w-16 h-1 bg-indigo-600 mt-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: 'Trustless cross-chain',
                desc: 'Powered by USC attestations, removing centralized oracles or bridges. Your collateral state is verified cryptographically by the network.',
              },
              {
                title: 'Revenue-based credit',
                desc: "Your Spacecoin node's ReceiptClaimed revenue history on CC3 mainnet determines your credit limit — up to monthly average × 3, in addition to ETH collateral.",
              },
              {
                title: 'Guild accountability',
                desc: "Join a 5-node GuildPool based on Grameen Bank's joint-liability model. Any default freezes the guild's borrowing. Members unlock collateral requirements as low as 5%.",
              },
            ].map(({ title, desc }) => (
              <div key={title} className="bg-slate-50 border border-slate-200 p-6 flex flex-col gap-4">
                <h3 className="text-lg font-medium text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#334155] px-6 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-2">
        <span className="font-mono text-xs text-[#00C2FF] uppercase tracking-widest">SpaceFinance</span>
        <span className="font-mono text-xs text-[#94A3B8] uppercase tracking-wider text-center">
          SpaceFinance · BUIDL CTC 2026 Fall · Built on Creditcoin CC3
        </span>
        <nav className="flex gap-4">
          <a href="#" className="font-mono text-xs text-[#94A3B8] hover:text-[#00C2FF] underline transition-colors uppercase">
            Docs
          </a>
          <a href="#" className="font-mono text-xs text-[#94A3B8] hover:text-[#00C2FF] underline transition-colors uppercase">
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
