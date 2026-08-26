import { artifacts, network } from "hardhat";

/**
 * Address of the Native Query Verifier precompile on real Creditcoin networks (see
 * VerifierInterface.sol:NativeQueryVerifierLib.PRECOMPILE_ADDRESS). Hardhat Network has no such
 * precompile, so tests that exercise SpaceFinance.execute() must inject mock bytecode here first.
 */
export const NATIVE_QUERY_VERIFIER_ADDRESS = "0x0000000000000000000000000000000000000FD2";

/**
 * Injects MockNativeQueryVerifier's runtime bytecode at the fixed precompile address using
 * Hardhat Network's `hardhat_setCode`. This is the "mock the USC verify" strategy requested for
 * SpaceFinance tests: we never call a real precompile (there isn't one locally), we substitute a
 * contract that always reports proofs as verified so SpaceFinance's own loan state machine can be
 * exercised through its real `execute()` entrypoint.
 */
export async function installMockVerifier(): Promise<void> {
  const artifact = await artifacts.readArtifact("MockNativeQueryVerifier");
  await network.provider.send("hardhat_setCode", [NATIVE_QUERY_VERIFIER_ADDRESS, artifact.deployedBytecode]);
}
