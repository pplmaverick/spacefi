import { ethers, network } from "hardhat";
import { loadDeployment, saveDeployment } from "./utils/deployment";

// Unused-but-required addresses for constructor slots this stub deployment never actually
// exercises (see contracts/cc3/writeability/MockCoreFeeProvider.sol for why coreFee is always 0,
// which makes AttestorVault.deposit/settle dead code on this path). Same placeholder convention
// deploy-cc3.ts already uses for not-yet-known cross-chain addresses.
const PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * Deploys the CC3-side USC write-ability contracts (Outbox + its required fee/attestor
 * scaffolding) and wires SpaceFinance.registerOutbox() to the result. Run after deploy-cc3.ts.
 * Usage: npx hardhat run scripts/deploy-cc3-writeability.ts --network cc3_testnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const existing = loadDeployment();
  const spaceFinanceAddress = existing.cc3?.spaceFinance;
  if (!spaceFinanceAddress) {
    throw new Error("deployment.json has no cc3.spaceFinance — run deploy-cc3.ts first");
  }

  // Same USC client-chain key that identifies Sepolia in the existing read-path (SpaceFinance's
  // `execute(action, chainKey, ...)` calls) — the write-ability Outbox is "per client chain" too,
  // so it reuses that identifier rather than inventing a second one for the same chain.
  const chainKey = Number(process.env.SOURCE_CHAIN_KEY ?? "1");

  const MockCoreFeeProvider = await ethers.getContractFactory("MockCoreFeeProvider");
  const feeProvider = await MockCoreFeeProvider.deploy();
  await feeProvider.waitForDeployment();
  const feeProviderAddress = await feeProvider.getAddress();
  console.log(`\nMockCoreFeeProvider deployed to: ${feeProviderAddress}`);

  const FeeRegistry = await ethers.getContractFactory(
    "usc-write-ability/contracts/write-ability/FeeRegistry.sol:FeeRegistry"
  );
  const feeRegistry = await FeeRegistry.deploy(feeProviderAddress);
  await feeRegistry.waitForDeployment();
  const feeRegistryAddress = await feeRegistry.getAddress();
  console.log(`FeeRegistry deployed to: ${feeRegistryAddress}`);

  const MockAttestToken = await ethers.getContractFactory("MockAttestToken");
  const attestToken = await MockAttestToken.deploy();
  await attestToken.waitForDeployment();
  const attestTokenAddress = await attestToken.getAddress();
  console.log(`MockAttestToken deployed to: ${attestTokenAddress}`);

  // Unused on this chain (coreFee is always 0, so AttestorVault.deposit/settle never run) — seeded
  // empty rather than with the mock attestor set, since it plays no role here. The real quorum
  // check lives in Sepolia's EOAValidator/AttestorRegistry (deploy-sepolia-writeability.ts).
  const AttestorRegistry = await ethers.getContractFactory(
    "usc-write-ability/contracts/write-ability/AttestorRegistry.sol:AttestorRegistry"
  );
  const attestorRegistry = await AttestorRegistry.deploy(deployer.address, []);
  await attestorRegistry.waitForDeployment();
  const attestorRegistryAddress = await attestorRegistry.getAddress();
  console.log(`AttestorRegistry (CC3, fee path only — unused) deployed to: ${attestorRegistryAddress}`);

  const AttestorVault = await ethers.getContractFactory(
    "usc-write-ability/contracts/write-ability/AttestorVault.sol:AttestorVault"
  );
  const attestorVault = await AttestorVault.deploy(
    deployer.address,
    attestTokenAddress,
    PLACEHOLDER_ADDRESS, // outbox_: circular with Outbox's own constructor; deposit()/settle() are
    // dead code at coreFee = 0, so this immutable is never actually read in that role.
    PLACEHOLDER_ADDRESS, // relayerContract_: no RelayerContract in this stub deployment.
    PLACEHOLDER_ADDRESS, // validationContract_: no AcknowledgmentValidator — this deployment never
    // requests message acknowledgment (SpaceFinance always publishes with canAck = false).
    attestorRegistryAddress,
    deployer.address, // burnAddress_: unused, no fee is ever burned at coreFee = 0.
    0 // initialBurnRate
  );
  await attestorVault.waitForDeployment();
  const attestorVaultAddress = await attestorVault.getAddress();
  console.log(`AttestorVault deployed to: ${attestorVaultAddress}`);

  const Outbox = await ethers.getContractFactory("usc-write-ability/contracts/write-ability/Outbox.sol:Outbox");
  const outbox = await Outbox.deploy(
    chainKey,
    deployer.address, // initialOwner
    deployer.address, // initialValidator: placeholder EOA — acknowledgeMessage is never called
    // since every publish here uses canAck = false (no AcknowledgmentValidator in this stub).
    0, // initialRateLimit: 0 == unlimited (RateLimitLib treats a zero policy as unbounded)
    attestorVaultAddress,
    feeRegistryAddress,
    attestTokenAddress
  );
  await outbox.waitForDeployment();
  const outboxAddress = await outbox.getAddress();
  console.log(`Outbox deployed to: ${outboxAddress}`);

  // Cast needed because getContractAt (attaching by address, no factory/libraries at hand) only
  // resolves to the generic ethers.Contract type here — this project has no typechain bindings.
  const spaceFinance = (await ethers.getContractAt("SpaceFinance", spaceFinanceAddress)) as any;
  const tx = await spaceFinance.connect(deployer).registerOutbox(outboxAddress);
  await tx.wait();
  console.log(`\nSpaceFinance.registerOutbox() tx: ${tx.hash}`);

  saveDeployment("cc3", {
    mockCoreFeeProvider: feeProviderAddress,
    feeRegistry: feeRegistryAddress,
    mockAttestToken: attestTokenAddress,
    attestorRegistry: attestorRegistryAddress,
    attestorVault: attestorVaultAddress,
    outbox: outboxAddress,
    writeAbilityChainKey: chainKey,
  });

  console.log("\n=== CC3 write-ability deployment summary ===");
  console.log(`MockCoreFeeProvider: ${feeProviderAddress}`);
  console.log(`FeeRegistry:         ${feeRegistryAddress}`);
  console.log(`MockAttestToken:     ${attestTokenAddress}`);
  console.log(`AttestorVault:       ${attestorVaultAddress}`);
  console.log(`Outbox:              ${outboxAddress}`);
  console.log(`SpaceFinance.outbox: ${outboxAddress} (registered)`);
  console.log(
    "\nNext: run deploy-sepolia-writeability.ts (it needs deployment.json's cc3.spaceFinance and " +
      "cc3.chainId, both already on record)."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
