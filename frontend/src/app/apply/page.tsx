'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from 'wagmi'
import { parseEther, decodeEventLog, parseUnits, formatUnits } from 'viem'
import { CONTRACTS, COLLATERAL_VAULT_ABI, NODE_REGISTRY_ABI, SPACE_FINANCE_ABI, MOCK_PAYOUT_TOKEN_ABI } from '@/lib/contracts'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }

const STEPS = [
  { id: 1, chain: 'SEPOLIA', label: 'Deposit Collateral' },
  { id: 2, chain: 'USC', label: 'Attestation #1' },
  { id: 3, chain: 'SEPOLIA', label: 'Register Node' },
  { id: 4, chain: 'USC', label: 'Attestation #2' },
  { id: 5, chain: 'CC3', label: 'Repay Loan' },
  { id: 6, chain: 'CC3', label: 'Complete' },
] as const

function StepSidebar({ current }: { current: Step }) {
  return (
    <aside className="w-full lg:w-[35%] flex flex-col gap-2">
      {STEPS.map(s => {
        const done = s.id < current
        const active = s.id === current
        return (
          <div
            key={s.id}
            className={`bg-[#1E293B] border p-4 flex flex-col gap-1 transition-colors
              ${active ? 'border-2 border-[#00C2FF]' : 'border-[#334155]'}
              ${!active && !done ? 'opacity-50' : ''}`}
          >
            <div className={`font-mono text-xs uppercase tracking-wider ${active ? 'text-[#00C2FF]' : done ? 'text-[#3DFFC0]' : 'text-gray-500'}`}>
              STEP {String(s.id).padStart(2, '0')} {active ? '// CURRENT' : done ? '// DONE' : '// PENDING'}
            </div>
            <div className="font-mono text-sm text-white flex items-center gap-2">
              {done && <span className="text-[#3DFFC0]">✓</span>}
              {s.label.toUpperCase()}
            </div>
            <div className="font-mono text-xs text-gray-600 mt-1">[{s.chain}]</div>
          </div>
        )
      })}
    </aside>
  )
}

function OrbitAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
      <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full max-w-[320px] max-h-[320px]">
        <circle cx="200" cy="200" r="10" fill="#00C2FF" />
        <ellipse cx="200" cy="200" rx="160" ry="80" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
        <ellipse cx="200" cy="200" rx="80" ry="160" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
        <circle r="4" fill="#00C2FF">
          <animateMotion dur="8s" repeatCount="indefinite" path="M 40,200 A 160,80 0 1,1 360,200 A 160,80 0 1,1 40,200" />
        </circle>
        <circle r="4" fill="#3DFFC0">
          <animateMotion dur="12s" repeatCount="indefinite" path="M 200,40 A 80,160 0 1,1 200,360 A 80,160 0 1,1 200,40" />
        </circle>
        <circle cx="200" cy="200" r="10" stroke="#00C2FF" strokeWidth="2">
          <animate attributeName="r" from="10" to="60" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.6" to="0" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  )
}

function Step1Panel({ onNext }: { onNext: (loanId: string, blockNumber: bigint, txHash: `0x${string}`) => void }) {
  const [amount, setAmount] = useState('0.01')
  const { isConnected, chainId } = useAccount()
  const isRightChain = chainId === sepolia.id

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // receipt 到手後，從 log 裡解析 loanId
  useEffect(() => {
    if (!isSuccess || !receipt || !txHash) return
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: COLLATERAL_VAULT_ABI,
          eventName: 'Deposited',
          topics: log.topics,
          data: log.data,
        })
        const loanId = decoded.args.loanId.toString()
        onNext(loanId, receipt.blockNumber, txHash)
        break
      } catch {
        // 不是我們的 event，繼續找
      }
    }
  }, [isSuccess, receipt, txHash, onNext])

  function handleDeposit() {
    writeContract({
      address: CONTRACTS.collateralVault.address,
      abi: COLLATERAL_VAULT_ABI,
      functionName: 'deposit',
      value: parseEther(amount),
      chainId: sepolia.id,
    })
  }

  const isLoading = isPending || isConfirming

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 01: DEPOSIT COLLATERAL</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Deposit Collateral</h2>
      <p className="text-gray-400 text-sm mb-8">
        Lock ETH in CollateralVault on Sepolia. You&apos;ll receive a loanId that tracks your financing request.
      </p>

      <WalletButton requiredChainId={sepolia.id} />

      {isConnected && isRightChain && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="font-mono text-xs text-gray-500 uppercase tracking-wider block mb-2">Amount (ETH)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.001"
              min="0.001"
              disabled={isLoading}
              className="bg-[#0F172A] border border-[#334155] text-white font-mono px-4 py-2 w-48 focus:outline-none focus:border-[#00C2FF] disabled:opacity-50"
            />
          </div>

          <button
            onClick={handleDeposit}
            disabled={isLoading || !amount}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Deposit ETH →'}
          </button>

          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              Tx: <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00C2FF] hover:text-[#75d1ff]"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}

          {writeError && (
            <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
              {writeError.message.split('\n')[0]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Step2Panel({
  loanId,
  depositBlock,
  depositTxHash,
  onNext
}: {
  loanId: string
  depositBlock: bigint
  depositTxHash: `0x${string}`
  onNext: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'proving' | 'submitting' | 'done' | 'error'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [seconds, setSeconds] = useState(0)
  const POLL_SECONDS = 15
  const TOTAL_ESTIMATE = 600 // 10 min estimate for progress bar

  const { writeContractAsync } = useWriteContract()

  // elapsed time counter for display — starts ticking once attestation begins
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || phase === 'error') return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  async function startAttestation() {
    setPhase('waiting')
    setElapsed(0)
    setSeconds(0)

    // 進度條 ticker
    const ticker = setInterval(() => {
      setElapsed(prev => prev + POLL_SECONDS)
    }, POLL_SECONDS * 1000)

    try {
      // 等 attestation
      const { waitAndGetProof, buildExecuteArgs } = await import('@/lib/usc')
      const proof = await waitAndGetProof(depositBlock, depositTxHash)

      clearInterval(ticker)
      setPhase('proving')

      // 在 CC3 呼叫 execute(action=0)
      setPhase('submitting')
      const args = buildExecuteArgs(0, proof)
      const hash = await writeContractAsync({
        address: CONTRACTS.spaceFinance.address,
        abi: SPACE_FINANCE_ABI,
        functionName: 'execute',
        args: [
          args.action,
          args.chainKey,
          args.blockHeight,
          args.encodedTransaction,
          args.merkleRoot,
          args.siblings,
          args.lowerEndpointDigest,
          args.continuityRoots,
        ],
        chainId: cc3Testnet.id,
      })
      setTxHash(hash)
      setPhase('done')
    } catch (e) {
      clearInterval(ticker)
      setErrorMsg(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setPhase('error')
    }
  }

  const pct = Math.min((elapsed / TOTAL_ESTIMATE) * 100, 95) // 最多到 95%，done 才跳 100%
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle: '',
    waiting: 'Scanning blocks...',
    proving: 'Proof generated...',
    submitting: 'Submitting to CC3...',
    done: 'Attestation confirmed ✓',
    error: 'Attestation failed',
  }

  const isProcessing = phase === 'waiting' || phase === 'proving' || phase === 'submitting'

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 02: ATTESTATION #1</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Waiting for Attestation #1</h2>
      <p className="text-gray-400 text-sm mb-6">
        USC is attesting your <span className="text-[#00C2FF] font-mono">Deposited</span> event on Sepolia.
        This takes 8–10 minutes — trustless verification can&apos;t be rushed.
      </p>

      <div className="bg-[#0F172A] border border-[#334155] p-4 mb-6 font-mono text-sm">
        <div className="text-gray-500 text-xs mb-1">Loan ID</div>
        <div className="text-[#00C2FF]">{loanId}</div>
        <div className="text-gray-500 text-xs mt-2 mb-1">Block</div>
        <div className="text-gray-300">{depositBlock.toString()}</div>
      </div>

      {phase === 'idle' && (
        <button
          onClick={startAttestation}
          className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
        >
          Start Attestation →
        </button>
      )}

      {isProcessing && (
        <div className="relative border border-[#334155] bg-[#0F172A] p-6 overflow-hidden">
          <OrbitAnimation />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div style={spaceGrotesk} className="text-4xl font-bold text-[#00C2FF] tabular-nums mb-4">{mm}:{ss}</div>
            <div className="font-mono text-sm text-gray-300 mb-1 animate-pulse">{PHASE_LABEL[phase]}</div>
            <div className="font-mono text-xs text-gray-600 mb-6">Polling every {POLL_SECONDS}s · {Math.round(pct)}% · timeout 20min</div>
            <div className="w-full h-2 bg-[#1E293B] border border-[#334155] overflow-hidden mb-6">
              <div className="h-full bg-[#00C2FF] transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-full border border-[#FF6B35] bg-[#FF6B35]/10 p-3 text-center">
              <p className="font-mono text-xs text-[#FF6B35] uppercase tracking-wider">
                ⚠ DO NOT CLOSE THIS TAB — USC ATTESTATION PROCESSING ON-CHAIN
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div className="w-full h-2 bg-[#3DFFC0]" />
          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              CC3 Tx: <a
                href={`https://cc3-testnet.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00C2FF] hover:text-[#75d1ff]"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}
          <button
            onClick={onNext}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setElapsed(0); setErrorMsg(''); setSeconds(0) }}
            className="border border-[#334155] text-gray-300 hover:border-[#00C2FF] font-mono text-xs uppercase tracking-wider px-6 py-3 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Step3Panel({ onNext }: { onNext: (nodeId: string, blockNumber: bigint, txHash: `0x${string}`) => void }) {
  const [nodeIdInput, setNodeIdInput] = useState('')
  const [inputError, setInputError] = useState('')
  const { isConnected, chainId } = useAccount()
  const isRightChain = chainId === sepolia.id

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!isSuccess || !receipt || !txHash) return
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: NODE_REGISTRY_ABI,
          eventName: 'NodeRegistered',
          topics: log.topics,
          data: log.data,
        })
        const nodeId = decoded.args.nodeId as string
        onNext(nodeId, receipt.blockNumber, txHash)
        break
      } catch {
        // 不是我們的 event，繼續
      }
    }
  }, [isSuccess, receipt, txHash, onNext])

  function validate(): boolean {
    if (!nodeIdInput.startsWith('0x') || nodeIdInput.length !== 66) {
      setInputError('Node ID must be a 32-byte hex string (0x + 64 hex chars)')
      return false
    }
    setInputError('')
    return true
  }

  function handleRegister() {
    if (!validate()) return
    writeContract({
      address: CONTRACTS.nodeRegistry.address,
      abi: NODE_REGISTRY_ABI,
      functionName: 'registerNode',
      args: [nodeIdInput as `0x${string}`],
      chainId: sepolia.id,
    })
  }

  const isLoading = isPending || isConfirming

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 03: REGISTER NODE</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Register Node Identity</h2>
      <p className="text-gray-400 text-sm mb-8">
        Submit your Spacecoin nodeId to NodeRegistry on Sepolia. This proves you operate a real node.
      </p>

      <WalletButton requiredChainId={sepolia.id} />

      {isConnected && isRightChain && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="font-mono text-xs text-gray-500 uppercase tracking-wider block mb-2">Node ID (bytes32)</label>
            <input
              type="text"
              value={nodeIdInput}
              onChange={e => { setNodeIdInput(e.target.value); setInputError('') }}
              placeholder="0x0000000000000000000000000000000000000000000000000000000000000001"
              disabled={isLoading}
              className="bg-[#0F172A] border border-[#334155] text-white font-mono px-4 py-2 w-full focus:outline-none focus:border-[#00C2FF] text-sm disabled:opacity-50"
            />
            {inputError && (
              <div className="text-xs font-mono text-red-400 mt-1">{inputError}</div>
            )}
            <div className="text-xs text-gray-600 mt-1 font-mono">
              Find your nodeId in Spacecoin node config or Blockscout
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={isLoading || !nodeIdInput}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Register Node →'}
          </button>

          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              Tx: <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00C2FF] hover:text-[#75d1ff]"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}

          {writeError && (
            <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
              {writeError.message.split('\n')[0]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Step4Panel({
  nodeBlock,
  nodeTxHash,
  onNext
}: {
  nodeBlock: bigint
  nodeTxHash: `0x${string}`
  onNext: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'proving' | 'submitting' | 'done' | 'error'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [seconds, setSeconds] = useState(0)
  const POLL_SECONDS = 15
  const TOTAL_ESTIMATE = 600

  const { writeContractAsync } = useWriteContract()

  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || phase === 'error') return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  async function startAttestation() {
    setPhase('waiting')
    setElapsed(0)
    setSeconds(0)

    const ticker = setInterval(() => {
      setElapsed(prev => prev + POLL_SECONDS)
    }, POLL_SECONDS * 1000)

    try {
      const { waitAndGetProof, buildExecuteArgs } = await import('@/lib/usc')
      const proof = await waitAndGetProof(nodeBlock, nodeTxHash)

      clearInterval(ticker)
      setPhase('proving')
      setPhase('submitting')

      const args = buildExecuteArgs(1, proof)
      const hash = await writeContractAsync({
        address: CONTRACTS.spaceFinance.address,
        abi: SPACE_FINANCE_ABI,
        functionName: 'execute',
        args: [
          args.action,
          args.chainKey,
          args.blockHeight,
          args.encodedTransaction,
          args.merkleRoot,
          args.siblings,
          args.lowerEndpointDigest,
          args.continuityRoots,
        ],
        chainId: cc3Testnet.id,
      })
      setTxHash(hash)
      setPhase('done')
    } catch (e) {
      clearInterval(ticker)
      setErrorMsg(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setPhase('error')
    }
  }

  const pct = Math.min((elapsed / TOTAL_ESTIMATE) * 100, 95)
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle: '',
    waiting: 'Scanning blocks...',
    proving: 'Proof generated...',
    submitting: 'Submitting to CC3...',
    done: 'Attestation confirmed ✓',
    error: 'Attestation failed',
  }

  const isProcessing = phase === 'waiting' || phase === 'proving' || phase === 'submitting'

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 04: ATTESTATION #2</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Waiting for Attestation #2</h2>
      <p className="text-gray-400 text-sm mb-6">
        USC is attesting your <span className="text-[#00C2FF] font-mono">NodeRegistered</span> event.
        Once confirmed, SpaceFinance will automatically release your mUSDF.
      </p>

      <div className="bg-[#0F172A] border border-[#334155] p-4 mb-6 font-mono text-sm">
        <div className="text-gray-500 text-xs mb-1">Block</div>
        <div className="text-gray-300">{nodeBlock.toString()}</div>
      </div>

      {phase === 'idle' && (
        <button
          onClick={startAttestation}
          className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
        >
          Start Attestation →
        </button>
      )}

      {isProcessing && (
        <div className="relative border border-[#334155] bg-[#0F172A] p-6 overflow-hidden">
          <OrbitAnimation />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div style={spaceGrotesk} className="text-4xl font-bold text-[#00C2FF] tabular-nums mb-4">{mm}:{ss}</div>
            <div className="font-mono text-sm text-gray-300 mb-1 animate-pulse">{PHASE_LABEL[phase]}</div>
            <div className="font-mono text-xs text-gray-600 mb-6">Polling every {POLL_SECONDS}s · {Math.round(pct)}% · timeout 20min</div>
            <div className="w-full h-2 bg-[#1E293B] border border-[#334155] overflow-hidden mb-6">
              <div className="h-full bg-[#00C2FF] transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
            <div className="w-full border border-[#FF6B35] bg-[#FF6B35]/10 p-3 text-center">
              <p className="font-mono text-xs text-[#FF6B35] uppercase tracking-wider">
                ⚠ DO NOT CLOSE THIS TAB — USC ATTESTATION PROCESSING ON-CHAIN
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div className="w-full h-2 bg-[#3DFFC0]" />
          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              CC3 Tx: <a
                href={`https://cc3-testnet.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00C2FF] hover:text-[#75d1ff]"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}
          <button
            onClick={onNext}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setElapsed(0); setErrorMsg(''); setSeconds(0) }}
            className="border border-[#334155] text-gray-300 hover:border-[#00C2FF] font-mono text-xs uppercase tracking-wider px-6 py-3 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Step5Panel({ loanId, onNext }: { loanId: string; onNext: () => void }) {
  const [amount, setAmount] = useState('1000')
  const [phase, setPhase] = useState<'idle' | 'approving' | 'repaying' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | null>(null)
  const [repayTxHash, setRepayTxHash] = useState<`0x${string}` | null>(null)
  const { isConnected, chainId, address } = useAccount()
  const isRightChain = chainId === cc3Testnet.id
  const { writeContractAsync } = useWriteContract()

  const { data: cc3LoanIds } = useReadContract({
    address: CONTRACTS.spaceFinance.address,
    abi: SPACE_FINANCE_ABI,
    functionName: 'getLoansByBorrower',
    args: [address!],
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })
  const loanIds = cc3LoanIds as readonly bigint[] | undefined
  const cc3LoanId = loanIds && loanIds.length > 0
    ? loanIds[loanIds.length - 1]  // 取最新的一筆
    : undefined

  async function handleRepay() {
    setPhase('approving')
    setErrorMsg('')
    try {
      const amountWei = parseUnits(amount, 18)

      // Step A: approve mUSDF
      const approveTx = await writeContractAsync({
        address: CONTRACTS.mockPayoutToken.address,
        abi: MOCK_PAYOUT_TOKEN_ABI,
        functionName: 'approve',
        args: [CONTRACTS.spaceFinance.address, amountWei],
        chainId: cc3Testnet.id,
      })
      setApproveTxHash(approveTx)

      // Step B: repay
      setPhase('repaying')
      const repayTx = await writeContractAsync({
        address: CONTRACTS.spaceFinance.address,
        abi: SPACE_FINANCE_ABI,
        functionName: 'repay',
        args: [cc3LoanId!, amountWei],
        chainId: cc3Testnet.id,
      })
      setRepayTxHash(repayTx)
      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setPhase('error')
    }
  }

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 05: REPAY</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Repay Loan</h2>
      <p className="text-gray-400 text-sm mb-8">
        Repay your mUSDF loan. Full repayment unlocks your ETH collateral on Sepolia.
      </p>

      <WalletButton requiredChainId={cc3Testnet.id} />

      {isConnected && isRightChain && phase === 'idle' && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#0F172A] border border-[#334155] p-4 font-mono text-sm">
            <div className="text-gray-500 text-xs mb-1">Loan ID</div>
            <div className="text-[#00C2FF]">{loanId}</div>
            <div className="text-gray-500 text-xs mt-2 mb-1">CC3 Loan ID</div>
            <div className="text-[#00C2FF]">{cc3LoanId !== undefined ? cc3LoanId.toString() : 'Loading...'}</div>
          </div>
          <div>
            <label className="font-mono text-xs text-gray-500 uppercase tracking-wider block mb-2">Amount (mUSDF)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
              className="bg-[#0F172A] border border-[#334155] text-white font-mono px-4 py-2 w-48 focus:outline-none focus:border-[#00C2FF]"
            />
          </div>
          <button
            onClick={handleRepay}
            disabled={!amount || !cc3LoanId}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Repay →
          </button>
        </div>
      )}

      {(phase === 'approving' || phase === 'repaying') && (
        <div className="mt-6 space-y-3">
          <div className="text-xs font-mono text-gray-400">
            {phase === 'approving' ? '1/2 Approving mUSDF spend...' : '2/2 Submitting repayment...'}
          </div>
          <div className="w-full h-2 bg-[#1E293B] border border-[#334155] overflow-hidden">
            <div className="h-full bg-[#00C2FF] animate-pulse" style={{ width: phase === 'approving' ? '40%' : '80%' }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#0F172A] border border-[#3DFFC0]/30 p-4 font-mono text-sm space-y-2">
            {approveTxHash && (
              <div className="text-xs text-gray-500">
                Approve Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${approveTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF] hover:text-[#75d1ff]">{approveTxHash.slice(0, 20)}...</a>
              </div>
            )}
            {repayTxHash && (
              <div className="text-xs text-gray-500">
                Repay Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${repayTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF] hover:text-[#75d1ff]">{repayTxHash.slice(0, 20)}...</a>
              </div>
            )}
          </div>
          <button
            onClick={onNext}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-6 space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setErrorMsg('') }}
            className="border border-[#334155] text-gray-300 hover:border-[#00C2FF] font-mono text-xs uppercase tracking-wider px-6 py-3 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Step6Panel({ loanId, nodeId }: { loanId: string; nodeId: string }) {
  const { address } = useAccount()
  const { data: mUsdfBalance } = useReadContract({
    address: CONTRACTS.mockPayoutToken.address,
    abi: MOCK_PAYOUT_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 06: COMPLETE</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Financing Active</h2>
      <p className="text-gray-400 text-sm mb-8">
        Both USC attestations confirmed. mUSDF has been released to your wallet on Creditcoin CC3.
      </p>

      <div className="bg-[#1E293B] border border-[#00C2FF]/30 p-6 mb-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">Status</span>
          <span className="font-mono text-xs text-[#3DFFC0] flex items-center gap-2">
            <span className="text-[8px]">●</span> LOAN ACTIVE
          </span>
        </div>
        <div className="flex justify-between font-mono text-sm border-t border-[#334155] pt-3">
          <span className="text-gray-500">Loan ID</span>
          <span className="text-[#00C2FF]">{loanId}</span>
        </div>
        <div className="flex justify-between gap-4 font-mono text-sm">
          <span className="text-gray-500 flex-shrink-0">Node ID</span>
          <span className="text-[#00C2FF] break-all text-right">{nodeId}</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-gray-500">mUSDF Balance</span>
          <span className="text-white">{mUsdfBalance !== undefined ? formatUnits(mUsdfBalance, 18) : 'Loading...'} mUSDF</span>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-[#FF6B35]/30 p-4 mb-6 font-mono text-xs text-[#FF6B35]">
        ⚠ Collateral release requires USC Attestation #3. Contact admin or wait for Phase 2 automation.
      </div>

      <div className="flex gap-4">
        <Link href="/dashboard" className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]">
          VIEW DASHBOARD →
        </Link>
        <Link href="/revenue" className="border border-[#334155] text-gray-300 hover:border-[#00C2FF] font-mono text-xs uppercase tracking-wider px-6 py-3 transition-colors">
          Node Revenue
        </Link>
      </div>
    </div>
  )
}

export default function ApplyPage() {
  const [step, setStep] = useState<Step>(1)
  const [loanId, setLoanId] = useState('')
  const [depositBlock, setDepositBlock] = useState<bigint>(0n)
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [nodeId, setNodeId] = useState('')
  const [nodeBlock, setNodeBlock] = useState<bigint>(0n)
  const [nodeTxHash, setNodeTxHash] = useState<`0x${string}` | undefined>(undefined)

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Nav */}
      <nav className="border-b border-[#334155] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-mono text-sm text-[#00C2FF] tracking-widest uppercase">SpaceFinance</span>
        </Link>
        <WalletButton />
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-12 pb-24">
        <div className="mb-8">
          <Link href="/" className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors">← Back</Link>
          <h1 style={spaceGrotesk} className="text-3xl font-semibold mt-4 mb-1">FINANCING APPLICATION</h1>
          <p className="text-gray-500 text-sm font-mono">Two USC attestations + repayment · ~25 minutes total</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <StepSidebar current={step} />

          <section className="w-full lg:w-[65%] bg-[#1E293B] border border-[#334155] p-8">
            {step === 1 && <Step1Panel onNext={(id, block, txHash) => {
              setLoanId(id)
              setDepositBlock(block)
              setDepositTxHash(txHash)
              setStep(2)
            }} />}
            {step === 2 && depositTxHash !== undefined && (
              <Step2Panel
                loanId={loanId}
                depositBlock={depositBlock}
                depositTxHash={depositTxHash}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && <Step3Panel onNext={(id, block, txHash) => {
              setNodeId(id)
              setNodeBlock(block)
              setNodeTxHash(txHash)
              setStep(4)
            }} />}
            {step === 4 && nodeTxHash !== undefined && (
              <Step4Panel
                nodeBlock={nodeBlock}
                nodeTxHash={nodeTxHash}
                onNext={() => setStep(5)}
              />
            )}
            {step === 5 && (
              <Step5Panel
                loanId={loanId}
                onNext={() => setStep(6)}
              />
            )}
            {step === 6 && <Step6Panel loanId={loanId} nodeId={nodeId} />}
          </section>
        </div>
      </main>
    </div>
  )
}
