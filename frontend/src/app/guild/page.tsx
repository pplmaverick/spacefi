'use client'
import { useState } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { CONTRACTS, GUILD_POOL_ABI } from '@/lib/contracts'
import { cc3Testnet } from '@/lib/chains'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

export default function GuildPage() {
  const { address, isConnected } = useAccount()

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
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col">
      <nav className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Dashboard</Link>
          <Link href="/revenue" className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] hover:text-[#00C2FF] transition-colors">Revenue</Link>
          <Link href="/guild" className="text-sm font-mono text-[#00C2FF] border-b border-[#00C2FF] transition-colors">GUILD</Link>
          <WalletButton />
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 w-full flex-grow">
        <div className="mb-10">
          <h1 style={spaceGrotesk} className="text-3xl font-semibold mb-1 uppercase">Guild Pool</h1>
          <p className="text-[#94A3B8] text-sm font-mono">Grameen Bank model · 5-member peer accountability</p>
        </div>

        {!isConnected ? (
          <div className="bg-[#1E293B] border border-[#334155] p-12 text-center">
            <div className="text-[#64748B] font-mono text-sm mb-4">Connect your wallet to manage guild membership</div>
            <WalletButton />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-9 gap-6 items-start">
            {/* Left column (~55%) */}
            <div className="lg:col-span-5">
              <CreateTab address={address} inGuild={inGuild} guildId={guildId} />
            </div>

            {/* Right column (~45%) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-[#1E293B] border border-[#334155] flex flex-col">
                <div className="border-b border-[#334155] p-4 flex items-center justify-between">
                  <h2 style={spaceGrotesk} className="text-lg font-medium uppercase">Telemetry: Active Guild</h2>
                  {inGuild ? (
                    <div className="bg-[#3DFFC0]/10 border border-[#3DFFC0] px-2 py-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#3DFFC0] animate-pulse" />
                      <span className="text-xs font-mono text-[#3DFFC0] uppercase tracking-wider">Active</span>
                    </div>
                  ) : (
                    <div className="bg-[#334155]/30 border border-[#334155] px-2 py-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#64748B]" />
                      <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Not in Guild</span>
                    </div>
                  )}
                </div>
                <StatusTab guildId={guildId} guild={guild} isFrozen={isFrozen} inGuild={inGuild} address={address} />
                <div className="px-4 pb-3 text-right text-[10px] font-mono text-[#334155]">SYS.V.2.4.1 // CC3</div>
              </div>

              <JoinGuildSection address={address} inGuild={inGuild} />
            </div>
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

function StatusTab({ guildId, guild, isFrozen, inGuild, address }: {
  guildId: bigint | undefined
  guild: readonly [readonly `0x${string}`[], readonly boolean[], boolean, bigint] | undefined
  isFrozen: boolean | undefined
  inGuild: boolean
  address: `0x${string}` | undefined
}) {
  if (!inGuild) {
    return (
      <div className="p-4">
        <div className="text-sm font-mono text-[#64748B]">
          No active guild. Create or join a guild to reduce your collateral requirement.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {isFrozen && (
        <div className="border border-[#FF6B35] bg-[#FF6B35]/10 px-3 py-2 text-xs font-mono text-[#FF6B35] uppercase tracking-wider">
          ⚠ Guild Frozen
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Guild Identifier</span>
        <span className="font-mono text-lg text-[#00C2FF]">{guildId?.toString()}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Members</span>
        <span className="font-mono text-lg text-white">{guild?.[3]?.toString() ?? '—'} / 5</span>
      </div>

      <div className="border border-[#334155] flex flex-col">
        <div className="grid grid-cols-12 gap-2 p-2 border-b border-[#334155] text-xs font-mono text-[#64748B] uppercase tracking-wider">
          <div className="col-span-2">IDX</div>
          <div className="col-span-7">Address</div>
          <div className="col-span-3 text-right">Status</div>
        </div>
        {guild?.[0]?.map((m, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 p-2 border-b border-[#334155] last:border-0 font-mono text-xs items-center hover:bg-[#334155]/30 transition-colors">
            <div className="col-span-2 text-[#64748B]">{String(i).padStart(2, '0')}</div>
            <div className={`col-span-7 truncate ${m === address ? 'text-[#00C2FF]' : 'text-gray-300'}`}>
              {m.slice(0, 10)}...{m.slice(-6)}{m === address ? ' (You)' : ''}
            </div>
            <div className={`col-span-3 text-right ${guild[1][i] ? 'text-[#3DFFC0]' : 'text-[#64748B]'}`}>
              {guild[1][i] ? 'OK' : 'PENDING'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateTab({ address, inGuild, guildId }: { address: `0x${string}` | undefined; inGuild: boolean; guildId: bigint | undefined }) {
  const [members, setMembers] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState('')
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

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
      args: [allMembers as unknown as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`]],
      chainId: cc3Testnet.id,
    })
  }

  return (
    <div className="bg-[#1E293B] border border-[#334155] flex flex-col">
      <div className="border-b border-[#334155] p-4 flex items-center justify-between">
        <h2 style={spaceGrotesk} className="text-lg font-medium uppercase">Initialize Protocol Guild</h2>
      </div>
      <div className="p-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-mono text-[#00C2FF] uppercase tracking-wider">Grameen Bank Joint-Liability Model</h3>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            By forming a 5-peer micro-lending guild, members enter a joint-liability covenant. Default by any single entity triggers proportional collateral slashing across the guild. This mutualized risk model drastically reduces individual capital requirements.
          </p>
        </div>

        {/* Collateral Reduction visual */}
        <div className="bg-[#0F172A] border border-[#334155] p-4 flex flex-col gap-2">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Standard C-Ratio</span>
              <span className="font-mono text-lg text-[#64748B] line-through">15%</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono text-[#00C2FF] uppercase tracking-wider">Guild C-Ratio</span>
              <span className="font-mono text-lg text-[#00C2FF]">5%</span>
            </div>
          </div>
          <div className="w-full h-2 flex gap-[2px] mt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`flex-1 ${i < 3 ? 'bg-[#00C2FF]' : 'bg-[#334155]'}`} />
            ))}
          </div>
        </div>

        {inGuild ? (
          <div className="text-sm font-mono text-[#64748B] border border-[#334155] p-4">
            Already in Guild #{guildId?.toString()}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-mono text-white uppercase tracking-wider">Member Addresses (0/5)</h3>
            <div className="font-mono text-xs text-[#64748B] px-3 py-2 bg-[#0F172A] border border-[#334155]">
              members[0]: {address} (you)
            </div>
            <div className="flex flex-col gap-1">
              {members.map((m, i) => (
                <div key={i} className="bg-[#0F172A] border border-[#334155] flex items-center focus-within:border-2 focus-within:border-[#00C2FF]">
                  <span className="font-mono text-sm text-[#64748B] px-2 select-none border-r border-[#334155]">&gt;</span>
                  <input
                    type="text"
                    value={m}
                    onChange={e => { const n = [...members]; n[i] = e.target.value; setMembers(n) }}
                    placeholder="0x..."
                    className="w-full bg-transparent border-none text-white font-mono text-sm focus:outline-none focus:ring-0 px-2 py-2"
                  />
                </div>
              ))}
            </div>
            {error && <div className="text-xs font-mono text-red-400">{error}</div>}
            {writeError && <div className="text-xs font-mono text-red-400">{writeError.message.split('\n')[0]}</div>}
            {isSuccess && <div className="text-xs font-mono text-[#3DFFC0]">Guild created! Wait for owner approval before joining.</div>}
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="mt-2 w-full bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
            >
              {isPending ? 'Confirm in wallet...' : 'Create Guild →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function JoinGuildSection({ address, inGuild }: { address: `0x${string}` | undefined; inGuild: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-[#1E293B] border border-[#334155]">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <span className="text-xs font-mono text-[#64748B] uppercase tracking-wider">Join Existing Guild</span>
        <span className="text-[#64748B] font-mono text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-[#334155] p-4">
          <JoinTab address={address} inGuild={inGuild} />
        </div>
      )}
    </div>
  )
}

function JoinTab({ inGuild }: { address: `0x${string}` | undefined; inGuild: boolean }) {
  const [guildIdInput, setGuildIdInput] = useState('')
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (inGuild) return <div className="text-[#64748B] font-mono text-sm">You are already in a guild.</div>

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
    <div className="flex flex-col gap-3">
      <p className="text-[#94A3B8] text-sm font-mono">Enter the guild ID you were invited to. Owner must have approved your address first.</p>
      <div className="flex gap-2">
        <input
          type="number"
          value={guildIdInput}
          onChange={e => setGuildIdInput(e.target.value)}
          placeholder="Guild ID (e.g. 1)"
          className="bg-[#0F172A] border border-[#334155] text-white font-mono px-4 py-2 w-40 focus:outline-none focus:border-2 focus:border-[#00C2FF]"
        />
        <button
          onClick={handleJoin}
          disabled={isPending || !guildIdInput}
          className="px-6 py-2 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
        >
          {isPending ? 'Confirm...' : 'Join →'}
        </button>
      </div>
      {writeError && <div className="text-xs font-mono text-red-400">{writeError.message.split('\n')[0]}</div>}
      {isSuccess && <div className="text-xs font-mono text-[#3DFFC0]">Joined guild successfully!</div>}
    </div>
  )
}
