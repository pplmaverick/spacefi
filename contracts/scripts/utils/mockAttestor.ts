import { ethers } from "ethers";

/**
 * Stand-in for a real USC attestor network's signing + relaying step. A production write-ability
 * deployment has independent attestor nodes watch the Outbox, sign `MessagePublished` events, and
 * relay `deliverMessage` calls to the destination Inbox. Here that role is played by a small set
 * of Hardhat/test EOAs whose addresses are seeded into the destination-chain AttestorRegistry (see
 * deploy-sepolia-writeability.ts) — the contract logic (Outbox/Inbox/EOAValidator) is completely
 * real; only the attestor *identity* is mocked. Do not point this at anything but a testnet.
 */

/**
 * Recovers the 20-byte emitter address from an Outbox `MessagePublished` event's
 * `emitterAddress` topic, which is `bytes32(bytes20(emitter))` — a Solidity fixed-bytes widening
 * conversion that keeps the original bytes at the start (left) and zero-pads on the right. That is
 * NOT the usual right-aligned `uint256`/`address` topic packing, so it can't be decoded with
 * `AbiCoder`/`getAddress` on the raw topic — the address is the first 20 bytes, not the last.
 */
export function decodeEmitterFromTopic(topic: string): string {
  return ethers.getAddress("0x" + topic.slice(2, 42));
}

/**
 * Reproduces `Inbox.deliverMessage`'s message hash exactly:
 * `keccak256(abi.encode(messageId, emitterAddress, localChainKey, creditcoinChainId, payload))`.
 * Attestors sign this hash directly (see `signAsMockAttestors`); Inbox recomputes it on delivery.
 */
export function computeInboxMessageHash(params: {
  messageId: string;
  emitterAddress: string;
  localChainKey: string; // bytes32
  creditcoinChainId: bigint | number;
  payload: string; // ABI-encoded payload bytes, as hex
}): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "bytes32", "uint256", "bytes"],
      [params.messageId, params.emitterAddress, params.localChainKey, params.creditcoinChainId, params.payload]
    )
  );
}

/**
 * Signs `messageHash` with each of `privateKeys`, raw — no EIP-191/`personal_sign` prefix.
 * `EOAValidator._recoverChecked` does a bare `ecrecover` against the hash it's given, so this must
 * byte-for-byte match what a real attestor node's signer produces. Returns the ABI-encoded
 * `bytes[] signatures` blob that `Inbox.deliverMessage`'s `votes` parameter expects.
 */
export function signAsMockAttestors(messageHash: string, privateKeys: string[]): string {
  const signatures = privateKeys.map((pk) => {
    const signingKey = new ethers.SigningKey(pk);
    // .serialized: 65-byte r(32) + s(32) + v(1, 27|28) — the exact layout
    // EOAValidator._recoverChecked's assembly block extracts.
    return signingKey.sign(messageHash).serialized;
  });
  return ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [signatures]);
}

export interface ParsedMessagePublished {
  messageId: string;
  emitterAddress: string;
  canAck: boolean;
  payload: string;
}

/**
 * Parses an `Outbox.MessagePublished(bytes32 indexed messageId, bytes32 indexed emitterAddress,
 * bool canAck, bytes payload)` log without needing the full Outbox ABI loaded — callers on the
 * Sepolia side often only have the destination-chain provider connected.
 */
export function parseMessagePublishedLog(log: { topics: readonly string[]; data: string }): ParsedMessagePublished {
  const [canAck, payload] = ethers.AbiCoder.defaultAbiCoder().decode(["bool", "bytes"], log.data);

  return {
    messageId: log.topics[1],
    emitterAddress: decodeEmitterFromTopic(log.topics[2]),
    canAck,
    payload,
  };
}
