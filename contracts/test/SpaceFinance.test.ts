import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";
import { installMockVerifier } from "./helpers/precompile";
import { encodeDepositedTx, encodeNodeRegisteredTx, fakeMerkleRoot } from "./helpers/uscEvents";

const Actions = { CollateralDeposited: 0, NodeRegistered: 1 } as const;
const LoanStatus = { None: 0, CollateralVerified: 1, NodeVerified: 2, Active: 3, Repaid: 4, Withdrawn: 5 } as const;

const CHAIN_KEY = 1;
const BLOCK_HEIGHT = 1_000;
const NODE_ID = ethers.keccak256(ethers.toUtf8Bytes("spacefi-node-1"));

describe("SpaceFinance", function () {
  let owner: Signer;
  let borrower: Signer;
  let treasury: Signer;
  let fakeVault: Signer;
  let fakeRegistry: Signer;
  let ownerAddress: string;
  let borrowerAddress: string;
  let treasuryAddress: string;
  let vaultAddress: string;
  let registryAddress: string;

  let payoutToken: any;
  let spaceFinance: any;

  // execute() takes an opaque merkle root; the fake verifier derives txIndex from it, so distinct
  // roots keep the USCBase-level queryId dedup from colliding across independent test proofs.
  let rootCounter = 0;
  function nextRoot(): string {
    rootCounter += 1;
    return fakeMerkleRoot(`root-${rootCounter}`);
  }

  async function submitCollateralDeposited(opts: {
    loanId: bigint;
    borrower: string;
    amount: bigint;
    usdValue: bigint;
    root?: string;
  }) {
    const encodedTx = encodeDepositedTx({
      vaultAddress,
      borrower: opts.borrower,
      loanId: opts.loanId,
      amount: opts.amount,
      usdValue: opts.usdValue,
    });
    return spaceFinance.execute(
      Actions.CollateralDeposited,
      CHAIN_KEY,
      BLOCK_HEIGHT,
      encodedTx,
      opts.root ?? nextRoot(),
      [],
      ethers.ZeroHash,
      []
    );
  }

  async function submitNodeRegistered(opts: { operator: string; nodeId: string; root?: string }) {
    const encodedTx = encodeNodeRegisteredTx({
      registryAddress,
      operator: opts.operator,
      nodeId: opts.nodeId,
    });
    return spaceFinance.execute(
      Actions.NodeRegistered,
      CHAIN_KEY,
      BLOCK_HEIGHT,
      encodedTx,
      opts.root ?? nextRoot(),
      [],
      ethers.ZeroHash,
      []
    );
  }

  before(async function () {
    // Hardhat Network has no real precompile at the USC verifier address — install the mock once
    // for the whole suite instead of ever calling a real precompile.
    await installMockVerifier();
  });

  beforeEach(async function () {
    [owner, borrower, treasury, fakeVault, fakeRegistry] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    borrowerAddress = await borrower.getAddress();
    treasuryAddress = await treasury.getAddress();
    vaultAddress = await fakeVault.getAddress();
    registryAddress = await fakeRegistry.getAddress();

    const MockPayoutToken = await ethers.getContractFactory("MockPayoutToken");
    payoutToken = await MockPayoutToken.deploy();
    await payoutToken.waitForDeployment();

    const EvmV1Decoder = await ethers.getContractFactory(
      "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
    );
    const decoderLib = await EvmV1Decoder.deploy();
    await decoderLib.waitForDeployment();

    const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
      libraries: {
        "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": await decoderLib.getAddress(),
      },
    });
    spaceFinance = await SpaceFinance.deploy(ownerAddress, await payoutToken.getAddress(), treasuryAddress);
    await spaceFinance.waitForDeployment();

    await spaceFinance.connect(owner).registerSourceContract(vaultAddress, registryAddress);

    // Fund + approve the treasury generously by default; the one test that needs an underfunded
    // treasury overrides this locally.
    await payoutToken.mint(treasuryAddress, ethers.parseEther("1000000"));
    await payoutToken.connect(treasury).approve(await spaceFinance.getAddress(), ethers.parseEther("1000000"));
  });

  describe("deployment", function () {
    it("sets owner, payoutToken and treasury", async function () {
      expect(await spaceFinance.owner()).to.equal(ownerAddress);
      expect(await spaceFinance.payoutToken()).to.equal(await payoutToken.getAddress());
      expect(await spaceFinance.treasury()).to.equal(treasuryAddress);
    });

    it("reverts on deployment with a zero payoutToken or treasury address", async function () {
      const EvmV1Decoder = await ethers.getContractFactory(
        "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
      );
      const decoderLib = await EvmV1Decoder.deploy();
      await decoderLib.waitForDeployment();
      const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
        libraries: {
          "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": await decoderLib.getAddress(),
        },
      });
      await expect(
        SpaceFinance.deploy(ownerAddress, ethers.ZeroAddress, treasuryAddress)
      ).to.be.revertedWith("zero address");
    });
  });

  describe("registerSourceContract", function () {
    it("lets the owner register the trusted Sepolia source contracts", async function () {
      await expect(spaceFinance.connect(owner).registerSourceContract(vaultAddress, registryAddress))
        .to.emit(spaceFinance, "SourceContractsRegistered")
        .withArgs(vaultAddress, registryAddress);
      expect(await spaceFinance.collateralVault()).to.equal(vaultAddress);
      expect(await spaceFinance.nodeRegistry()).to.equal(registryAddress);
    });

    it("reverts when called by a non-owner", async function () {
      await expect(
        spaceFinance.connect(borrower).registerSourceContract(vaultAddress, registryAddress)
      ).to.be.revertedWithCustomError(spaceFinance, "OwnableUnauthorizedAccount");
    });

    it("reverts with a zero address", async function () {
      await expect(
        spaceFinance.connect(owner).registerSourceContract(ethers.ZeroAddress, registryAddress)
      ).to.be.revertedWith("zero address");
    });
  });

  describe("execute — configuration guard", function () {
    it("reverts with SourceContractsNotConfigured before registerSourceContract is called", async function () {
      const EvmV1Decoder = await ethers.getContractFactory(
        "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
      );
      const decoderLib = await EvmV1Decoder.deploy();
      await decoderLib.waitForDeployment();
      const SpaceFinance = await ethers.getContractFactory("SpaceFinance", {
        libraries: {
          "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder": await decoderLib.getAddress(),
        },
      });
      const unconfigured = await SpaceFinance.deploy(ownerAddress, await payoutToken.getAddress(), treasuryAddress);
      await unconfigured.waitForDeployment();

      const encodedTx = encodeDepositedTx({
        vaultAddress,
        borrower: borrowerAddress,
        loanId: 1n,
        amount: ethers.parseEther("1"),
        usdValue: ethers.parseEther("1000"),
      });

      await expect(
        unconfigured.execute(Actions.CollateralDeposited, CHAIN_KEY, BLOCK_HEIGHT, encodedTx, nextRoot(), [], ethers.ZeroHash, [])
      ).to.be.revertedWithCustomError(unconfigured, "SourceContractsNotConfigured");
    });
  });

  describe("borrow flow — CollateralDeposited", function () {
    it("advances a loan to CollateralVerified and emits CollateralVerified", async function () {
      const amount = ethers.parseEther("1");
      const usdValue = ethers.parseEther("1000");

      await expect(submitCollateralDeposited({ loanId: 1n, borrower: borrowerAddress, amount, usdValue }))
        .to.emit(spaceFinance, "CollateralVerified")
        .withArgs(1n, borrowerAddress, amount);

      const loan = await spaceFinance.getLoan(1n);
      expect(loan.borrower).to.equal(borrowerAddress);
      expect(loan.collateralAmount).to.equal(amount);
      expect(loan.usdValue).to.equal(usdValue);
      expect(loan.status).to.equal(LoanStatus.CollateralVerified);
    });

    it("reverts when the Deposited log was not emitted by the registered CollateralVault", async function () {
      const encodedTx = encodeDepositedTx({
        vaultAddress: borrowerAddress, // wrong emitter
        borrower: borrowerAddress,
        loanId: 1n,
        amount: ethers.parseEther("1"),
        usdValue: ethers.parseEther("1000"),
      });
      await expect(
        spaceFinance.execute(Actions.CollateralDeposited, CHAIN_KEY, BLOCK_HEIGHT, encodedTx, nextRoot(), [], ethers.ZeroHash, [])
      ).to.be.revertedWith("Deposited not emitted by registered CollateralVault");
    });

    it("reverts when replaying the identical proof a second time (query dedup)", async function () {
      const root = nextRoot();
      const params = { loanId: 1n, borrower: borrowerAddress, amount: ethers.parseEther("1"), usdValue: ethers.parseEther("1000"), root };
      await submitCollateralDeposited(params);
      await expect(submitCollateralDeposited(params)).to.be.revertedWith("Query already processed");
    });
  });

  describe("borrow flow — NodeRegistered + disbursement", function () {
    it("reverts with NoLoanForOperator when there is no CollateralVerified loan for the operator", async function () {
      await expect(submitNodeRegistered({ operator: borrowerAddress, nodeId: NODE_ID }))
        .to.be.revertedWithCustomError(spaceFinance, "NoLoanForOperator")
        .withArgs(borrowerAddress);
    });

    it("reverts when the NodeRegistered log was not emitted by the registered NodeRegistry", async function () {
      const encodedTx = encodeNodeRegisteredTx({
        registryAddress: borrowerAddress, // wrong emitter
        operator: borrowerAddress,
        nodeId: NODE_ID,
      });
      await expect(
        spaceFinance.execute(Actions.NodeRegistered, CHAIN_KEY, BLOCK_HEIGHT, encodedTx, nextRoot(), [], ethers.ZeroHash, [])
      ).to.be.revertedWith("NodeRegistered not emitted by registered NodeRegistry");
    });

    it("advances the loan to Active and disburses 70% LTV of the proved usdValue", async function () {
      const amount = ethers.parseEther("1");
      const usdValue = ethers.parseEther("1000");
      const expectedLoanAmount = (usdValue * 70n) / 100n;

      await submitCollateralDeposited({ loanId: 1n, borrower: borrowerAddress, amount, usdValue });

      await expect(submitNodeRegistered({ operator: borrowerAddress, nodeId: NODE_ID }))
        .to.emit(spaceFinance, "LoanDisbursed")
        .withArgs(1n, borrowerAddress, expectedLoanAmount);

      const loan = await spaceFinance.getLoan(1n);
      expect(loan.status).to.equal(LoanStatus.Active);
      expect(loan.loanAmount).to.equal(expectedLoanAmount);
      expect(loan.nodeId).to.equal(NODE_ID);
      expect(await payoutToken.balanceOf(borrowerAddress)).to.equal(expectedLoanAmount);
    });

    it("reverts the disbursement when the treasury has not approved enough payout token (LTV amount unfunded)", async function () {
      const amount = ethers.parseEther("1");
      const usdValue = ethers.parseEther("1000"); // implies a 700 token loan amount

      // Undo the generous default approval from beforeEach and leave the treasury under-approved.
      await payoutToken.connect(treasury).approve(await spaceFinance.getAddress(), ethers.parseEther("1"));

      await submitCollateralDeposited({ loanId: 1n, borrower: borrowerAddress, amount, usdValue });

      await expect(
        submitNodeRegistered({ operator: borrowerAddress, nodeId: NODE_ID })
      ).to.be.revertedWithCustomError(payoutToken, "ERC20InsufficientAllowance");
    });
  });

  describe("multi-loan tracking", function () {
    it("tracks multiple loanIds for the same borrower via getLoansByBorrower", async function () {
      await submitCollateralDeposited({
        loanId: 101n,
        borrower: borrowerAddress,
        amount: ethers.parseEther("1"),
        usdValue: ethers.parseEther("1000"),
      });
      await submitCollateralDeposited({
        loanId: 102n,
        borrower: borrowerAddress,
        amount: ethers.parseEther("2"),
        usdValue: ethers.parseEther("2000"),
      });

      const loanIds = await spaceFinance.getLoansByBorrower(borrowerAddress);
      expect(loanIds).to.deep.equal([101n, 102n]);
    });
  });

  describe("repay", function () {
    const amount = ethers.parseEther("1");
    const usdValue = ethers.parseEther("1000");
    const loanAmount = (usdValue * 70n) / 100n;

    beforeEach(async function () {
      await submitCollateralDeposited({ loanId: 1n, borrower: borrowerAddress, amount, usdValue });
      await submitNodeRegistered({ operator: borrowerAddress, nodeId: NODE_ID });
      // Borrower needs payout tokens to repay with, plus an approval back to SpaceFinance.
      await payoutToken.connect(treasury).transfer(borrowerAddress, ethers.parseEther("500"));
      await payoutToken.connect(borrower).approve(await spaceFinance.getAddress(), ethers.parseEther("1000000"));
    });

    it("accepts a partial repayment and emits PartialRepayment", async function () {
      const partial = ethers.parseEther("100");
      await expect(spaceFinance.connect(borrower).repay(1n, partial))
        .to.emit(spaceFinance, "PartialRepayment")
        .withArgs(1n, borrowerAddress, partial, partial);

      const loan = await spaceFinance.getLoan(1n);
      expect(loan.status).to.equal(LoanStatus.Active);
      expect(loan.repaidAmount).to.equal(partial);
    });

    it("marks the loan Repaid and emits LoanRepaid once cumulative repayment reaches the loan amount", async function () {
      await expect(spaceFinance.connect(borrower).repay(1n, loanAmount))
        .to.emit(spaceFinance, "LoanRepaid")
        .withArgs(1n, borrowerAddress);

      const loan = await spaceFinance.getLoan(1n);
      expect(loan.status).to.equal(LoanStatus.Repaid);
    });

    it("reverts on any further repay() call once the loan is already fully repaid", async function () {
      await spaceFinance.connect(borrower).repay(1n, loanAmount);
      await expect(spaceFinance.connect(borrower).repay(1n, 1n)).to.be.revertedWith("loan not active");
    });

    it("reverts when called by someone other than the borrower", async function () {
      await expect(spaceFinance.connect(owner).repay(1n, 1n)).to.be.revertedWith("not borrower");
    });

    it("reverts for a loan that was never disbursed (status None)", async function () {
      await expect(spaceFinance.connect(borrower).repay(999n, 1n)).to.be.revertedWith("loan not active");
    });
  });

  describe("markRepaid", function () {
    beforeEach(async function () {
      await submitCollateralDeposited({
        loanId: 1n,
        borrower: borrowerAddress,
        amount: ethers.parseEther("1"),
        usdValue: ethers.parseEther("1000"),
      });
      await submitNodeRegistered({ operator: borrowerAddress, nodeId: NODE_ID });
    });

    it("lets the owner mark an Active loan as Repaid", async function () {
      await expect(spaceFinance.connect(owner).markRepaid(1n)).to.emit(spaceFinance, "LoanMarkedRepaid").withArgs(1n);
      const loan = await spaceFinance.getLoan(1n);
      expect(loan.status).to.equal(LoanStatus.Repaid);
    });

    it("reverts when called by a non-owner", async function () {
      await expect(spaceFinance.connect(borrower).markRepaid(1n)).to.be.revertedWithCustomError(
        spaceFinance,
        "OwnableUnauthorizedAccount"
      );
    });

    it("reverts for a loan that is not Active", async function () {
      await spaceFinance.connect(owner).markRepaid(1n);
      await expect(spaceFinance.connect(owner).markRepaid(1n)).to.be.revertedWith("loan not active");
    });
  });
});
