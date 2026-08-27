import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";
import { installMockVerifier } from "./helpers/precompile";
import { encodeDepositedTx, encodeNodeRegisteredTx, fakeMerkleRoot } from "./helpers/uscEvents";
import { computeInboxMessageHash, decodeEmitterFromTopic, signAsMockAttestors } from "../scripts/utils/mockAttestor";

/**
 * Full round trip of the USC write-ability layer, entirely on one local Hardhat network:
 *
 *   CollateralVault.deposit() [Sepolia]
 *     -> SpaceFinance proves CollateralDeposited + NodeRegistered, disburses [CC3]
 *     -> SpaceFinance.repay() fully repays -> Outbox.publishMessage [CC3]
 *     -> (mock attestors sign; this test plays the relayer) -> Inbox.deliverMessage [Sepolia]
 *     -> CollateralVault._processMessage auto-authorizes -> withdraw() succeeds, no admin step.
 *
 * The Outbox/Inbox/EOAValidator/AttestorRegistry contracts are the real `@gluwa/usc-contracts`
 * write-ability contracts (aliased as `usc-write-ability`) — only the attestor *identity* is
 * mocked (three freshly generated wallets standing in for a real attestor network), exactly as
 * deploy-sepolia-writeability.ts configures for a testnet deployment.
 */

const ETH_USD_PRICE_8DEC = 3_000n * 10n ** 8n;
const CC3_READ_CHAIN_KEY = 1; // USC read-path chain key (SpaceFinance.execute's `chainKey` arg)
const BLOCK_HEIGHT = 1_000;
const NODE_ID = ethers.keccak256(ethers.toUtf8Bytes("spacefi-write-ability-node"));

// bytes32/uint256 identifiers for the write-ability layer's own chain-key scheme — arbitrary but
// must be internally consistent between Inbox's constructor args and the message hash computed
// below, same as deploy-{cc3,sepolia}-writeability.ts.
const CC3_CREDITCOIN_CHAIN_ID = 102_031n;
const SEPOLIA_LOCAL_CHAIN_KEY = ethers.zeroPadValue(ethers.toBeHex(11_155_111n), 32);

const PLACEHOLDER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

describe("USC write-ability layer (CC3 -> Sepolia auto-release)", function () {
  let deployer: Signer;
  let borrower: Signer;
  let treasury: Signer;
  let deployerAddress: string;
  let borrowerAddress: string;
  let treasuryAddress: string;

  let priceFeed: any;
  let collateralVault: any;
  let payoutToken: any;
  let spaceFinance: any;
  let outbox: any;
  let inbox: any;

  // Three freshly generated wallets standing in for a real USC attestor network (see module
  // docstring). Only their private keys (for off-chain signing) and addresses (seeded into the
  // Sepolia AttestorRegistry) are used — they never need ETH, since they never send transactions.
  let mockAttestors: ReturnType<typeof ethers.Wallet.createRandom>[];

  let rootCounter = 0;
  function nextRoot(): string {
    rootCounter += 1;
    return fakeMerkleRoot(`write-ability-root-${rootCounter}`);
  }

  /** Plays the off-chain relayer: reads the MessagePublished log from a repay() tx's receipt,
   * has the mock attestors sign it, and delivers it to the Sepolia Inbox. */
  async function relayFromReceipt(receipt: any): Promise<{ messageId: string; emitterAddress: string }> {
    const outboxAddress = await outbox.getAddress();
    const publishedLog = receipt.logs.find((log: any) => log.address === outboxAddress);
    expect(publishedLog, "MessagePublished log not found in repay() receipt").to.exist;

    const parsed = outbox.interface.parseLog({ topics: [...publishedLog!.topics], data: publishedLog!.data });
    const messageId = parsed!.args.messageId as string;
    const emitterAddress = decodeEmitterFromTopic(publishedLog!.topics[2]);
    const payload = parsed!.args.payload as string;

    const messageHash = computeInboxMessageHash({
      messageId,
      emitterAddress,
      localChainKey: SEPOLIA_LOCAL_CHAIN_KEY,
      creditcoinChainId: CC3_CREDITCOIN_CHAIN_ID,
      payload,
    });
    const votes = signAsMockAttestors(
      messageHash,
      mockAttestors.map((w) => w.privateKey)
    );

    const tx = await inbox.deliverMessage(messageId, emitterAddress, payload, votes);
    await tx.wait();

    return { messageId, emitterAddress };
  }

  before(async function () {
    await installMockVerifier();
  });

  beforeEach(async function () {
    [deployer, borrower, treasury] = await ethers.getSigners();
    deployerAddress = await deployer.getAddress();
    borrowerAddress = await borrower.getAddress();
    treasuryAddress = await treasury.getAddress();

    mockAttestors = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];

    // ── Sepolia-side base contracts ──────────────────────────────────────────
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    priceFeed = await MockV3Aggregator.deploy(ETH_USD_PRICE_8DEC);
    await priceFeed.waitForDeployment();

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    collateralVault = await CollateralVault.deploy(PLACEHOLDER_ADDRESS, deployerAddress, await priceFeed.getAddress());
    await collateralVault.waitForDeployment();

    // ── CC3-side base contracts ──────────────────────────────────────────────
    const MockPayoutToken = await ethers.getContractFactory("MockPayoutToken");
    payoutToken = await MockPayoutToken.deploy();
    await payoutToken.waitForDeployment();

    const EvmV1Decoder = await ethers.getContractFactory(
      "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
    );
    const decoderLib = await EvmV1Decoder.deploy();
    await decoderLib.waitForDeployment();

    const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
      libraries: { "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": await decoderLib.getAddress() },
    });
    spaceFinance = await SpaceFinance.deploy(deployerAddress, await payoutToken.getAddress(), treasuryAddress);
    await spaceFinance.waitForDeployment();

    const collateralVaultAddress = await collateralVault.getAddress();
    // NodeRegistry isn't exercised by this suite — reuse the vault address as an inert placeholder
    // so registerSourceContract's zero-address guard is satisfied.
    await spaceFinance.connect(deployer).registerSourceContract(collateralVaultAddress, collateralVaultAddress);

    await payoutToken.mint(treasuryAddress, ethers.parseEther("1000000"));
    await payoutToken.connect(treasury).approve(await spaceFinance.getAddress(), ethers.parseEther("1000000"));

    // ── CC3 write-ability stack ───────────────────────────────────────────────
    const MockCoreFeeProvider = await ethers.getContractFactory("MockCoreFeeProvider");
    const feeProvider = await MockCoreFeeProvider.deploy();
    await feeProvider.waitForDeployment();

    const FeeRegistry = await ethers.getContractFactory("usc-write-ability/contracts/write-ability/FeeRegistry.sol:FeeRegistry");
    const feeRegistry = await FeeRegistry.deploy(await feeProvider.getAddress());
    await feeRegistry.waitForDeployment();

    const MockAttestToken = await ethers.getContractFactory("MockAttestToken");
    const attestToken = await MockAttestToken.deploy();
    await attestToken.waitForDeployment();

    const AttestorRegistryFactory = await ethers.getContractFactory(
      "usc-write-ability/contracts/write-ability/AttestorRegistry.sol:AttestorRegistry"
    );
    const cc3AttestorRegistry = await AttestorRegistryFactory.deploy(deployerAddress, []);
    await cc3AttestorRegistry.waitForDeployment();

    const AttestorVaultFactory = await ethers.getContractFactory(
      "usc-write-ability/contracts/write-ability/AttestorVault.sol:AttestorVault"
    );
    const attestorVault = await AttestorVaultFactory.deploy(
      deployerAddress,
      await attestToken.getAddress(),
      PLACEHOLDER_ADDRESS,
      PLACEHOLDER_ADDRESS,
      PLACEHOLDER_ADDRESS,
      await cc3AttestorRegistry.getAddress(),
      deployerAddress,
      0
    );
    await attestorVault.waitForDeployment();

    const OutboxFactory = await ethers.getContractFactory("usc-write-ability/contracts/write-ability/Outbox.sol:Outbox");
    outbox = await OutboxFactory.deploy(
      CC3_READ_CHAIN_KEY,
      deployerAddress,
      deployerAddress,
      0,
      await attestorVault.getAddress(),
      await feeRegistry.getAddress(),
      await attestToken.getAddress()
    );
    await outbox.waitForDeployment();

    await spaceFinance.connect(deployer).registerOutbox(await outbox.getAddress());

    // ── Sepolia write-ability stack ───────────────────────────────────────────
    const sepoliaAttestorRegistry = await AttestorRegistryFactory.deploy(
      deployerAddress,
      mockAttestors.map((w) => w.address)
    );
    await sepoliaAttestorRegistry.waitForDeployment();

    const EOAValidatorFactory = await ethers.getContractFactory(
      "usc-write-ability/contracts/write-ability/EOAValidator.sol:EOAValidator"
    );
    const eoaValidator = await EOAValidatorFactory.deploy(deployerAddress, await sepoliaAttestorRegistry.getAddress(), 3, 30, 0);
    await eoaValidator.waitForDeployment();

    const InboxFactory = await ethers.getContractFactory("usc-write-ability/contracts/write-ability/Inbox.sol:Inbox");
    inbox = await InboxFactory.deploy(
      SEPOLIA_LOCAL_CHAIN_KEY,
      CC3_CREDITCOIN_CHAIN_ID,
      await eoaValidator.getAddress(),
      collateralVaultAddress,
      deployerAddress
    );
    await inbox.waitForDeployment();

    await collateralVault.connect(deployer).setTrustedInbox(await inbox.getAddress(), true);
    await collateralVault.connect(deployer).setTrustedEmitter(await spaceFinance.getAddress(), CC3_CREDITCOIN_CHAIN_ID);
  });

  /** Deposits real ETH, then proves the matching CollateralDeposited + NodeRegistered events into
   * SpaceFinance, leaving loan #1 Active and disbursed — the state repay() needs. */
  async function setUpActiveLoan(): Promise<{ depositAmount: bigint; usdValue: bigint; loanAmount: bigint }> {
    const depositAmount = ethers.parseEther("1");
    const usdValue = (depositAmount * ETH_USD_PRICE_8DEC) / 10n ** 8n; // $3000
    const loanAmount = (usdValue * 70n) / 100n;

    const depositTx = await collateralVault.connect(borrower).deposit({ value: depositAmount });
    await depositTx.wait();

    const collateralVaultAddress = await collateralVault.getAddress();
    const depositedTx = encodeDepositedTx({
      vaultAddress: collateralVaultAddress,
      borrower: borrowerAddress,
      loanId: 1n,
      amount: depositAmount,
      usdValue,
    });
    await spaceFinance.execute(0, CC3_READ_CHAIN_KEY, BLOCK_HEIGHT, depositedTx, nextRoot(), [], ethers.ZeroHash, []);

    const nodeRegisteredTx = encodeNodeRegisteredTx({
      registryAddress: collateralVaultAddress,
      operator: borrowerAddress,
      nodeId: NODE_ID,
    });
    await spaceFinance.execute(1, CC3_READ_CHAIN_KEY, BLOCK_HEIGHT, nodeRegisteredTx, nextRoot(), [], ethers.ZeroHash, []);

    await payoutToken.connect(treasury).transfer(borrowerAddress, ethers.parseEther("500"));
    await payoutToken.connect(borrower).approve(await spaceFinance.getAddress(), ethers.parseEther("1000000"));

    return { depositAmount, usdValue, loanAmount };
  }

  it("auto-authorizes the Sepolia withdrawal after CC3 repay, with no admin step", async function () {
    const { depositAmount, loanAmount } = await setUpActiveLoan();

    expect(await collateralVault.withdrawalAuthorized(1n)).to.equal(false);

    const repayTx = await spaceFinance.connect(borrower).repay(1n, loanAmount);
    const repayReceipt = await repayTx.wait();

    await expect(repayTx).to.emit(spaceFinance, "RepaymentPublished");

    const { messageId } = await relayFromReceipt(repayReceipt);

    expect(await collateralVault.withdrawalAuthorized(1n)).to.equal(true);
    expect(await inbox.processedAt(messageId)).to.not.equal(0n);

    const balanceBefore = await ethers.provider.getBalance(borrowerAddress);
    const withdrawTx = await collateralVault.connect(borrower).withdraw(1n);
    const withdrawReceipt = await withdrawTx.wait();
    const gasCost = (withdrawReceipt.gasUsed as bigint) * (withdrawReceipt.gasPrice as bigint);
    const balanceAfter = await ethers.provider.getBalance(borrowerAddress);

    expect(balanceAfter).to.equal(balanceBefore + depositAmount - gasCost);
  });

  it("emits AutoWithdrawalAuthorized with the delivered messageId", async function () {
    const { loanAmount } = await setUpActiveLoan();
    const repayReceipt = await (await spaceFinance.connect(borrower).repay(1n, loanAmount)).wait();

    const outboxAddress = await outbox.getAddress();
    const publishedLog = repayReceipt.logs.find((log: any) => log.address === outboxAddress);
    const parsed = outbox.interface.parseLog({ topics: [...publishedLog!.topics], data: publishedLog!.data });
    const expectedMessageId = parsed!.args.messageId as string;

    const messageHash = computeInboxMessageHash({
      messageId: expectedMessageId,
      emitterAddress: decodeEmitterFromTopic(publishedLog!.topics[2]),
      localChainKey: SEPOLIA_LOCAL_CHAIN_KEY,
      creditcoinChainId: CC3_CREDITCOIN_CHAIN_ID,
      payload: parsed!.args.payload as string,
    });
    const votes = signAsMockAttestors(
      messageHash,
      mockAttestors.map((w) => w.privateKey)
    );

    await expect(inbox.deliverMessage(expectedMessageId, decodeEmitterFromTopic(publishedLog!.topics[2]), parsed!.args.payload, votes))
      .to.emit(collateralVault, "AutoWithdrawalAuthorized")
      .withArgs(1n, expectedMessageId);
  });

  it("rejects delivery with fewer than the required 3 attestor signatures", async function () {
    const { loanAmount } = await setUpActiveLoan();
    const repayReceipt = await (await spaceFinance.connect(borrower).repay(1n, loanAmount)).wait();

    const outboxAddress = await outbox.getAddress();
    const publishedLog = repayReceipt.logs.find((log: any) => log.address === outboxAddress);
    const parsed = outbox.interface.parseLog({ topics: [...publishedLog!.topics], data: publishedLog!.data });
    const messageId = parsed!.args.messageId as string;
    const emitterAddress = decodeEmitterFromTopic(publishedLog!.topics[2]);
    const payload = parsed!.args.payload as string;

    const messageHash = computeInboxMessageHash({
      messageId,
      emitterAddress,
      localChainKey: SEPOLIA_LOCAL_CHAIN_KEY,
      creditcoinChainId: CC3_CREDITCOIN_CHAIN_ID,
      payload,
    });
    // Only 2 of the 3 required mock attestors sign.
    const votes = signAsMockAttestors(messageHash, mockAttestors.slice(0, 2).map((w) => w.privateKey));

    await expect(inbox.deliverMessage(messageId, emitterAddress, payload, votes)).to.be.reverted;
    expect(await collateralVault.withdrawalAuthorized(1n)).to.equal(false);
  });

  it("stores an unroutable message as pending rather than reverting the whole delivery, when the borrower in the payload doesn't match", async function () {
    const { loanAmount } = await setUpActiveLoan();
    const repayReceipt = await (await spaceFinance.connect(borrower).repay(1n, loanAmount)).wait();

    const outboxAddress = await outbox.getAddress();
    const publishedLog = repayReceipt.logs.find((log: any) => log.address === outboxAddress);
    const parsed = outbox.interface.parseLog({ topics: [...publishedLog!.topics], data: publishedLog!.data });
    const messageId = parsed!.args.messageId as string;
    const emitterAddress = decodeEmitterFromTopic(publishedLog!.topics[2]);

    // Tamper with the payload's borrower field after the fact — CollateralVault._processMessage
    // must reject this (BorrowerMismatch), which Inbox turns into a stored-pending message rather
    // than a reverted deliverMessage call.
    const tamperedPayload = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address"], [1n, deployerAddress]);
    const messageHash = computeInboxMessageHash({
      messageId,
      emitterAddress,
      localChainKey: SEPOLIA_LOCAL_CHAIN_KEY,
      creditcoinChainId: CC3_CREDITCOIN_CHAIN_ID,
      payload: tamperedPayload,
    });
    const votes = signAsMockAttestors(
      messageHash,
      mockAttestors.map((w) => w.privateKey)
    );

    await expect(inbox.deliverMessage(messageId, emitterAddress, tamperedPayload, votes)).to.emit(inbox, "MessagePending");

    expect(await collateralVault.withdrawalAuthorized(1n)).to.equal(false);
    expect(await inbox.isPending(messageId)).to.equal(true);
  });

  it("does nothing when SpaceFinance has no outbox registered (backward compatible with the manual admin path)", async function () {
    // A fresh SpaceFinance instance that never called registerOutbox.
    const EvmV1Decoder = await ethers.getContractFactory(
      "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
    );
    const decoderLib = await EvmV1Decoder.deploy();
    await decoderLib.waitForDeployment();
    const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
      libraries: { "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": await decoderLib.getAddress() },
    });
    const unwired = await SpaceFinance.deploy(deployerAddress, await payoutToken.getAddress(), treasuryAddress);
    await unwired.waitForDeployment();
    expect(await unwired.outbox()).to.equal(ethers.ZeroAddress);
  });
});
