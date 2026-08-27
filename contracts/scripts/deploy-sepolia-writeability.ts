import { ethers, network } from "hardhat";
import { loadDeployment, saveDeployment } from "./utils/deployment";

// Same placeholder deploy-sepolia.ts registers as CollateralVault's initial trusted inbox — see
// there for why. Revoked below once the real Inbox is wired up.
const PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * Deploys the Sepolia-side USC write-ability contracts (AttestorRegistry + EOAValidator + Inbox),
 * then wires CollateralVault's trusted inbox and trusted CC3 emitter. Run after deploy-cc3.ts,
 * deploy-sepolia.ts, and deploy-cc3-writeability.ts.
 * Usage: npx hardhat run scripts/deploy-sepolia-writeability.ts --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const existing = loadDeployment();
  const collateralVaultAddress = existing.sepolia?.collateralVault;
  const cc3ChainId = existing.cc3?.chainId;
  const spaceFinanceAddress = existing.cc3?.spaceFinance;
  if (!collateralVaultAddress) {
    throw new Error("deployment.json has no sepolia.collateralVault — run deploy-sepolia.ts first");
  }
  if (!cc3ChainId || !spaceFinanceAddress) {
    throw new Error("deployment.json has no cc3.chainId / cc3.spaceFinance — run deploy-cc3.ts first");
  }

  // Mock attestor set: Hardhat/test EOAs standing in for a real USC attestor network (see
  // scripts/utils/mockAttestor.ts). Their addresses go on-chain here; the matching private keys
  // stay off-chain in MOCK_ATTESTOR_PRIVATE_KEYS (.env), used only by the relayer script to sign.
  const attestorAddressesEnv = process.env.MOCK_ATTESTOR_ADDRESSES;
  if (!attestorAddressesEnv) {
    throw new Error(
      "Set MOCK_ATTESTOR_ADDRESSES in .env — comma-separated addresses, at least 3 " +
        "(EOAValidator.MIN_ATTESTOR_COUNT_FLOOR). See .env.example."
    );
  }
  const attestorAddresses = attestorAddressesEnv.split(",").map((a) => a.trim());
  if (attestorAddresses.length < 3) {
    throw new Error(`Need at least 3 mock attestor addresses, got ${attestorAddresses.length}`);
  }

  const AttestorRegistry = await ethers.getContractFactory(
    "usc-write-ability/contracts/write-ability/AttestorRegistry.sol:AttestorRegistry"
  );
  const attestorRegistry = await AttestorRegistry.deploy(deployer.address, attestorAddresses);
  await attestorRegistry.waitForDeployment();
  const attestorRegistryAddress = await attestorRegistry.getAddress();
  console.log(`\nAttestorRegistry (Sepolia) deployed to: ${attestorRegistryAddress}`);
  console.log(`  Mock attestors: ${attestorAddresses.join(", ")}`);

  // minAttestorCount = thresholdNumerator = attestorAddresses.length, addition = 0: with exactly
  // this many attestors seeded, `calculateRequiredVotes` needs every one of them to sign
  // (floor(N*N/30)... deliberately overridden below to just require unanimity for a small mock
  // set, which is simplest for the relayer script to satisfy).
  const attestorCount = attestorAddresses.length;
  const EOAValidator = await ethers.getContractFactory(
    "usc-write-ability/contracts/write-ability/EOAValidator.sol:EOAValidator"
  );
  const eoaValidator = await EOAValidator.deploy(
    deployer.address,
    attestorRegistryAddress,
    attestorCount, // minAttestorCount — floor is 3 (EOAValidator.MIN_ATTESTOR_COUNT_FLOOR)
    30, // thresholdNumerator = THRESHOLD_DENOMINATOR -> fraction is 30/30 = 100%
    0 // thresholdAddition
  );
  await eoaValidator.waitForDeployment();
  const eoaValidatorAddress = await eoaValidator.getAddress();
  console.log(`EOAValidator deployed to: ${eoaValidatorAddress} (requires all ${attestorCount} mock attestors to sign)`);

  // bytes32 chain key identifying Sepolia to the attestation/signing scheme — purely internal to
  // this stub deployment (no real USC network to match), defaults to Sepolia's own EVM chain id
  // encoded as bytes32 for a value that's easy to recognize in logs.
  const chainKeySource = process.env.SEPOLIA_WRITE_ABILITY_CHAIN_KEY ?? net.chainId.toString();
  const localChainKey = ethers.zeroPadValue(ethers.toBeHex(BigInt(chainKeySource)), 32);

  const Inbox = await ethers.getContractFactory("usc-write-ability/contracts/write-ability/Inbox.sol:Inbox");
  const inbox = await Inbox.deploy(
    localChainKey,
    cc3ChainId,
    eoaValidatorAddress,
    collateralVaultAddress, // messageDispatcher — CollateralVault already implements IMessageReceiver
    deployer.address
  );
  await inbox.waitForDeployment();
  const inboxAddress = await inbox.getAddress();
  console.log(`Inbox deployed to: ${inboxAddress}`);

  // Cast needed because getContractAt (attaching by address) only resolves to the generic
  // ethers.Contract type here — this project has no typechain bindings.
  const collateralVault = (await ethers.getContractAt("CollateralVault", collateralVaultAddress)) as any;

  let tx = await collateralVault.connect(deployer).setTrustedInbox(inboxAddress, true);
  await tx.wait();
  console.log(`\nCollateralVault.setTrustedInbox(inbox, true) tx: ${tx.hash}`);

  tx = await collateralVault.connect(deployer).setTrustedEmitter(spaceFinanceAddress, cc3ChainId);
  await tx.wait();
  console.log(`CollateralVault.setTrustedEmitter(spaceFinance, cc3ChainId) tx: ${tx.hash}`);

  tx = await collateralVault.connect(deployer).setTrustedInbox(PLACEHOLDER_ADDRESS, false);
  await tx.wait();
  console.log(`CollateralVault.setTrustedInbox(placeholder, false) tx: ${tx.hash}`);

  saveDeployment("sepolia", {
    attestorRegistry: attestorRegistryAddress,
    eoaValidator: eoaValidatorAddress,
    inbox: inboxAddress,
    writeAbilityChainKey: localChainKey,
  });

  console.log("\n=== Sepolia write-ability deployment summary ===");
  console.log(`AttestorRegistry: ${attestorRegistryAddress}`);
  console.log(`EOAValidator:     ${eoaValidatorAddress}`);
  console.log(`Inbox:            ${inboxAddress}`);
  console.log(`localChainKey:    ${localChainKey}`);
  console.log(
    "\nWrite-ability layer fully wired: SpaceFinance.repay() on CC3 will now auto-publish, and " +
      "(once relayed — see scripts/relayer/relay-repayment.ts) CollateralVault will auto-authorize " +
      "the withdrawal with no admin step."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
