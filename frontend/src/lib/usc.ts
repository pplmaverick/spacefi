import { proofProvider } from '@gluwa/usc-sdk'

const PROOF_BUILDER_URL = process.env.NEXT_PUBLIC_PROOF_BUILDER_URL!
const CHAIN_KEY = 1 // Sepolia — confirmed via spacefi-contracts/scripts/e2e.ts (SOURCE_CHAIN_KEY), verified end-to-end

export async function waitAndGetProof(blockNumber: bigint, txHash: string) {
  const proofBuilder = new proofProvider.service.ProofBuilder(CHAIN_KEY, PROOF_BUILDER_URL)

  // 等 block 被 attest（最多 20 分鐘）
  await proofBuilder.waitUntilHeightAttested(
    CHAIN_KEY,
    Number(blockNumber),
    15_000,      // poll 間隔 15 秒
    1_200_000    // timeout 20 分鐘
  )

  // 拿 proof（用 tx hash 查，不是 block+txIndex）
  const result = await proofBuilder.getProof(txHash)
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to generate proof')
  }
  return result.data
}

export function buildExecuteArgs(action: 0 | 1, proof: proofProvider.ContinuityResponse) {
  return {
    action,
    chainKey: BigInt(proof.chainKey),
    blockHeight: BigInt(proof.headerNumber),
    encodedTransaction: proof.txBytes as `0x${string}`,
    merkleRoot: proof.merkleProof.root as `0x${string}`,
    siblings: proof.merkleProof.siblings.map((s) => ({
      isLeft: s.isLeft,
      hash: s.hash as `0x${string}`,
    })),
    lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest as `0x${string}`,
    continuityRoots: proof.continuityProof.roots.map((r) => r as `0x${string}`),
  }
}
