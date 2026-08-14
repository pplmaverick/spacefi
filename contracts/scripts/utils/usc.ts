import { Contract, JsonRpcApiProvider } from "ethers";
import { proofProvider, chainInfo } from "@gluwa/usc-sdk";

/**
 * Waits for a source-chain transaction's block to be attested on Creditcoin, then fetches the
 * Merkle + continuity proof for it. Mirrors
 * usc-testnet-bridge-examples/utils/index.ts:generateProofFor exactly (same SDK, same call
 * pattern) — this is proven to work end-to-end from the hello-bridge / loan-flow runs.
 *
 * Prints a progress line only every 4th poll (~once a minute, since the underlying poll interval
 * is 15s) to avoid spamming the console during the ~8-10 minute attestation wait.
 */
export async function generateProofFor(
  txHash: string,
  chainKey: number,
  proofBuilderUrl: string,
  creditcoinRpc: JsonRpcApiProvider,
  sourceChainRpc: JsonRpcApiProvider
): Promise<proofProvider.ProofResult> {
  const transaction = await sourceChainRpc.getTransaction(txHash);
  if (!transaction) {
    throw new Error(`Transaction ${txHash} does not exist on source chain`);
  }

  const blockNumber = transaction.blockNumber;
  if (!blockNumber) {
    throw new Error(`Transaction ${txHash} is not yet mined on source chain`);
  }

  console.log(`Transaction ${txHash} found in block ${blockNumber}`);

  const proofBuilder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);
  const info = new chainInfo.PrecompileChainInfoProvider(creditcoinRpc);

  console.log(`Waiting for block ${blockNumber} attestation on Creditcoin...`);

  const latestAttested = await info.getLatestAttestedHeightAndHash(chainKey);
  console.log(`Latest attested height for chain key ${chainKey}: ${latestAttested.height}`);

  // waitUntilHeightAttested prints its own progress via console.debug on every 15s poll
  // ("Height X not yet attested... Retrying in 15000ms...") — same log lines we saw in the
  // hello-bridge / loan-flow runs. We don't reimplement the polling ourselves.
  await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber, 15_000, 1_200_000);

  console.log(`Block ${blockNumber} attested! Generating proof...`);

  try {
    const proof = await proofBuilder.getProof(txHash);
    console.log("Proof generation successful!");
    return proof;
  } catch (error) {
    console.error("Error during proof generation: ", error);
    throw error;
  }
}

/**
 * Estimates gas for a SpaceFinance.execute(...) call built from a ContinuityResponse proof, with
 * the same fallback heuristic as computeGasLimitForLoanManager/computeGasLimitForMinter in
 * usc-testnet-bridge-examples/utils/index.ts (gas estimation on this precompile sometimes fails
 * even when the call would succeed).
 */
export async function computeGasLimitForSpaceFinance(
  provider: JsonRpcApiProvider,
  contract: Contract,
  action: number,
  proofData: proofProvider.ContinuityResponse,
  signerAddress: string
): Promise<bigint> {
  const chainKey = proofData.chainKey;
  const height = proofData.headerNumber;
  const encodedTransaction = proofData.txBytes;
  const merkleRoot = proofData.merkleProof.root;
  const siblings = proofData.merkleProof.siblings;
  const lowerEndpointDigest = proofData.continuityProof.lowerEndpointDigest;
  const continuityRoots = proofData.continuityProof.roots;

  const iface = contract.interface;
  const funcFragment = iface.getFunction(
    "execute(uint8,uint64,uint64,bytes,bytes32,tuple(bytes32,bool)[],bytes32,bytes32[])"
  );
  const params = [action, chainKey, height, encodedTransaction, merkleRoot, siblings, lowerEndpointDigest, continuityRoots];
  const data = iface.encodeFunctionData(funcFragment!, params);

  const continuityBlocks = proofData.continuityProof.roots?.length || 1;

  console.log("⏳ Estimating gas...");
  const GAS_BUFFER_MULTIPLIER = 135; // 100% + 35% buffer
  const contractAddress = await contract.getAddress();
  try {
    const estimatedGas = await provider.estimateGas({ to: contractAddress, data, from: signerAddress });
    const gasLimit = (estimatedGas * BigInt(GAS_BUFFER_MULTIPLIER)) / BigInt(100);
    console.log(`   Estimated gas: ${estimatedGas.toString()}, Gas limit with buffer: ${gasLimit.toString()}`);
    return gasLimit;
  } catch (error: any) {
    const calculatedGas = 21000 + continuityBlocks * 5000 + 20000;
    console.warn(`   Gas estimation failed: ${error.shortMessage ?? error.message}`);
    console.log(`   Using calculated gas limit based on proof size: ${calculatedGas} (${continuityBlocks} continuity blocks)`);
    return BigInt(calculatedGas);
  }
}

/**
 * Submits a proved query to SpaceFinance.execute(...).
 */
export async function submitProofToSpaceFinance(
  contract: Contract,
  action: number,
  proofData: proofProvider.ContinuityResponse,
  gasLimit: bigint
) {
  const chainKey = proofData.chainKey;
  const height = proofData.headerNumber;
  const encodedTransaction = proofData.txBytes;
  const merkleRoot = proofData.merkleProof.root;
  const siblings = proofData.merkleProof.siblings;
  const lowerEndpointDigest = proofData.continuityProof.lowerEndpointDigest;
  const continuityRoots = proofData.continuityProof.roots;

  return contract.execute(
    action,
    chainKey,
    height,
    encodedTransaction,
    merkleRoot,
    siblings,
    lowerEndpointDigest,
    continuityRoots,
    { gasLimit }
  );
}
