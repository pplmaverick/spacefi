'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { WalletButton } from '@/components/WalletButton'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from 'wagmi'
import { parseEther, decodeEventLog, parseUnits } from 'viem'
import { CONTRACTS, COLLATERAL_VAULT_ABI, NODE_REGISTRY_ABI, SPACE_FINANCE_ABI, MOCK_PAYOUT_TOKEN_ABI } from '@/lib/contracts'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEPS = [
  { id: 1, chain: 'SEPOLIA', label: 'Deposit Collateral' },
  { id: 2, chain: 'USC', label: 'Attestation #1' },
  { id: 3, chain: 'SEPOLIA', label: 'Register Node' },
  { id: 4, chain: 'USC', label: 'Attestation #2' },
  { id: 5, chain: 'CC3', label: 'Repay Loan' },
  { id: 6, chain: 'CC3', label: 'Complete' },
] as const

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-12">
      {STEPS.map((s, i) => {
        const done = s.id < current
        const active = s.id === current
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-mono transition-colors
                ${done ? 'bg-cyan-500 border-cyan-500 text-black' : active ? 'bg-transparent border-cyan-400 text-cyan-400' : 'bg-transparent border-gray-700 text-gray-600'}`}>
                {done ? '✓' : String(s.id).padStart(2, '0')}
              </div>
              <div className={`mt-1 text-xs font-mono whitespace-nowrap ${active ? 'text-cyan-400' : done ? 'text-gray-400' : 'text-gray-700'}`}>
                {s.label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-16 mb-5 transition-colors ${s.id < current ? 'bg-cyan-500' : 'bg-gray-700'}`} />
            )}
          </div>
        )
      })}
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
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 1 · Sepolia</div>
      <h2 className="text-2xl font-bold mb-2">Deposit Collateral</h2>
      <p className="text-gray-400 text-sm mb-8">
        Lock ETH in CollateralVault on Sepolia. You&apos;ll receive a loanId that tracks your financing request.
      </p>

      <WalletButton requiredChainId={sepolia.id} />

      {isConnected && isRightChain && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-2">Amount (ETH)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              step="0.001"
              min="0.001"
              disabled={isLoading}
              className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
          </div>

          <button
            onClick={handleDeposit}
            disabled={isLoading || !amount}
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Deposit ETH →'}
          </button>

          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              Tx: <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:text-cyan-400"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}

          {writeError && (
            <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
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
  const POLL_SECONDS = 15
  const TOTAL_ESTIMATE = 600 // 10 min estimate for progress bar

  const { writeContractAsync } = useWriteContract()

  async function startAttestation() {
    setPhase('waiting')
    setElapsed(0)

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

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle: '',
    waiting: 'Waiting for Creditcoin to attest block...',
    proving: 'Building proof...',
    submitting: 'Submitting to CC3...',
    done: 'Attestation confirmed ✓',
    error: 'Attestation failed',
  }

  return (
    <div>
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 2 · USC Attestation</div>
      <h2 className="text-2xl font-bold mb-2">Waiting for Attestation #1</h2>
      <p className="text-gray-400 text-sm mb-6">
        USC is attesting your <span className="text-cyan-400 font-mono">Deposited</span> event on Sepolia.
        This takes 8–10 minutes — trustless verification can&apos;t be rushed.
      </p>

      <div className="bg-[#080c14] border border-[#1a2744] rounded-lg p-4 mb-6 font-mono text-sm">
        <div className="text-gray-500 text-xs mb-1">Loan ID</div>
        <div className="text-cyan-400">{loanId}</div>
        <div className="text-gray-500 text-xs mt-2 mb-1">Block</div>
        <div className="text-gray-300">{depositBlock.toString()}</div>
      </div>

      {phase === 'idle' && (
        <button
          onClick={startAttestation}
          className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
        >
          Start Attestation →
        </button>
      )}

      {(phase === 'waiting' || phase === 'proving' || phase === 'submitting') && (
        <div>
          <div className="flex justify-between text-xs font-mono text-gray-500 mb-2">
            <span>{PHASE_LABEL[phase]}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="w-full h-2 bg-[#1a2744] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-cyan-500 transition-all duration-1000 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs font-mono text-gray-600">
            Polling every {POLL_SECONDS}s · timeout 20min
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div className="w-full h-2 bg-cyan-500 rounded-full" />
          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              CC3 Tx: <a
                href={`https://cc3-testnet.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:text-cyan-400"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}
          <button
            onClick={onNext}
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setElapsed(0); setErrorMsg('') }}
            className="px-6 py-3 border border-[#1a2744] text-gray-300 rounded-lg hover:border-cyan-500/50 font-mono text-sm"
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
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 3 · Sepolia</div>
      <h2 className="text-2xl font-bold mb-2">Register Node Identity</h2>
      <p className="text-gray-400 text-sm mb-8">
        Submit your Spacecoin nodeId to NodeRegistry on Sepolia. This proves you operate a real node.
      </p>

      <WalletButton requiredChainId={sepolia.id} />

      {isConnected && isRightChain && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-2">Node ID (bytes32)</label>
            <input
              type="text"
              value={nodeIdInput}
              onChange={e => { setNodeIdInput(e.target.value); setInputError('') }}
              placeholder="0x0000000000000000000000000000000000000000000000000000000000000001"
              disabled={isLoading}
              className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-full focus:outline-none focus:border-cyan-500 text-sm disabled:opacity-50"
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
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Register Node →'}
          </button>

          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              Tx: <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:text-cyan-400"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}

          {writeError && (
            <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
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
  const POLL_SECONDS = 15
  const TOTAL_ESTIMATE = 600

  const { writeContractAsync } = useWriteContract()

  async function startAttestation() {
    setPhase('waiting')
    setElapsed(0)

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

  const PHASE_LABEL: Record<typeof phase, string> = {
    idle: '',
    waiting: 'Waiting for Creditcoin to attest block...',
    proving: 'Building proof...',
    submitting: 'Submitting to CC3...',
    done: 'Attestation confirmed ✓',
    error: 'Attestation failed',
  }

  return (
    <div>
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 4 · USC Attestation</div>
      <h2 className="text-2xl font-bold mb-2">Waiting for Attestation #2</h2>
      <p className="text-gray-400 text-sm mb-6">
        USC is attesting your <span className="text-cyan-400 font-mono">NodeRegistered</span> event.
        Once confirmed, SpaceFinance will automatically release your mUSDF.
      </p>

      <div className="bg-[#080c14] border border-[#1a2744] rounded-lg p-4 mb-6 font-mono text-sm">
        <div className="text-gray-500 text-xs mb-1">Block</div>
        <div className="text-gray-300">{nodeBlock.toString()}</div>
      </div>

      {phase === 'idle' && (
        <button
          onClick={startAttestation}
          className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
        >
          Start Attestation →
        </button>
      )}

      {(phase === 'waiting' || phase === 'proving' || phase === 'submitting') && (
        <div>
          <div className="flex justify-between text-xs font-mono text-gray-500 mb-2">
            <span>{PHASE_LABEL[phase]}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="w-full h-2 bg-[#1a2744] rounded-full overflow-hidden mb-4">
            <div className="h-full bg-cyan-500 transition-all duration-1000 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div className="w-full h-2 bg-cyan-500 rounded-full" />
          {txHash && (
            <div className="text-xs font-mono text-gray-500">
              CC3 Tx: <a
                href={`https://cc3-testnet.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:text-cyan-400"
              >{txHash.slice(0, 20)}...</a>
            </div>
          )}
          <button
            onClick={onNext}
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setElapsed(0); setErrorMsg('') }}
            className="px-6 py-3 border border-[#1a2744] text-gray-300 rounded-lg hover:border-cyan-500/50 font-mono text-sm"
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
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 5 · CC3 Testnet</div>
      <h2 className="text-2xl font-bold mb-2">Repay Loan</h2>
      <p className="text-gray-400 text-sm mb-8">
        Repay your mUSDF loan. Full repayment unlocks your ETH collateral on Sepolia.
      </p>

      <WalletButton requiredChainId={cc3Testnet.id} />

      {isConnected && isRightChain && phase === 'idle' && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#080c14] border border-[#1a2744] rounded-lg p-4 font-mono text-sm">
            <div className="text-gray-500 text-xs mb-1">Loan ID</div>
            <div className="text-cyan-400">{loanId}</div>
            <div className="text-gray-500 text-xs mt-2 mb-1">CC3 Loan ID</div>
            <div className="text-cyan-400">{cc3LoanId !== undefined ? cc3LoanId.toString() : 'Loading...'}</div>
          </div>
          <div>
            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-2">Amount (mUSDF)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
              className="bg-[#080c14] border border-[#1a2744] text-white font-mono px-4 py-2 rounded-lg w-48 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={handleRepay}
            disabled={!amount || !cc3LoanId}
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="w-full h-2 bg-[#1a2744] rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full animate-pulse" style={{ width: phase === 'approving' ? '40%' : '80%' }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#080c14] border border-green-500/30 rounded-lg p-4 font-mono text-sm space-y-2">
            {approveTxHash && (
              <div className="text-xs text-gray-500">
                Approve Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${approveTxHash}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-400">{approveTxHash.slice(0, 20)}...</a>
              </div>
            )}
            {repayTxHash && (
              <div className="text-xs text-gray-500">
                Repay Tx: <a href={`https://cc3-testnet.blockscout.com/tx/${repayTxHash}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-400">{repayTxHash.slice(0, 20)}...</a>
              </div>
            )}
          </div>
          <button
            onClick={onNext}
            className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono"
          >
            Continue →
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-6 space-y-4">
          <div className="text-xs font-mono text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase('idle'); setErrorMsg('') }}
            className="px-6 py-3 border border-[#1a2744] text-gray-300 rounded-lg hover:border-cyan-500/50 font-mono text-sm"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Step6Panel({ loanId, nodeId }: { loanId: string; nodeId: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">Step 6 · CC3 Testnet</div>
      <h2 className="text-2xl font-bold mb-2">Financing Active 🎉</h2>
      <p className="text-gray-400 text-sm mb-8">
        Both USC attestations confirmed. mUSDF has been released to your wallet on Creditcoin CC3.
      </p>
      <div className="bg-[#0d1424] border border-cyan-500/30 rounded-lg p-6 mb-6 space-y-3">
        <div className="flex justify-between font-mono text-sm">
          <span className="text-gray-500">Loan ID</span>
          <span className="text-cyan-400">{loanId}</span>
        </div>
        <div className="flex justify-between gap-4 font-mono text-sm">
          <span className="text-gray-500 flex-shrink-0">Node ID</span>
          <span className="text-cyan-400 break-all text-right">{nodeId}</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-gray-500">Status</span>
          <span className="text-green-400">● Active</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-gray-500">Token</span>
          <span className="text-white">mUSDF</span>
        </div>
      </div>
      <div className="bg-[#080c14] border border-yellow-500/20 rounded-lg p-4 mb-4 font-mono text-xs text-yellow-400/70">
        ⚠ Collateral release requires owner authorization. Contact the team to unlock your ETH on Sepolia after repayment is confirmed.
      </div>
      <div className="flex gap-4">
        <Link href="/dashboard" className="px-6 py-3 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors font-mono">
          View Dashboard →
        </Link>
        <Link href="/revenue" className="px-6 py-3 border border-[#1a2744] text-gray-300 rounded-lg hover:border-cyan-500/50 hover:text-cyan-400 transition-colors font-mono text-sm">
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
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Nav */}
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
          <h1 className="text-3xl font-bold mt-4 mb-1">Apply for Financing</h1>
          <p className="text-gray-500 text-sm font-mono">Two USC attestations + repayment · ~25 minutes total</p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8">
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
        </div>
      </main>
    </div>
  )
}
