import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const ETH_USD_PRICE_8DEC = 3_000n * 10n ** 8n; // $3000.00000000, Chainlink-style 8 decimals

describe("CollateralVault", function () {
  let owner: Signer;
  let borrower: Signer;
  let other: Signer;
  let ownerAddress: string;
  let borrowerAddress: string;

  let vault: any;
  let priceFeed: any;

  beforeEach(async function () {
    [owner, borrower, other] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    borrowerAddress = await borrower.getAddress();

    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    priceFeed = await MockV3Aggregator.deploy(ETH_USD_PRICE_8DEC);
    await priceFeed.waitForDeployment();

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    vault = await CollateralVault.deploy(ownerAddress, await priceFeed.getAddress());
    await vault.waitForDeployment();
  });

  describe("deployment", function () {
    it("sets the owner and price feed", async function () {
      expect(await vault.owner()).to.equal(ownerAddress);
      expect(await vault.priceFeed()).to.equal(await priceFeed.getAddress());
    });

    it("starts with nextLoanId at 1", async function () {
      expect(await vault.nextLoanId()).to.equal(1n);
    });
  });

  describe("deposit", function () {
    it("accepts a normal ETH deposit and records it", async function () {
      const depositAmount = ethers.parseEther("1");
      const tx = await vault.connect(borrower).deposit({ value: depositAmount });
      await tx.wait();

      const deposit = await vault.getDeposit(1n);
      expect(deposit.borrower).to.equal(borrowerAddress);
      expect(deposit.amount).to.equal(depositAmount);
      expect(deposit.withdrawn).to.equal(false);
    });

    it("increments nextLoanId after each deposit", async function () {
      await vault.connect(borrower).deposit({ value: ethers.parseEther("1") });
      expect(await vault.nextLoanId()).to.equal(2n);
      await vault.connect(borrower).deposit({ value: ethers.parseEther("1") });
      expect(await vault.nextLoanId()).to.equal(3n);
    });

    it("assigns separate loanIds to multiple deposits from the same address", async function () {
      await vault.connect(borrower).deposit({ value: ethers.parseEther("1") });
      await vault.connect(borrower).deposit({ value: ethers.parseEther("2") });

      const first = await vault.getDeposit(1n);
      const second = await vault.getDeposit(2n);
      expect(first.amount).to.equal(ethers.parseEther("1"));
      expect(second.amount).to.equal(ethers.parseEther("2"));
    });

    it("emits Deposited with the correct arguments", async function () {
      const depositAmount = ethers.parseEther("1");
      const expectedUsdValue = (depositAmount * ETH_USD_PRICE_8DEC) / 10n ** 8n;

      await expect(vault.connect(borrower).deposit({ value: depositAmount }))
        .to.emit(vault, "Deposited")
        .withArgs(borrowerAddress, 1n, depositAmount, expectedUsdValue);
    });

    it("reverts with ZeroAmount when depositing 0 ETH", async function () {
      await expect(vault.connect(borrower).deposit({ value: 0n })).to.be.revertedWithCustomError(
        vault,
        "ZeroAmount"
      );
    });

    it("computes usdValue correctly from the Chainlink price feed (LTV input)", async function () {
      const depositAmount = ethers.parseEther("2"); // 2 ETH @ $3000 = $6000
      await vault.connect(borrower).deposit({ value: depositAmount });

      // usdValue = amount(wei) * price(8dp) / 1e8 -> $6000 expressed in 1e18-scaled units.
      const usdValue = await vault.getUsdValue(1n);
      expect(usdValue).to.equal(6_000n * 10n ** 18n);
    });

    it("reflects an updated price feed answer in later deposits", async function () {
      await priceFeed.updateAnswer(4_500n * 10n ** 8n); // ETH now $4500
      const depositAmount = ethers.parseEther("2");
      await vault.connect(borrower).deposit({ value: depositAmount });

      const usdValue = await vault.getUsdValue(1n);
      expect(usdValue).to.equal(9_000n * 10n ** 18n);
    });
  });

  describe("authorizeWithdrawal", function () {
    beforeEach(async function () {
      await vault.connect(borrower).deposit({ value: ethers.parseEther("1") });
    });

    it("reverts when called by a non-owner", async function () {
      await expect(vault.connect(other).authorizeWithdrawal(1n)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      );
    });

    it("allows the owner to authorize a withdrawal", async function () {
      await expect(vault.connect(owner).authorizeWithdrawal(1n))
        .to.emit(vault, "WithdrawalAuthorized")
        .withArgs(1n);
      expect(await vault.withdrawalAuthorized(1n)).to.equal(true);
    });

    it("reverts with LoanNotFound for a nonexistent loanId", async function () {
      await expect(vault.connect(owner).authorizeWithdrawal(999n)).to.be.revertedWithCustomError(
        vault,
        "LoanNotFound"
      );
    });
  });

  describe("withdraw", function () {
    const depositAmount = ethers.parseEther("1");

    beforeEach(async function () {
      await vault.connect(borrower).deposit({ value: depositAmount });
    });

    it("reverts with WithdrawalNotAuthorized before authorization", async function () {
      await expect(vault.connect(borrower).withdraw(1n)).to.be.revertedWithCustomError(
        vault,
        "WithdrawalNotAuthorized"
      );
    });

    it("reverts with NotBorrower when called by someone other than the depositor", async function () {
      await vault.connect(owner).authorizeWithdrawal(1n);
      await expect(vault.connect(other).withdraw(1n)).to.be.revertedWithCustomError(vault, "NotBorrower");
    });

    it("reverts with LoanNotFound for a nonexistent loanId", async function () {
      await expect(vault.connect(borrower).withdraw(999n)).to.be.revertedWithCustomError(
        vault,
        "LoanNotFound"
      );
    });

    it("lets the borrower withdraw after authorization and returns the ETH", async function () {
      await vault.connect(owner).authorizeWithdrawal(1n);

      const balanceBefore = await ethers.provider.getBalance(borrowerAddress);
      const tx = await vault.connect(borrower).withdraw(1n);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(borrowerAddress);

      expect(balanceAfter).to.equal(balanceBefore + depositAmount - gasCost);

      const deposit = await vault.getDeposit(1n);
      expect(deposit.withdrawn).to.equal(true);
    });

    it("emits Withdrawn on a successful withdrawal", async function () {
      await vault.connect(owner).authorizeWithdrawal(1n);
      await expect(vault.connect(borrower).withdraw(1n))
        .to.emit(vault, "Withdrawn")
        .withArgs(borrowerAddress, depositAmount, 1n);
    });

    it("reverts with AlreadyWithdrawn on a repeated withdrawal", async function () {
      await vault.connect(owner).authorizeWithdrawal(1n);
      await vault.connect(borrower).withdraw(1n);

      await expect(vault.connect(borrower).withdraw(1n)).to.be.revertedWithCustomError(
        vault,
        "AlreadyWithdrawn"
      );
    });
  });
});
