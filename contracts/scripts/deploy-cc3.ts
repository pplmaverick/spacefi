import { ethers, network } from "hardhat";
import { loadDeployment, saveDeployment } from "./utils/deployment";

// Used only when deployment.json has no Sepolia addresses yet (e.g. this script is run before
// deploy-sepolia.ts). Deliberately a well-known "dead" address: SpaceFinance's emitter allow-list
// check (`log.address_ == collateralVault`) can then never match a real event by accident until
// registerSourceContract() is called again with the real addresses.
const PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * Deploys the CC3-side contracts: MockPayoutToken + SpaceFinance, then wires up
 * registerSourceContract() with whatever Sepolia addresses are on record.
 * Usage: npx hardhat run scripts/deploy-cc3.ts --network cc3_testnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const treasury = process.env.TREASURY_ADDRESS ?? deployer.address;
  if (!process.env.TREASURY_ADDRESS) {
    console.log(`No TREASURY_ADDRESS set in .env — using deployer as treasury: ${treasury}`);
  }

  const MockPayoutToken = await ethers.getContractFactory("MockPayoutToken");
  const token = await MockPayoutToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`\nMockPayoutToken deployed to: ${tokenAddress}`);

  // EvmV1Decoder's functions are all `public`, so Solidity treats it as an external library —
  // same as the loan-flow tutorial (usc-testnet-bridge-examples), it must be deployed on its own
  // and linked into SpaceFinance's bytecode, it can't just be imported and inlined.
  const EvmV1Decoder = await ethers.getContractFactory(
    "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
  );
  const decoderLib = await EvmV1Decoder.deploy();
  await decoderLib.waitForDeployment();
  const decoderLibAddress = await decoderLib.getAddress();
  console.log(`EvmV1Decoder library deployed to: ${decoderLibAddress}`);

  const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
    libraries: {
      "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": decoderLibAddress,
    },
  });
  const spaceFinance = await SpaceFinance.deploy(deployer.address, tokenAddress, treasury);
  await spaceFinance.waitForDeployment();
  const spaceFinanceAddress = await spaceFinance.getAddress();
  console.log(`SpaceFinance deployed to:    ${spaceFinanceAddress}`);

  // Pick up real Sepolia addresses from deployment.json if deploy-sepolia.ts has already run;
  // otherwise fall back to the placeholder (safe no-op until updated).
  const existing = loadDeployment();
  const sepoliaVault = existing.sepolia?.collateralVault ?? PLACEHOLDER_ADDRESS;
  const sepoliaRegistry = existing.sepolia?.nodeRegistry ?? PLACEHOLDER_ADDRESS;
  const usingPlaceholder = sepoliaVault === PLACEHOLDER_ADDRESS || sepoliaRegistry === PLACEHOLDER_ADDRESS;

  if (usingPlaceholder) {
    console.log(
      "\n⚠️  No Sepolia addresses found in deployment.json — registering PLACEHOLDER address(es)."
    );
    console.log(
      "   Run deploy-sepolia.ts, then call spaceFinance.registerSourceContract(vault, registry) again with the real addresses."
    );
  } else {
    console.log("\nUsing Sepolia addresses from deployment.json:");
    console.log(`  CollateralVault: ${sepoliaVault}`);
    console.log(`  NodeRegistry:    ${sepoliaRegistry}`);
  }

  const tx = await spaceFinance.registerSourceContract(sepoliaVault, sepoliaRegistry);
  await tx.wait();
  console.log(`registerSourceContract() tx: ${tx.hash}`);

  saveDeployment("cc3", {
    chainId: Number(net.chainId),
    evmV1Decoder: decoderLibAddress,
    mockPayoutToken: tokenAddress,
    spaceFinance: spaceFinanceAddress,
    treasury,
    // Loan sizing is now computed on-chain per loan (70% of proved collateral usdValue) instead
    // of being a fixed deploy-time constant — clear the stale field from prior deployments.
    loanAmount: undefined,
  });

  console.log("\n=== CC3 deployment summary ===");
  console.log(`EvmV1Decoder:    ${decoderLibAddress}`);
  console.log(`MockPayoutToken: ${tokenAddress}`);
  console.log(`SpaceFinance:    ${spaceFinanceAddress}`);
  console.log(`Treasury:        ${treasury}`);
  console.log(`Loan sizing:     dynamic — 70% of proved collateral usdValue (SpaceFinance.LTV_PERCENT)`);

  console.log(
    "\nNote: treasury does not yet hold or approve any mUSDF. Before a loan can actually " +
      "disburse, mint mUSDF to the treasury address and approve SpaceFinance to spend it " +
      "(not part of this script — belongs in the e2e setup step)."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
