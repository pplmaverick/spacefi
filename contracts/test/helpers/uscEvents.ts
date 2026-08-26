import { AbiCoder, keccak256, toUtf8Bytes, zeroPadValue } from "ethers";

/**
 * Builds `encodedTransaction` bytes that EvmV1Decoder (from @gluwa/usc-contracts) can decode,
 * without going through any real proof pipeline.
 *
 * EvmV1Decoder's on-chain format is just `abi.encode(uint8 txType, bytes[] chunks)`, where for tx
 * types 0-2 `chunks` must have exactly 3 entries and only `chunks[2]` (the receipt chunk) is ever
 * decoded further by SpaceFinance's flow (`decodeReceiptFields` -> `getLogsByEventSignature`).
 * `chunks[0]` / `chunks[1]` (common tx fields / type-specific fields) are read as raw opaque
 * `bytes` and never decoded by the code paths SpaceFinance exercises, so they're left empty here.
 *
 * This lets tests simulate "a Sepolia transaction receipt containing event X" as plain,
 * inspectable TypeScript instead of needing a real cross-chain proof — exactly the "mock USC
 * verify, don't call the real precompile" approach requested for the SpaceFinance test suite.
 */

const abiCoder = AbiCoder.defaultAbiCoder();

export const DEPOSITED_EVENT_SIGNATURE = keccak256(toUtf8Bytes("Deposited(address,uint256,uint256,uint256)"));
export const NODE_REGISTERED_EVENT_SIGNATURE = keccak256(toUtf8Bytes("NodeRegistered(address,bytes32)"));

interface LogSpec {
  address: string;
  topics: string[];
  data: string;
}

function encodeReceiptTransaction(logs: LogSpec[], receiptStatus = 1): string {
  const receiptChunk = abiCoder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [receiptStatus, 21_000, logs.map((l) => [l.address, l.topics, l.data]), "0x"]
  );
  // txType = 0 (legacy) -> receipt lives at chunks[2], chunks.length must be 3.
  return abiCoder.encode(["uint8", "bytes[]"], [0, ["0x", "0x", receiptChunk]]);
}

/** Encodes a fake Sepolia receipt containing exactly one CollateralVault.Deposited log. */
export function encodeDepositedTx(params: {
  vaultAddress: string;
  borrower: string;
  loanId: bigint;
  amount: bigint;
  usdValue: bigint;
  receiptStatus?: number;
}): string {
  const topics = [DEPOSITED_EVENT_SIGNATURE, zeroPadValue(params.borrower, 32)];
  const data = abiCoder.encode(["uint256", "uint256", "uint256"], [params.loanId, params.amount, params.usdValue]);
  return encodeReceiptTransaction(
    [{ address: params.vaultAddress, topics, data }],
    params.receiptStatus ?? 1
  );
}

/** Encodes a fake Sepolia receipt containing exactly one NodeRegistry.NodeRegistered log. */
export function encodeNodeRegisteredTx(params: {
  registryAddress: string;
  operator: string;
  nodeId: string;
  receiptStatus?: number;
}): string {
  const topics = [NODE_REGISTERED_EVENT_SIGNATURE, zeroPadValue(params.operator, 32), params.nodeId];
  return encodeReceiptTransaction(
    [{ address: params.registryAddress, topics, data: "0x" }],
    params.receiptStatus ?? 1
  );
}

/** Deterministic, unique-per-input merkle root — only used here to keep mock queryIds distinct. */
export function fakeMerkleRoot(seed: string): string {
  return keccak256(toUtf8Bytes(seed));
}
