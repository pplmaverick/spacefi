'use client'
import { useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { CONTRACTS, NODE_REGISTRY_ABI, COLLATERAL_VAULT_ABI, GUILD_POOL_ABI } from '@/lib/contracts'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS as `0x${string}` | undefined

export default function AdminPage() {
  const { address } = useAccount()
  const isOwner = address && OWNER ? address.toLowerCase() === OWNER.toLowerCase() : false

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <nav className="border-b border-[#1a2744] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <span className="text-cyan-400 text-xs font-mono">SF</span>
          </div>
          <span className="font-mono text-sm text-gray-300 tracking-widest uppercase">SpaceFinance</span>
        </Link>
        <WalletButton />
      </nav>

      <main className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-10">
          <Link href="/" className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors">← Back</Link>
          <h1 className="text-3xl font-bold mt-4 mb-1">Admin Panel</h1>
          <p className="text-gray-500 text-sm font-mono">Owner-only operations</p>
        </div>

        {!address && (
          <div className="text-gray-500 font-mono text-sm">Connect wallet to continue.</div>
        )}

        {address && !isOwner && (
          <div className="text-red-400 font-mono text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
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
    </div>
  )
}

function AdminCard({ title, chain, children }: { title: string; chain: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
      <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">{chain}</div>
      <h2 className="text-lg font-bold mb-4">{title}</h2>
      {children}
    </div>
  )
}

function TxResult({ txHash, explorer }: { txHash: `0x${string}` | undefined; explorer: string }) {
  const { isSuccess, isLoading } = useWaitForTransactionReceipt({ hash: txHash })
  if (!txHash) return null
  return (
    <div className="text-xs font-mono text-gray-500 mt-2">
      {isLoading && 'Confirming...'}
      {isSuccess && <span className="text-green-400">✓ Confirmed · </span>}
      <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-400">
        {txHash.slice(0, 20)}...
      </a>
    </div>
  )
}

function ApproveNodeSection() {
  const [operator, setOperator] = useState('')
  const [nodeId, setNodeId] = useState('')
  const { writeContract, data: txHash, isPending, error } = useWriteContract()

  return (
    <AdminCard title="Approve Node" chain="Sepolia">
      <WalletButton requiredChainId={sepolia.id} />
      <div className="mt-4 space-y-3">
        <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Operator address (0x...)" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full text-sm focus:outline-none focus:border-cyan-500" />
        <input type="text" value={nodeId} onChange={e => setNodeId(e.target.value)} placeholder="Node ID (0x... bytes32)" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full text-sm focus:outline-none focus:border-cyan-500" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button onClick={() => writeContract({ address: CONTRACTS.nodeRegistry.address, abi: NODE_REGISTRY_ABI, functionName: 'approveNode', args: [operator as `0x${string}`, nodeId as `0x${string}`], chainId: sepolia.id })} disabled={isPending || !operator || !nodeId} className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 font-mono text-sm disabled:opacity-50">
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
    <AdminCard title="Authorize Withdrawal" chain="Sepolia">
      <WalletButton requiredChainId={sepolia.id} />
      <p className="text-xs font-mono text-yellow-400/70 mt-3 mb-3">Call after borrower has repaid on CC3. This unlocks their ETH collateral on Sepolia.</p>
      <div className="mt-2 space-y-3">
        <input type="number" value={loanId} onChange={e => setLoanId(e.target.value)} placeholder="Sepolia Loan ID" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 text-sm focus:outline-none focus:border-cyan-500" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button onClick={() => writeContract({ address: CONTRACTS.collateralVault.address, abi: COLLATERAL_VAULT_ABI, functionName: 'authorizeWithdrawal', args: [BigInt(loanId)], chainId: sepolia.id })} disabled={isPending || !loanId} className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 font-mono text-sm disabled:opacity-50">
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
    <AdminCard title="Approve Guild Member" chain="CC3 Testnet">
      <WalletButton requiredChainId={cc3Testnet.id} />
      <div className="mt-4 space-y-3">
        <input type="number" value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="Guild ID" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 text-sm focus:outline-none focus:border-cyan-500" />
        <input type="text" value={member} onChange={e => setMember(e.target.value)} placeholder="Member address (0x...)" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full text-sm focus:outline-none focus:border-cyan-500" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button onClick={() => writeContract({ address: CONTRACTS.guildPool.address, abi: GUILD_POOL_ABI, functionName: 'approveGuildMember', args: [BigInt(guildId), member as `0x${string}`], chainId: cc3Testnet.id })} disabled={isPending || !guildId || !member} className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 font-mono text-sm disabled:opacity-50">
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
    <AdminCard title="Freeze Guild" chain="CC3 Testnet">
      <WalletButton requiredChainId={cc3Testnet.id} />
      <div className="mt-4 space-y-3">
        <input type="number" value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="Guild ID" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 text-sm focus:outline-none focus:border-cyan-500" />
        <input type="text" value={defaulter} onChange={e => setDefaulter(e.target.value)} placeholder="Defaulter address (0x...)" className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full text-sm focus:outline-none focus:border-cyan-500" />
        {error && <div className="text-xs text-red-400 font-mono">{error.message.split('\n')[0]}</div>}
        <button onClick={() => writeContract({ address: CONTRACTS.guildPool.address, abi: GUILD_POOL_ABI, functionName: 'freezeGuild', args: [BigInt(guildId), defaulter as `0x${string}`], chainId: cc3Testnet.id })} disabled={isPending || !guildId || !defaulter} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-500 font-mono text-sm disabled:opacity-50">
          {isPending ? 'Confirming...' : '⚠ Freeze Guild'}
        </button>
        <TxResult txHash={txHash} explorer="https://cc3-testnet.blockscout.com" />
      </div>
    </AdminCard>
  )
}
