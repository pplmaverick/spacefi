import { proofProvider } from '@gluwa/usc-sdk'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as dotenv from 'dotenv'
dotenv.config()

const PROOF_BUILDER_URL = 'https://prover.cc3-testnet.creditcoin.network'
const CHAIN_KEY = 1
const REGISTER_TX_HASH = '0xd726dd36224a68d7c65cffdcbba9ef50ff793da86a7fcaaea5cadcf040809eb4'
const REGISTER_BLOCK = 11499667n
const SPACE_FINANCE = '0xEE93Cc7c31367599bf21aB78Aea21D6011d8750B'

const cc3Testnet = {
  id: 102031,
  name: 'Creditcoin CC3 Testnet',
  nativeCurrency: { name: 'CTC', symbol: 'CTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] } },
} as const

const SPACE_FINANCE_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'action', type: 'uint8' },
      { name: 'chainKey', type: 'uint64' },
      { name: 'blockHeight', type: 'uint64' },
      { name: 'encodedTransaction', type: 'bytes' },
      { name: 'merkleRoot', type: 'bytes32' },
      { name: 'siblings', type: 'tuple[]', components: [
        { name: 'isLeft', type: 'bool' },
        { name: 'hash', type: 'bytes32' },
      ]},
      { name: 'lowerEndpointDigest', type: 'bytes32' },
      { name: 'continuityRoots', type: 'bytes32[]' },
    ],
    outputs: [],
  },
] as const

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

  const walletClient = createWalletClient({
    account,
    chain: cc3Testnet,
    transport: http(),
  })

  const publicClient = createPublicClient({
    chain: cc3Testnet,
    transport: http(),
  })

  console.log('Getting USC proof for NodeRegistered tx...')
  const proofBuilder = new proofProvider.service.ProofBuilder(CHAIN_KEY, PROOF_BUILDER_URL)

  await proofBuilder.waitUntilHeightAttested(
    CHAIN_KEY,
    Number(REGISTER_BLOCK),
    15_000,
    1_200_000
  )

  console.log('Waiting 45s for USC prover to stabilize before fetching proof...')
  await new Promise(resolve => setTimeout(resolve, 45_000))
  const result = await proofBuilder.getProof(REGISTER_TX_HASH)
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to get proof')
  }

  const proof = result.data
  console.log('Proof obtained, submitting execute(action=1) to CC3...')

  const hash = await walletClient.writeContract({
    address: SPACE_FINANCE,
    abi: SPACE_FINANCE_ABI,
    functionName: 'execute',
    args: [
      1,
      BigInt(proof.chainKey),
      BigInt(proof.headerNumber),
      proof.txBytes as `0x${string}`,
      proof.merkleProof.root as `0x${string}`,
      proof.merkleProof.siblings.map((s: any) => ({
        isLeft: s.isLeft,
        hash: s.hash as `0x${string}`,
      })),
      proof.continuityProof.lowerEndpointDigest as `0x${string}`,
      proof.continuityProof.roots.map((r: any) => r as `0x${string}`),
    ],
    gas: 500000n,
  })

  console.log('TX submitted:', hash)
  console.log('Waiting for receipt...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    console.error('❌ TX reverted on-chain! Loan #2 not updated.')
    process.exit(1)
  }
  console.log('✅ TX confirmed and succeeded! Loan #2 should now be NodeVerified/Active.')
}

main().catch(console.error)
