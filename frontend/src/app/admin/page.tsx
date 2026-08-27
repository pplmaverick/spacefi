'use client'
import { useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { CONTRACTS, NODE_REGISTRY_ABI, COLLATERAL_VAULT_ABI, GUILD_POOL_ABI } from '@/lib/contracts'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS as `0x${string}` | undefined

export default function AdminPage() {
  const { address } = useAccount()
  const isOwner = address && OWNER ? address.toLowerCase() === OWNER.toLowerCase() : false

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      <nav className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
          </Link>
          <Link href="/" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">HOME</Link>
          <Link href="/dashboard" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Dashboard</Link>
          <Link href="/revenue" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Revenue</Link>
          <Link href="/guild" className="text-sm font-mono text-gray-400 hover:text-[#00C2FF] transition-colors">GUILD</Link>
        </div>
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link href="/admin" className="text-sm font-mono text-[#FF6B35] border-b border-[#FF6B35] transition-colors">
              ADMIN
            </Link>
          )}
          <WalletButton />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 pt-16 pb-24 w-full flex-grow">
        <div className="mb-10">
          <Link href="/" className="text-xs font-mono text-[#64748B] hover:text-[#00C2FF] transition-colors">← Back</Link>
          <h1 style={spaceGrotesk} className="text-3xl font-semibold mt-4 mb-1 uppercase">Admin Panel</h1>
          <p className="text-[#94A3B8] text-sm font-mono">Owner-only operations</p>
        </div>

        {!address && (
          <div className="text-[#64748B] font-mono text-sm">Connect wallet to continue.</div>
        )}

        {address && !isOwner && (
          <div className="text-[#FF6B35] font-mono text-sm bg-[#FF6B35]/10 border border-[#FF6B35]/40 px-4 py-3">
            ⚠ Connected address is not the owner.
          </div>
        )}

        {address && isOwner && (
          <div className="space-y-6">
            <ApproveNodeSection />
            <AuthorizeWithdrawalSection />
            <ApproveMemberSection />
            <FreezeGuildSection />
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

function AdminCard({ title, chain, children }: { title: string; chain: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] p-6">
      <div className="text-xs font-mono text-[#00C2FF] uppercase tracking-wider mb-1">[{chain}]</div>
      <h2 style={spaceGrotesk} className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  )
}

function TxResult({ txHash, explorer }: { txHash: `0x${string}` | undefined; explorer: string }) {
  const { isSuccess, isLoading } = useWaitForTransactionReceipt({ hash: txHash })
  if (!txHash) return null
  return (
    <div className="text-xs font-mono text-[#64748B] mt-2">
      {isLoading && 'Confirming...'}
      {isSuccess && <span className="text-[#3DFFC0]">✓ Confirmed · </span>}
      <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF]/70 hover:text-[#00C2FF]">
        {txHash.slice(0, 20)}...
      </a>
    </div>
  )
}

function TerminalInput({ value, onChange, placeholder, type = 'text' }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div className="bg-[#0F172A] border border-[#334155] flex items-center focus-within:border-2 focus-within:border-[#00C2FF]">
      <span className="font-mono text-sm text-[#64748B] px-2 select-none border-r border-[#334155]">&gt;</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-none text-white font-mono text-sm focus:outline-none focus:ring-0 px-2 py-2"
      />
    </div>
  )
}

function ApproveNodeSection() {
  const [operator, setOperator] = useState('')
  const [nodeId, setNodeId] = useState('')
  const { writeContract, data: txHash, isPending, error } = useWriteContract()

  return (
    <AdminCard title="Approve Node" chain="SEPOLIA">
      <WalletButton requiredChainId={sepolia.id} />
      <div className="mt-4 space-y-3">
        <TerminalInput value={operator} onChange={setOperator} placeholder="Operator address (0x...)" />
        <TerminalInput value={nodeId} onChange={setNodeId} placeholder="Node ID (0x... bytes32)" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button
          onClick={() => writeContract({ address: CONTRACTS.nodeRegistry.address, abi: NODE_REGISTRY_ABI, functionName: 'approveNode', args: [operator as `0x${string}`, nodeId as `0x${string}`], chainId: sepolia.id })}
          disabled={isPending || !operator || !nodeId}
          className="px-4 py-2 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : 'Approve Node'}
        </button>
        <TxResult txHash={txHash} explorer="https://sepolia.etherscan.io" />
      </div>
    </AdminCard>
  )
}

function AuthorizeWithdrawalSection() {
  const [loanId, setLoanId] = useState('')
  const { writeContract, data: txHash, isPending, error } = useWriteContract()

  return (
    <AdminCard title="Authorize Withdrawal" chain="SEPOLIA">
      <WalletButton requiredChainId={sepolia.id} />
      <p className="text-xs font-mono text-[#FF6B35]/80 mt-3 mb-3">Manual fallback only — repaying on CC3 now auto-releases collateral via the USC write-ability layer. Use this if that automated relay ever fails.</p>
      <div className="mt-2 space-y-3">
        <TerminalInput value={loanId} onChange={setLoanId} placeholder="Sepolia Loan ID" type="number" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button
          onClick={() => writeContract({ address: CONTRACTS.collateralVault.address, abi: COLLATERAL_VAULT_ABI, functionName: 'authorizeWithdrawal', args: [BigInt(loanId)], chainId: sepolia.id })}
          disabled={isPending || !loanId}
          className="px-4 py-2 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : 'Authorize Withdrawal'}
        </button>
        <TxResult txHash={txHash} explorer="https://sepolia.etherscan.io" />
      </div>
    </AdminCard>
  )
}

function ApproveMemberSection() {
  const [guildId, setGuildId] = useState('')
  const [member, setMember] = useState('')
  const { writeContract, data: txHash, isPending, error } = useWriteContract()

  return (
    <AdminCard title="Approve Guild Member" chain="CC3 TESTNET">
      <WalletButton requiredChainId={cc3Testnet.id} />
      <div className="mt-4 space-y-3">
        <TerminalInput value={guildId} onChange={setGuildId} placeholder="Guild ID" type="number" />
        <TerminalInput value={member} onChange={setMember} placeholder="Member address (0x...)" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button
          onClick={() => writeContract({ address: CONTRACTS.guildPool.address, abi: GUILD_POOL_ABI, functionName: 'approveGuildMember', args: [BigInt(guildId), member as `0x${string}`], chainId: cc3Testnet.id })}
          disabled={isPending || !guildId || !member}
          className="px-4 py-2 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : 'Approve Member'}
        </button>
        <TxResult txHash={txHash} explorer="https://cc3-testnet.blockscout.com" />
      </div>
    </AdminCard>
  )
}

function FreezeGuildSection() {
  const [guildId, setGuildId] = useState('')
  const [defaulter, setDefaulter] = useState('')
  const { writeContract, data: txHash, isPending, error } = useWriteContract()

  return (
    <AdminCard title="Freeze Guild" chain="CC3 TESTNET">
      <WalletButton requiredChainId={cc3Testnet.id} />
      <div className="mt-4 space-y-3">
        <TerminalInput value={guildId} onChange={setGuildId} placeholder="Guild ID" type="number" />
        <TerminalInput value={defaulter} onChange={setDefaulter} placeholder="Defaulter address (0x...)" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button
          onClick={() => writeContract({ address: CONTRACTS.guildPool.address, abi: GUILD_POOL_ABI, functionName: 'freezeGuild', args: [BigInt(guildId), defaulter as `0x${string}`], chainId: cc3Testnet.id })}
          disabled={isPending || !guildId || !defaulter}
          className="px-4 py-2 bg-[#FF6B35] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#FF6B35]/80 transition-colors border border-[#FF6B35] disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : '⚠ Freeze Guild'}
        </button>
        <TxResult txHash={txHash} explorer="https://cc3-testnet.blockscout.com" />
      </div>
    </AdminCard>
  )
}
