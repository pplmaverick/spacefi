import { ethers } from 'ethers'

/**
 * Server-only helpers for the USC write-ability relay. Mirrors
 * contracts/scripts/utils/mockAttestor.ts exactly (same message-hash and signature format) — kept
 * as a separate copy here because this is an independent Next.js project, not a shared package.
 * Never import this from a client component: it only makes sense alongside private keys that must
 * stay server-side (see route.ts).
 */

/** Recovers the 20-byte emitter address from Outbox's `MessagePublished` `emitterAddress` topic,
 * which is `bytes32(bytes20(emitter))` — zero-padded on the right, not the usual right-aligned
 * `address`-as-`bytes32` topic encoding. */
export function decodeEmitterFromTopic(topic: string): string {
  return ethers.getAddress('0x' + topic.slice(2, 42))
}

/** Reproduces `Inbox.deliverMessage`'s message hash:
 * `keccak256(abi.encode(messageId, emitterAddress, localChainKey, creditcoinChainId, payload))`. */
export function computeInboxMessageHash(params: {
  messageId: string
  emitterAddress: string
  localChainKey: string
  creditcoinChainId: bigint | number
  payload: string
}): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'bytes32', 'uint256', 'bytes'],
      [params.messageId, params.emitterAddress, params.localChainKey, params.creditcoinChainId, params.payload]
    )
  )
}

/** Signs `messageHash` raw (no EIP-191 prefix) with each of `privateKeys` — matches what
 * `EOAValidator._recoverChecked`'s bare `ecrecover` expects. Returns the ABI-encoded
 * `bytes[] signatures` blob `Inbox.deliverMessage`'s `votes` parameter expects. */
export function signAsMockAttestors(messageHash: string, privateKeys: string[]): string {
  const signatures = privateKeys.map((pk) => new ethers.SigningKey(pk).sign(messageHash).serialized)
  return ethers.AbiCoder.defaultAbiCoder().encode(['bytes[]'], [signatures])
}
