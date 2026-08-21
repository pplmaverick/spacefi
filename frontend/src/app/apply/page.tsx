'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { JetBrains_Mono } from 'next/font/google'
import { WalletButton } from '@/components/WalletButton'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract, useChainId, useSwitchChain, usePublicClient } from 'wagmi'
import { parseEther, decodeEventLog, parseUnits, formatUnits, parseAbi } from 'viem'
import { CONTRACTS, COLLATERAL_VAULT_ABI, NODE_REGISTRY_ABI, SPACE_FINANCE_ABI, MOCK_PAYOUT_TOKEN_ABI } from '@/lib/contracts'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'
import type { proofProvider } from '@gluwa/usc-sdk'

type Step = 1 | 2 | 3 | 4 | 5 | 'loan-approved'

const spaceGrotesk = { fontFamily: 'var(--font-space-grotesk), sans-serif' }
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'] })
const checkmarkStyle = { color: '#3DFFC0', fontFamily: jetbrainsMono.style.fontFamily }

const STEPS = [
  { id: 1, chain: 'SEPOLIA', label: 'Deposit Collateral' },
  { id: 2, chain: 'SEPOLIA', label: 'Register Node' },
  { id: 3, chain: 'USC', label: 'USC Attestation' },
  { id: 4, chain: 'CC3', label: 'Repay Loan' },
  { id: 5, chain: 'CC3', label: 'Complete' },
] as const

const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as `0x${string}`
const CHAINLINK_FEED_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

const COLLATERAL_VAULT_WITHDRAW_ABI = [
  {
    name: 'withdrawalAuthorized',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [],
  },
] as const

type AttPhase = 'waiting' | 'proving' | 'proof_ready' | 'submitting' | 'done' | 'error'

const ATT_PHASE_LABEL: Record<AttPhase, string> = {
  waiting: 'Scanning blocks...',
  proving: 'Proof generated...',
  proof_ready: 'Proof ready — switch chain to submit',
  submitting: 'Submitting to CC3...',
  done: 'Attestation confirmed ✓',
  error: 'Attestation failed',
}

function StepSidebar({ current }: { current: Step }) {
  // 'loan-approved' 是 Step 3→4 間的過渡畫面，側欄視覺上算進 Step 4
  const currentNum = current === 'loan-approved' ? 4 : current
  return (
    <aside className="w-full lg:w-[35%] flex flex-col gap-2">
      {STEPS.map(s => {
        const done = s.id < currentNum
        const active = s.id === currentNum
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

function ChainSwitchBanner({ requiredChainId, requiredChainName }: { requiredChainId: number; requiredChainName: string }) {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isWrongChain = chainId !== requiredChainId

  if (!isWrongChain) return null

  return (
    <div className="flex items-center justify-between bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-lg px-4 py-2 mb-4">
      <span className="text-xs font-mono text-[#FF6B35]">
        ⚠ Switch to {requiredChainName} to continue
      </span>
      <button
        onClick={() => switchChain({ chainId: requiredChainId })}
        className="text-xs font-mono text-[#FF6B35] border border-[#FF6B35]/50 rounded px-3 py-1 hover:bg-[#FF6B35]/10"
      >
        SWITCH NETWORK
      </button>
    </div>
  )
}

function OrbitAnimation() {
  return (
    <div className="flex items-center justify-center mb-4">
      <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" width="300" height="300">
        <circle cx="200" cy="200" r="12" fill="#00C2FF" />
        <ellipse cx="200" cy="200" rx="160" ry="80" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <ellipse cx="200" cy="200" rx="80" ry="160" stroke="#00C2FF" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <circle r="6" fill="#00C2FF">
          <animateMotion dur="8s" repeatCount="indefinite" path="M 40,200 A 160,80 0 1,1 360,200 A 160,80 0 1,1 40,200" />
        </circle>
        <circle r="6" fill="#3DFFC0">
          <animateMotion dur="12s" repeatCount="indefinite" path="M 200,40 A 80,160 0 1,1 200,360 A 80,160 0 1,1 200,40" />
        </circle>
        <circle cx="200" cy="200" r="12" stroke="#00C2FF" strokeWidth="2">
          <animate attributeName="r" from="12" to="60" dur="3s" repeatCount="indefinite" />
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

  const { data: priceData } = useReadContract({
    address: ETH_USD_FEED,
    abi: CHAINLINK_FEED_ABI,
    functionName: 'latestRoundData',
    chainId: sepolia.id,
  })
  const ethPrice = priceData ? Number(priceData[1]) / 1e8 : undefined
  const amountNum = parseFloat(amount) || 0
  const collateralValueUsd = ethPrice !== undefined ? amountNum * ethPrice : undefined
  const creditLimitUsdf = collateralValueUsd !== undefined ? collateralValueUsd * 0.7 : undefined

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
      <ChainSwitchBanner requiredChainId={sepolia.id} requiredChainName="Sepolia" />
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 01: DEPOSIT COLLATERAL</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Deposit Collateral</h2>
      <p className="text-gray-400 text-sm mb-8">
        Lock ETH in CollateralVault on Sepolia. You&apos;ll receive a loanId that tracks your financing request.
      </p>

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

          <div className="grid grid-cols-2 gap-4 bg-[#0F172A] border border-[#334155] rounded-lg p-4 mt-4">
            <div>
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Collateral Value</div>
              <div className="text-sm font-mono text-white">
                {collateralValueUsd !== undefined
                  ? `$${collateralValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                  : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">Credit Limit</div>
              <div className="text-sm font-mono text-[#00C2FF]">
                {creditLimitUsdf !== undefined
                  ? `${creditLimitUsdf.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mUSDF`
                  : '—'}
              </div>
            </div>
          </div>

          <button
            onClick={handleDeposit}
            disabled={isLoading || !amount}
            className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Deposit ETH →'}
          </button>
          <p className="text-xs font-mono text-gray-500 mt-3">
            ETH is locked in CollateralVault on Sepolia. USC will attest your deposit on Creditcoin CC3.
          </p>

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

function Step2Panel({ onNext }: { onNext: (nodeId: string, blockNumber: bigint, txHash: `0x${string}`) => void }) {
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
      <ChainSwitchBanner requiredChainId={sepolia.id} requiredChainName="Sepolia" />
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 02: REGISTER NODE</div>
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

function AttColumn({
  label,
  phase,
  txHash,
  error,
  pct,
  onRetry,
  waitingLabel,
}: {
  label: string
  phase: AttPhase
  txHash: `0x${string}` | null
  error: string
  pct: number
  onRetry: () => void
  waitingLabel?: string
}) {
  return (
    <div className="border border-[#334155] bg-[#1E293B] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[#00C2FF] uppercase tracking-wider">{label}</span>
        <span className="font-mono text-[10px] text-gray-600">[SEPOLIA→USC→CC3]</span>
      </div>

      {phase !== 'error' && phase !== 'proof_ready' && (
        <>
          <div className={`font-mono text-xs text-gray-300 ${phase !== 'done' ? 'animate-pulse' : ''}`}>
            {phase === 'waiting' && waitingLabel ? waitingLabel : ATT_PHASE_LABEL[phase]}
          </div>
          <div className="w-full h-2 bg-[#0F172A] border border-[#334155] overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${phase === 'done' ? 'bg-[#3DFFC0]' : 'bg-[#00C2FF]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}

      {phase === 'proof_ready' && (
        <div>
          <div className="text-xs font-mono text-[#3DFFC0] mb-2">✓ USC proof generated</div>
          <div className="text-xs font-mono text-[#FF6B35] mb-3">Switch to CC3 Testnet to submit</div>
          <ChainSwitchBanner requiredChainId={cc3Testnet.id} requiredChainName="CC3 Testnet" />
        </div>
      )}

      {phase === 'done' && (
        <div className="font-mono text-xs text-[#3DFFC0] flex items-center gap-1 flex-wrap">
          <span>✓ Confirmed</span>
          {txHash && (
            <a
              href={`https://cc3-testnet.blockscout.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00C2FF] hover:text-[#75d1ff]"
            >
              · {txHash.slice(0, 14)}...
            </a>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-3 py-2">
            {error}
          </div>
          <button
            onClick={onRetry}
            className="self-start border border-[#334155] text-gray-300 hover:border-[#00C2FF] font-mono text-xs uppercase tracking-wider px-4 py-2 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Step3Panel({
  depositBlock,
  depositTxHash,
  registerBlock,
  registerTxHash,
  onNext,
}: {
  depositBlock: bigint
  depositTxHash: `0x${string}`
  registerBlock: bigint
  registerTxHash: `0x${string}`
  onNext: () => void
}) {
  const [att1Phase, setAtt1Phase] = useState<AttPhase>('waiting')
  const [att2Phase, setAtt2Phase] = useState<AttPhase>('waiting')
  const [att1TxHash, setAtt1TxHash] = useState<`0x${string}` | null>(null)
  const [att2TxHash, setAtt2TxHash] = useState<`0x${string}` | null>(null)
  const [att1Error, setAtt1Error] = useState('')
  const [att2Error, setAtt2Error] = useState('')
  const [seconds, setSeconds] = useState(0)
  const TOTAL_ESTIMATE = 600 // 10 min estimate for progress bar

  const { writeContractAsync } = useWriteContract()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: cc3Testnet.id })

  const att1PhaseRef = useRef<AttPhase>(att1Phase)
  useEffect(() => { att1PhaseRef.current = att1Phase }, [att1Phase])

  const att1TxHashRef = useRef<`0x${string}` | null>(null)

  const att1ProofRef = useRef<proofProvider.ContinuityResponse | null>(null)

  // 共用計時器 — 兩軌都到終態（done/error）才停止
  useEffect(() => {
    const att1Terminal = att1Phase === 'done' || att1Phase === 'error'
    const att2Terminal = att2Phase === 'done' || att2Phase === 'error'
    if (att1Terminal && att2Terminal) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [att1Phase, att2Phase])

  async function runAtt1() {
    setAtt1Phase('waiting')
    setAtt1Error('')
    try {
      const { waitAndGetProof } = await import('@/lib/usc')
      const proof = await waitAndGetProof(depositBlock, depositTxHash)

      // 等 USC prover 多確認幾個 block，降低 timing race
      await new Promise(resolve => setTimeout(resolve, 15_000))

      setAtt1Phase('proving')
      att1ProofRef.current = proof
      setAtt1Phase('proof_ready')
    } catch (e) {
      setAtt1Error(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setAtt1Phase('error')
    }
  }

  async function submitAtt1() {
    try {
      setAtt1Phase('submitting')
      const { buildExecuteArgs } = await import('@/lib/usc')
      const args = buildExecuteArgs(0, att1ProofRef.current!)
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
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        throw new Error('USC proof verification failed on CC3. Please retry.')
      }
      setAtt1TxHash(hash)
      att1TxHashRef.current = hash
      setAtt1Phase('done')
    } catch (e) {
      setAtt1Error(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setAtt1Phase('error')
    }
  }

  // proof 已就緒且已切到 CC3 時自動送出 execute(action=0)
  useEffect(() => {
    if (chainId === cc3Testnet.id && att1Phase === 'proof_ready') {
      submitAtt1()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, att1Phase])

  async function runAtt2() {
    setAtt2Phase('waiting')
    setAtt2Error('')
    try {
      const { waitAndGetProof, buildExecuteArgs } = await import('@/lib/usc')
      const proof = await waitAndGetProof(registerBlock, registerTxHash)

      // 等 USC prover 多確認幾個 block，降低 timing race
      await new Promise(resolve => setTimeout(resolve, 15_000))

      setAtt2Phase('proving')

      // 合約要求先有 CollateralVerified 狀態，所以 execute(action=1) 要等 ATT#1 的 tx 在鏈上確認才能送出
      // 等 ATT#1 tx hash 出現
      while (!att1TxHashRef.current) {
        if (att1PhaseRef.current === 'error') {
          throw new Error('ATT #1 failed — cannot submit ATT #2 until ATT #1 succeeds')
        }
        await new Promise(resolve => setTimeout(resolve, 3_000))
      }

      // 等 ATT#1 tx 在鏈上確認
      console.log('ATT #1 tx found, waiting for CC3 confirmation...')
      const att1Receipt = await publicClient!.waitForTransactionReceipt({
        hash: att1TxHashRef.current
      })
      if (att1Receipt.status === 'reverted') {
        throw new Error('ATT #1 tx reverted — cannot proceed with ATT #2')
      }
      console.log('ATT #1 confirmed on-chain, proceeding with ATT #2...')

      setAtt2Phase('submitting')

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
      const receipt = await publicClient!.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        throw new Error('USC proof verification failed on CC3. Please retry.')
      }
      setAtt2TxHash(hash)
      setAtt2Phase('done')
    } catch (e) {
      setAtt2Error(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setAtt2Phase('error')
    }
  }

  // 進入畫面立即並行開始兩軌 attestation
  useEffect(() => {
    runAtt1()
    runAtt2()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function phasePct(phase: AttPhase) {
    switch (phase) {
      case 'waiting': return Math.min((seconds / TOTAL_ESTIMATE) * 100, 90)
      case 'proving': return 92
      case 'proof_ready': return 94
      case 'submitting': return 96
      case 'done': return 100
      case 'error': return 0
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const bothDone = att1Phase === 'done' && att2Phase === 'done'

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 03: USC ATTESTATION</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-2">Waiting for Attestation</h2>
      <p className="text-gray-400 text-sm mb-6">
        USC is attesting your <span className="text-[#00C2FF] font-mono">Deposited</span> and{' '}
        <span className="text-[#00C2FF] font-mono">NodeRegistered</span> events in parallel.
        This takes 8–10 minutes — trustless verification can&apos;t be rushed.
      </p>

      <div className="border border-[#334155] bg-[#0F172A] p-6">
        <div className="flex flex-col items-center text-center">
          <OrbitAnimation />
          <div style={spaceGrotesk} className="text-4xl font-bold text-[#00C2FF] tabular-nums mb-6">{mm}:{ss}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <AttColumn
            label="ATT #1 — DEPOSITED"
            phase={att1Phase}
            txHash={att1TxHash}
            error={att1Error}
            pct={phasePct(att1Phase)}
            onRetry={runAtt1}
          />
          <AttColumn
            label="ATT #2 — NODE REGISTERED"
            phase={att2Phase}
            txHash={att2TxHash}
            error={att2Error}
            pct={phasePct(att2Phase)}
            onRetry={runAtt2}
            waitingLabel={att1TxHash ? 'Waiting for CC3 to finalize ATT#1...' : undefined}
          />
        </div>

        <div className="w-full border border-[#FF6B35] bg-[#FF6B35]/10 p-3 text-center">
          <p className="font-mono text-xs text-[#FF6B35] uppercase tracking-wider">
            ⚠ DO NOT CLOSE THIS TAB — USC ATTESTATION PROCESSING ON-CHAIN
          </p>
        </div>
      </div>

      {bothDone && (
        <button
          onClick={onNext}
          className="mt-6 bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
        >
          Continue →
        </button>
      )}
    </div>
  )
}

function LoanApprovedPanel({ loanId, onNext }: { loanId: string; onNext: () => void }) {
  // `loanId` here is CollateralVault's Sepolia-side id, not SpaceFinance's CC3-side loanCounter
  // (see SpaceFinance.sol's note on the two loanId namespaces). Resolve the real CC3 loanId via
  // getLoansByBorrower the same way Step4Panel does, then read that loan's disbursed amount.
  const { address } = useAccount()

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

  const { data: loanData } = useReadContract({
    address: CONTRACTS.spaceFinance.address,
    abi: SPACE_FINANCE_ABI,
    functionName: 'getLoan',
    args: [cc3LoanId!],
    chainId: cc3Testnet.id,
    query: { enabled: cc3LoanId !== undefined },
  })
  const loanAmount = loanData ? (loanData as unknown as unknown[])[6] as bigint : undefined

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">LOAN APPROVED</div>
      <h2 style={spaceGrotesk} className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <span className="text-[#3DFFC0]">✓</span> Loan Approved
      </h2>

      <div className="bg-[#0F172A] border border-[#3DFFC0]/30 p-6 font-mono text-sm space-y-3 mb-8">
        <div className="flex justify-between">
          <span className="text-gray-500">Amount</span>
          <span className="text-[#00C2FF]">
            {loanAmount !== undefined ? formatUnits(loanAmount, 18) : 'Loading...'} mUSDF
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Loan ID</span>
          <span className="text-[#00C2FF]">{loanId}</span>
        </div>
      </div>

      <button
        onClick={onNext}
        className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF]"
      >
        PROCEED TO REPAY →
      </button>
    </div>
  )
}

function Step4Panel({ loanId, onNext }: { loanId: string; onNext: () => void }) {
  const [amount, setAmount] = useState('1000')
  const [phase, setPhase] = useState<
    'idle' | 'approving' | 'approve-confirming' | 'repaying' | 'repay-confirming' | 'done' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | null>(null)
  const [repayTxHash, setRepayTxHash] = useState<`0x${string}` | null>(null)
  const { isConnected, chainId, address } = useAccount()
  const isRightChain = chainId === cc3Testnet.id
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: cc3Testnet.id })

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

  const { data: loanData } = useReadContract({
    address: CONTRACTS.spaceFinance.address,
    abi: SPACE_FINANCE_ABI,
    functionName: 'getLoan',
    args: [cc3LoanId!],
    chainId: cc3Testnet.id,
    query: { enabled: cc3LoanId !== undefined },
  })
  const contractLoanAmount = loanData ? (loanData as unknown as unknown[])[6] as bigint : undefined

  useEffect(() => {
    if (contractLoanAmount !== undefined) {
      setAmount(formatUnits(contractLoanAmount, 18))
    }
  }, [contractLoanAmount])

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

      // Wait for the approve tx to actually land on-chain before submitting repay — otherwise
      // repay could be sent (and even land in the same or an earlier block) before the allowance
      // it depends on is actually set.
      setPhase('approve-confirming')
      const approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveTx })
      if (approveReceipt.status === 'reverted') {
        throw new Error('Approve transaction reverted on-chain.')
      }

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

      setPhase('repay-confirming')
      const repayReceipt = await publicClient!.waitForTransactionReceipt({ hash: repayTx })
      if (repayReceipt.status === 'reverted') {
        throw new Error('Repay transaction reverted on-chain.')
      }

      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message.split('\n')[0] : String(e))
      setPhase('error')
    }
  }

  return (
    <div>
      <ChainSwitchBanner requiredChainId={cc3Testnet.id} requiredChainName="CC3 Testnet" />
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 04: REPAY</div>
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

      {(phase === 'approving' || phase === 'approve-confirming' || phase === 'repaying' || phase === 'repay-confirming') && (
        <div className="mt-6 space-y-3">
          <div className="text-xs font-mono text-gray-400">
            {phase === 'approving' && '1/2 Confirm approve in wallet...'}
            {phase === 'approve-confirming' && '1/2 Confirming approve on CC3...'}
            {phase === 'repaying' && '2/2 Confirm repay in wallet...'}
            {phase === 'repay-confirming' && '2/2 Confirming repay on CC3...'}
          </div>
          <div className="w-full h-2 bg-[#1E293B] border border-[#334155] overflow-hidden">
            <div
              className="h-full bg-[#00C2FF] animate-pulse"
              style={{
                width:
                  phase === 'approving' ? '20%' :
                  phase === 'approve-confirming' ? '40%' :
                  phase === 'repaying' ? '60%' : '80%',
              }}
            />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#0F172A] border border-[#3DFFC0]/30 p-4 font-mono text-sm space-y-2">
            {approveTxHash && (
              <div className="text-xs text-gray-500">
                <span style={checkmarkStyle}>✓</span> Approve Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${approveTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF] hover:text-[#75d1ff]">{approveTxHash.slice(0, 20)}...</a>
              </div>
            )}
            {repayTxHash && (
              <div className="text-xs text-gray-500">
                <span style={checkmarkStyle}>✓</span> Repay Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${repayTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF] hover:text-[#75d1ff]">{repayTxHash.slice(0, 20)}...</a>
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

function Step5Panel({ loanId, nodeId, sepoliaLoanId }: { loanId: string; nodeId: string; sepoliaLoanId: string }) {
  const { address } = useAccount()
  const { data: mUsdfBalance } = useReadContract({
    address: CONTRACTS.mockPayoutToken.address,
    abi: MOCK_PAYOUT_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: cc3Testnet.id,
    query: { enabled: !!address },
  })

  const sepoliaLoanIdBig = BigInt(sepoliaLoanId || '0')

  const { data: isAuthorized } = useReadContract({
    address: CONTRACTS.collateralVault.address,
    abi: COLLATERAL_VAULT_WITHDRAW_ABI,
    functionName: 'withdrawalAuthorized',
    args: [sepoliaLoanIdBig],
    chainId: sepolia.id,
    query: { enabled: sepoliaLoanIdBig > 0n, refetchInterval: 15000 },
  })

  const { data: depositData } = useReadContract({
    address: CONTRACTS.collateralVault.address,
    abi: COLLATERAL_VAULT_ABI,
    functionName: 'deposits',
    args: [sepoliaLoanIdBig],
    chainId: sepolia.id,
    query: { enabled: sepoliaLoanIdBig > 0n, refetchInterval: 15000 },
  })
  const isWithdrawn = depositData?.[3] === true

  const { writeContract: writeWithdraw, data: withdrawTxHash, isPending: isWithdrawPending, error: withdrawError } = useWriteContract()
  const { isLoading: isWithdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawTxHash })

  function handleWithdraw() {
    writeWithdraw({
      address: CONTRACTS.collateralVault.address,
      abi: COLLATERAL_VAULT_WITHDRAW_ABI,
      functionName: 'withdraw',
      args: [sepoliaLoanIdBig],
      chainId: sepolia.id,
    })
  }

  return (
    <div>
      <div className="mb-2 font-mono text-xs text-gray-500 uppercase tracking-wider">STEP 05: COMPLETE</div>
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

      <div className="border-t border-[#334155] pt-6 mt-6">
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">COLLATERAL RELEASE</div>

        <ChainSwitchBanner requiredChainId={sepolia.id} requiredChainName="Sepolia" />

        {isWithdrawn ? (
          <div className="text-sm font-mono text-[#3DFFC0]">✓ ETH Returned to your wallet</div>
        ) : isAuthorized ? (
          <div className="space-y-3">
            <div className="text-xs font-mono text-[#3DFFC0]">✓ Withdrawal authorized by admin</div>
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawPending || isWithdrawConfirming}
              className="bg-[#00C2FF] text-[#0F172A] font-mono text-xs uppercase tracking-wider px-6 py-3 hover:bg-[#75d1ff] transition-colors border border-[#00C2FF] disabled:opacity-50"
            >
              {isWithdrawPending ? 'Confirm in wallet...' : isWithdrawConfirming ? 'Confirming...' : 'WITHDRAW ETH →'}
            </button>
            {withdrawError && (
              <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 px-4 py-3">
                {withdrawError.message.split('\n')[0]}
              </div>
            )}
            {withdrawTxHash && (
              <div className="text-xs font-mono text-gray-500">
                Tx: <a href={`https://sepolia.etherscan.io/tx/${withdrawTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[#00C2FF]">{withdrawTxHash.slice(0, 20)}...</a>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-mono text-[#FF6B35]">⏳ Awaiting admin authorization to release collateral</div>
            <button
              disabled
              className="bg-[#334155] text-gray-600 font-mono text-xs uppercase tracking-wider px-6 py-3 border border-[#334155] cursor-not-allowed"
            >
              WITHDRAW ETH →
            </button>
            <div className="text-xs font-mono text-gray-600">Checking every 15s...</div>
          </div>
        )}
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
  const [registerBlock, setRegisterBlock] = useState<bigint>(0n)
  const [registerTxHash, setRegisterTxHash] = useState<`0x${string}` | undefined>(undefined)

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
          <p className="text-gray-500 text-sm font-mono">Parallel USC attestation + repayment · ~15 minutes total</p>
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
            {step === 2 && <Step2Panel onNext={(id, block, txHash) => {
              setNodeId(id)
              setRegisterBlock(block)
              setRegisterTxHash(txHash)
              setStep(3)
            }} />}
            {step === 3 && depositTxHash !== undefined && registerTxHash !== undefined && (
              <Step3Panel
                depositBlock={depositBlock}
                depositTxHash={depositTxHash}
                registerBlock={registerBlock}
                registerTxHash={registerTxHash}
                onNext={() => setStep('loan-approved')}
              />
            )}
            {step === 'loan-approved' && (
              <LoanApprovedPanel
                loanId={loanId}
                onNext={() => setStep(4)}
              />
            )}
            {step === 4 && (
              <Step4Panel
                loanId={loanId}
                onNext={() => setStep(5)}
              />
            )}
            {step === 5 && <Step5Panel loanId={loanId} nodeId={nodeId} sepoliaLoanId={loanId} />}
          </section>
        </div>
      </main>
    </div>
  )
}
