'use client'
import { useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { CONTRACTS, GUILD_POOL_ABI } from '@/lib/contracts'
import { cc3Testnet } from '@/lib/chains'

type Tab = 'create' | 'join' | 'status'

export default function GuildPage() {
  const [tab, setTab] = useState<Tab>('status')
  const { address, isConnected, chainId } = useAccount()
  const isRightChain = chainId === cc3Testnet.id

  // 查詢當前用戶 guild 狀態
  const { data: guildId } = useReadContract({
    address: CONTRACTS.guildPool.address,
    abi: GUILD_POOL_ABI,
    functionName: 'memberToGuildId',
    args: [address!],
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })
  const { data: isFrozen } = useReadContract({
    address: CONTRACTS.guildPool.address,
    abi: GUILD_POOL_ABI,
    functionName: 'isGuildFrozen',
    args: [address!],
    chainId: cc3Testnet.id,
    query: { enabled: !!address && guildId !== undefined && guildId > 0n },
  })
  const { data: guild } = useReadContract({
    address: CONTRACTS.guildPool.address,
    abi: GUILD_POOL_ABI,
    functionName: 'getGuild',
    args: [guildId!],
    chainId: cc3Testnet.id,
    query: { enabled: !!guildId && guildId > 0n },
  })

  const inGuild = guildId !== undefined && guildId > 0n

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
          <h1 className="text-3xl font-bold mt-4 mb-1">Guild Pool</h1>
          <p className="text-gray-500 text-sm font-mono">Grameen Bank model · 5-member peer accountability</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {(['status', 'create', 'join'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-mono text-sm transition-colors ${tab === t ? 'bg-cyan-500 text-black' : 'border border-[#1a2744] text-gray-400 hover:border-cyan-500/50'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <WalletButton requiredChainId={cc3Testnet.id} />

        {isConnected && isRightChain && (
          <div className="mt-6">
            {tab === 'status' && <StatusTab guildId={guildId} guild={guild} isFrozen={isFrozen} inGuild={inGuild} address={address} />}
            {tab === 'create' && <CreateTab address={address} inGuild={inGuild} />}
            {tab === 'join' && <JoinTab address={address} inGuild={inGuild} />}
          </div>
        )}
      </main>
    </div>
  )
}

function StatusTab({ guildId, guild, isFrozen, inGuild, address }: {
  guildId: bigint | undefined
  guild: readonly [readonly `0x${string}`[], readonly boolean[], boolean, bigint] | undefined
  isFrozen: boolean | undefined
  inGuild: boolean
  address: `0x${string}` | undefined
}) {
  if (!inGuild) {
    return (
      <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 text-center">
        <div className="text-gray-500 font-mono text-sm mb-4">You are not in any guild</div>
        <p className="text-gray-600 text-xs font-mono">Create a new guild or ask a guild creator to include your address, then join after owner approval.</p>
      </div>
    )
  }

  return (
    <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 space-y-4">
      <div className="flex justify-between font-mono text-sm">
        <span className="text-gray-500">Guild ID</span>
        <span className="text-cyan-400">{guildId?.toString()}</span>
      </div>
      <div className="flex justify-between font-mono text-sm">
        <span className="text-gray-500">Members</span>
        <span className="text-white">{guild?.[3]?.toString() ?? '—'} / 5</span>
      </div>
      <div className="flex justify-between font-mono text-sm">
        <span className="text-gray-500">Status</span>
        {isFrozen
          ? <span className="text-red-400">● Frozen</span>
          : <span className="text-green-400">● Active</span>
        }
      </div>
      <div className="border-t border-[#1a2744] pt-4">
        <div className="text-xs font-mono text-gray-500 mb-2 uppercase tracking-wider">Members</div>
        {guild?.[0]?.map((m, i) => (
          <div key={i} className={`flex justify-between font-mono text-xs py-1 ${m === address ? 'text-cyan-400' : 'text-gray-400'}`}>
            <span>{m.slice(0, 10)}...{m.slice(-6)}</span>
            <span>{guild[1][i] ? '✓ approved' : 'pending'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateTab({ address, inGuild }: { address: `0x${string}` | undefined; inGuild: boolean }) {
  const [members, setMembers] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState('')
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (inGuild) return <div className="text-gray-500 font-mono text-sm">You are already in a guild.</div>

  const allMembers: `0x${string}`[] = [address!, ...members.map(m => m as `0x${string}`)]

  function handleCreate() {
    for (const m of members) {
      if (!m.startsWith('0x') || m.length !== 42) {
        setError('All members must be valid 0x addresses (42 chars)')
        return
      }
    }
    setError('')
    writeContract({
      address: CONTRACTS.guildPool.address,
      abi: GUILD_POOL_ABI,
      functionName: 'createGuild',
      args: [allMembers as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`]],
      chainId: cc3Testnet.id,
    })
  }

  return (
    <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 space-y-4">
      <p className="text-gray-400 text-sm font-mono">You (creator) will be members[0]. Add 4 more member addresses.</p>
      <div className="space-y-2">
        <div className="font-mono text-xs text-gray-500 px-4 py-2 bg-[#080c14] border border-[#1a2744] rounded-lg">
          members[0]: {address} (you)
        </div>
        {members.map((m, i) => (
          <input
            key={i}
            type="text"
            value={m}
            onChange={e => { const n = [...members]; n[i] = e.target.value; setMembers(n) }}
            placeholder={`members[${i + 1}]: 0x...`}
            className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full focus:outline-none focus:border-cyan-500 text-sm"
          />
        ))}
      </div>
      {error && <div className="text-xs font-mono text-red-400">{error}</div>}
      {writeError && <div className="text-xs font-mono text-red-400">{writeError.message.split('\n')[0]}</div>}
      {isSuccess && <div className="text-xs font-mono text-green-400">Guild created! Wait for owner approval before joining.</div>}
      <button
        onClick={handleCreate}
        disabled={isPending}
        className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono disabled:opacity-50"
      >
        {isPending ? 'Confirm in wallet...' : 'Create Guild →'}
      </button>
    </div>
  )
}

function JoinTab({ address, inGuild }: { address: `0x${string}` | undefined; inGuild: boolean }) {
  const [guildIdInput, setGuildIdInput] = useState('')
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (inGuild) return <div className="text-gray-500 font-mono text-sm">You are already in a guild.</div>

  function handleJoin() {
    if (!guildIdInput || isNaN(Number(guildIdInput))) return
    writeContract({
      address: CONTRACTS.guildPool.address,
      abi: GUILD_POOL_ABI,
      functionName: 'joinGuild',
      args: [BigInt(guildIdInput)],
      chainId: cc3Testnet.id,
    })
  }

  return (
    <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 space-y-4">
      <p className="text-gray-400 text-sm font-mono">Enter the guild ID you were invited to. Owner must have approved your address first.</p>
      <input
        type="number"
        value={guildIdInput}
        onChange={e => setGuildIdInput(e.target.value)}
        placeholder="Guild ID (e.g. 1)"
        className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 focus:outline-none focus:border-cyan-500"
      />
      {writeError && <div className="text-xs font-mono text-red-400">{writeError.message.split('\n')[0]}</div>}
      {isSuccess && <div className="text-xs font-mono text-green-400">Joined guild successfully!</div>}
      <button
        onClick={handleJoin}
        disabled={isPending || !guildIdInput}
        className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono disabled:opacity-50"
      >
        {isPending ? 'Confirm in wallet...' : 'Join Guild →'}
      </button>
    </div>
  )
}
