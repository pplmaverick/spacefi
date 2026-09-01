import Link from 'next/link'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

const shipped = [
  {
    title: '4 core contracts + USC write-ability layer',
    detail: 'CollateralVault, NodeRegistry, SpaceFinance, GuildPool — plus Outbox, Inbox, EOAValidator',
  },
  {
    title: 'Bidirectional flow verified on-chain',
    detail: 'Sepolia ↔ Creditcoin CC3, end-to-end',
  },
  {
    title: '75 automated Hardhat tests',
    detail: 'CI passing on every commit',
  },
  {
    title: 'Dynamic LTV via Chainlink',
    detail: 'Loan-to-value tracks the ETH/USD price feed',
  },
]

// Production hero — layout from HeroV4 (left-aligned, indigo, asymmetric split),
// right panel structure from HeroV2 (bordered panel + dividers), content replaced
// with static, verifiable shipped-work items — no live/animated indicators.
export function Hero() {
  return (
    <section className="bg-white text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-start">
        <div className="flex flex-col gap-6">
          <span className="inline-flex items-center gap-2 border border-indigo-200 bg-indigo-50 px-3 py-1 w-fit">
            <span className="text-indigo-600 text-[10px]">•</span>
            <span className="font-mono text-[10px] text-indigo-700 uppercase tracking-widest">
              CREDITCOIN CC3 · ATTESTCOIN USC
            </span>
          </span>

          <h1 style={spaceGrotesk} className="text-4xl md:text-5xl font-semibold leading-[1.08] tracking-tight">
            Unlock liquidity <span className="text-indigo-600">without selling the asset</span>
          </h1>

          <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
            SpaceFinance lets node operators unlock liquidity without selling their assets.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link
              href="/apply"
              className="bg-indigo-600 text-white font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-indigo-700 transition-colors"
            >
              Apply for Financing
            </Link>
            <Link
              href="/revenue"
              className="border border-slate-300 text-slate-700 font-mono text-xs uppercase tracking-wider px-6 py-3 hover:border-indigo-600 hover:text-indigo-600 transition-colors"
            >
              View Node Revenue
            </Link>
          </div>

          <p className="font-mono text-xs text-slate-500 leading-relaxed max-w-lg">
            No bridges. No centralized oracles. No manual admin step. Verified by Attestcoin
            Protocol, both directions.
          </p>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-6 flex flex-col gap-4">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Shipped &amp; verified</span>

          <div className="flex flex-col divide-y divide-slate-200">
            {shipped.map((item) => (
              <div key={item.title} className="py-4 first:pt-0 last:pb-0 flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 shrink-0 bg-indigo-600" />
                <div className="flex flex-col gap-1">
                  <p className="font-mono text-sm text-slate-900 font-medium">{item.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
