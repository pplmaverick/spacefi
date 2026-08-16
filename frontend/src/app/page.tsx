'use client'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC]">
      {/* Nav */}
      <nav className="border-b border-[#334155] px-6 md:px-8 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0F172A]">
        <div className="flex items-center gap-6">
          <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
          <div className="hidden md:flex gap-6">
            <Link href="/" className="text-sm font-mono text-[#00C2FF] border-b border-[#00C2FF] transition-colors">HOME</Link>
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
          <WalletButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[1440px] mx-auto px-6 md:px-8 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
        <div className="flex flex-col gap-6 z-10">
          <div className="inline-flex items-center gap-2 bg-[#1E293B] border border-[#334155] px-3 py-1 w-fit">
            <span className="text-[#00C2FF] text-[10px]">•</span>
            <span className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-wider">CREDITCOIN CC3 · DEPIN TRACK</span>
          </div>
          <h1 style={spaceGrotesk} className="text-5xl font-semibold leading-tight">
            Finance your <br />
            <span className="text-[#00C2FF]">Spacecoin node</span> <br />
            on-chain.
          </h1>
          <p className="text-[#94A3B8] text-lg max-w-xl leading-relaxed">
            Deposit ETH as collateral on Sepolia. Prove your node identity via USC cross-chain attestation.
            Receive mUSDF financing on Creditcoin CC3 — trustlessly, without intermediaries.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link
              href="/apply"
              className="group bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] flex items-center justify-center gap-2"
            >
              Apply for Financing
              <span className="inline-block group-hover:translate-x-1 transition-transform">→</span>
            </Link>
            <Link
              href="/revenue"
              className="bg-transparent text-[#F8FAFC] font-mono text-xs uppercase tracking-wider px-6 py-3 border border-[#334155] hover:border-[#00C2FF] transition-colors text-center"
            >
              View Node Revenue
            </Link>
          </div>
        </div>

        {/* Orbital animation */}
        <div className="relative w-full h-[400px] lg:h-[600px] bg-[#1E293B] border border-[#334155] overflow-hidden flex items-center justify-center">
          <div className="w-full h-full opacity-80 mix-blend-screen">
            <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              {/* Central Node Cluster */}
              <circle cx="200" cy="200" r="10" fill="#00C2FF" />
              <circle cx="185" cy="185" r="4" fill="#00C2FF" opacity="0.6" />
              <circle cx="215" cy="215" r="4" fill="#00C2FF" opacity="0.6" />
              <circle cx="215" cy="185" r="4" fill="#00C2FF" opacity="0.6" />
              <circle cx="185" cy="215" r="4" fill="#00C2FF" opacity="0.6" />
              {/* Orbit Paths */}
              <ellipse cx="200" cy="200" rx="160" ry="80" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
              <ellipse cx="200" cy="200" rx="80" ry="160" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
              {/* Traveling Orbit Dots */}
              <circle r="4" fill="#00C2FF">
                <animateMotion dur="8s" repeatCount="indefinite" path="M 40,200 A 160,80 0 1,1 360,200 A 160,80 0 1,1 40,200" />
              </circle>
              <circle r="4" fill="#3DFFC0">
                <animateMotion dur="12s" repeatCount="indefinite" path="M 200,40 A 80,160 0 1,1 200,360 A 80,160 0 1,1 200,40" />
              </circle>
              {/* Attestation Pulses */}
              <circle cx="200" cy="200" r="10" stroke="#00C2FF" strokeWidth="2">
                <animate attributeName="r" from="10" to="60" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="3s" repeatCount="indefinite" />
              </circle>
            </svg>
          </div>
          <div className="absolute top-2 left-2 font-mono text-xs text-[#334155]">SYS.OP.STATUS // ACTIVE</div>
          <div className="absolute bottom-2 right-2 font-mono text-xs text-[#00C2FF] opacity-50 flex items-center gap-2">
            <span className="w-2 h-2 bg-[#00C2FF] rounded-full animate-pulse" />
            SYNCING
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-[#334155] bg-[#1E293B]">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[#334155]">
          {[
            { label: 'Protocol', value: 'USC Attestcoin' },
            { label: 'Collateral Chain', value: 'Sepolia ETH' },
            { label: 'Financing Chain', value: 'CC3 Testnet' },
            { label: 'Attestation Time', value: '8–10 min', accent: true },
          ].map(({ label, value, accent }) => (
            <div key={label} className="p-4 flex flex-col gap-1">
              <span className="font-mono text-xs text-[#94A3B8] uppercase tracking-wider">{label}</span>
              <span className={`font-mono text-sm ${accent ? 'text-[#00C2FF]' : 'text-[#F8FAFC]'}`}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Operational Protocol */}
      <section className="max-w-[1440px] mx-auto px-6 md:px-8 py-16">
        <div className="mb-8">
          <h2 style={spaceGrotesk} className="text-2xl md:text-3xl font-semibold">
            OPERATIONAL PROTOCOL
          </h2>
          <div className="w-16 h-1 bg-[#00C2FF] mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { chain: 'SEPOLIA', title: 'Lock Collateral', desc: 'Deposit ETH into the Sepolia smart contract to secure your financing limit.' },
            { chain: 'USC', title: 'Request Attestation', desc: 'Initiate cross-chain message via Universal Settlement Coin protocol.' },
            { chain: 'USC', title: 'Verify Node Status', desc: 'Attestors cryptographically verify your Spacecoin node health and collateral state.' },
            { chain: 'CC3', title: 'Mint Financing', desc: 'Creditcoin CC3 contract automatically mints mUSDF based on attested collateral.' },
            { chain: 'CC3', title: 'Repay', desc: 'Node revenue auto-routes to the repayment contract at your current dynamic rate.' },
            { chain: 'SEPOLIA', title: 'Withdraw Collateral', desc: 'Once mUSDF is repaid, cross-chain signal unlocks your initial ETH deposit.' },
          ].map(({ chain, title, desc }, i) => (
            <div
              key={title}
              className="bg-[#1E293B] border border-[#334155] p-4 flex flex-col gap-2 relative group hover:border-[#00C2FF] transition-colors"
            >
              <div className="absolute top-0 right-0 bg-[#334155] text-[#94A3B8] font-mono px-2 py-1 text-[10px] opacity-50 group-hover:opacity-100 transition-opacity">
                [{chain}]
              </div>
              <div className="font-mono text-lg text-[#00C2FF]">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-sm text-[#94A3B8]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* System Advantages */}
      <section className="max-w-[1440px] mx-auto px-6 md:px-8 py-16 border-t border-[#334155]">
        <div className="mb-8">
          <h2 style={spaceGrotesk} className="text-2xl md:text-3xl font-semibold">
            SYSTEM ADVANTAGES
          </h2>
          <div className="w-16 h-1 bg-[#00C2FF] mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'Trustless cross-chain',
              desc: 'Powered by USC attestations, removing centralized oracles or bridges. Your collateral state is verified cryptographically by the network.',
            },
            {
              title: 'Revenue-based credit',
              desc: 'Node performance dictates credit limits. Smart contracts auto-route DePIN yield to service debt, minimizing manual treasury management.',
            },
            {
              title: 'Guild accountability',
              desc: 'Delegated trust mechanisms allow established operators to vouch for new nodes, creating a decentralized web of trust for unsecured tranches.',
            },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-[#1E293B] border border-[#334155] p-6 flex flex-col gap-4">
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-sm text-[#94A3B8]">{desc}</p>
            </div>
          ))}
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
