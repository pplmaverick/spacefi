// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MessageReceiverBase} from "usc-write-ability/contracts/write-ability/abstract/MessageReceiverBase.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title CollateralVault
/// @notice Sepolia-side collateral custody for SpaceFinance. Borrowers deposit ETH here; the
/// deposit event is proved cross-chain (via USC) to the SpaceFinance contract on CC3, which
/// verifies the deposit and advances the loan state machine.
/// @dev Release authorization ("loan repaid") now has two paths: (1) automatic, via the USC
/// write-ability layer — SpaceFinance.repay() on CC3 publishes a message through an Outbox, a
/// quorum of attestors signs it, and the destination Inbox delivers it here as `receiveMessage`
/// (see `_processMessage`), which authorizes the withdrawal without any admin step; (2)
/// `authorizeWithdrawal`, an owner-gated manual fallback kept for when the automated relay is
/// unavailable. `MessageReceiverBase` (from the USC write-ability contracts) supplies the
/// Ownable2Step/trusted-inbox/replay-protection machinery `receiveMessage` runs on.
contract CollateralVault is MessageReceiverBase, ReentrancyGuard {
    struct Deposit {
        address borrower;
        uint256 amount;
        uint256 usdValue;
        bool withdrawn;
    }

    event Deposited(address indexed borrower, uint256 loanId, uint256 amount, uint256 usdValue);
    event WithdrawalAuthorized(uint256 indexed loanId);
    event Withdrawn(address indexed borrower, uint256 amount, uint256 indexed loanId);
    event TrustedEmitterSet(address indexed emitter, uint256 sourceChainId);
    event AutoWithdrawalAuthorized(uint256 indexed loanId, bytes32 indexed messageId);

    error ZeroAmount();
    error LoanNotFound();
    error NotBorrower();
    error AlreadyWithdrawn();
    error WithdrawalNotAuthorized();
    error UntrustedEmitter(address emitter);
    error UnexpectedSourceChain(uint256 sourceChainId);
    error BorrowerMismatch(uint256 loanId, address expected, address got);

    uint256 public nextLoanId = 1;

    AggregatorV3Interface public priceFeed;

    // The CC3 SpaceFinance contract address and CC3 chain id that this vault trusts
    // `_processMessage` deliveries from — set once SpaceFinance is deployed on CC3, via
    // setTrustedEmitter. Until then, delivered messages are rejected (fail-closed).
    address public spaceFinanceEmitter;
    uint256 public expectedSourceChainId;

    mapping(uint256 => Deposit) public deposits;
    // Set either automatically by `_processMessage` (the write-ability auto-release path) or
    // manually by the owner via `authorizeWithdrawal` (fallback for when the automated relay is
    // unavailable).
    mapping(uint256 => bool) public withdrawalAuthorized;

    constructor(
        address initialInbox,
        address initialOwner,
        address priceFeed_
    ) MessageReceiverBase(initialInbox, initialOwner) {
        priceFeed = AggregatorV3Interface(priceFeed_);
    }

    /// @notice One-time (or updatable, owner-only) wiring of the trusted CC3 SpaceFinance emitter
    /// and chain id that `_processMessage` accepts repayment messages from.
    function setTrustedEmitter(address emitter, uint256 sourceChainId_) external onlyOwner {
        require(emitter != address(0), "zero address");
        spaceFinanceEmitter = emitter;
        expectedSourceChainId = sourceChainId_;
        emit TrustedEmitterSet(emitter, sourceChainId_);
    }

    /// @notice Deposit ETH as collateral for a new loan. Emits `Deposited`, which is the event
    /// SpaceFinance proves via USC to advance the loan to `CollateralVerified`.
    function deposit() external payable nonReentrant returns (uint256 loanId) {
        if (msg.value == 0) revert ZeroAmount();

        (, int256 answer, , , ) = priceFeed.latestRoundData();
        uint256 usdValue = (msg.value * uint256(answer)) / 1e8;

        loanId = nextLoanId++;
        deposits[loanId] = Deposit({
            borrower: msg.sender,
            amount: msg.value,
            usdValue: usdValue,
            withdrawn: false
        });

        emit Deposited(msg.sender, loanId, msg.value, usdValue);
    }

    /// @dev Owner-gated manual fallback for the repayment signal, for when the automated
    /// write-ability relay (see `_processMessage`) is unavailable.
    function authorizeWithdrawal(uint256 loanId) external onlyOwner {
        if (deposits[loanId].borrower == address(0)) revert LoanNotFound();
        withdrawalAuthorized[loanId] = true;
        emit WithdrawalAuthorized(loanId);
    }

    /// @notice Handles a repayment message delivered by a trusted Inbox (see
    /// `MessageReceiverBase.receiveMessage`, which gates this on `trustedInboxes` and replay
    /// protection before calling here). Payload is `abi.encode(uint256 loanId, address borrower)`,
    /// published by `SpaceFinance._publishRepayment` on CC3. Reverting here (untrusted emitter,
    /// wrong chain, unknown loan, or a borrower mismatch) is safe: the Inbox stores the message as
    /// pending and anyone can retry it once the mismatch is fixed.
    function _processMessage(
        bytes32 messageId,
        uint256 sourceChainId,
        address emitterAddress,
        bytes calldata payload
    ) internal override {
        if (emitterAddress != spaceFinanceEmitter) revert UntrustedEmitter(emitterAddress);
        if (sourceChainId != expectedSourceChainId) revert UnexpectedSourceChain(sourceChainId);

        (uint256 loanId, address borrower) = abi.decode(payload, (uint256, address));
        Deposit storage dep = deposits[loanId];
        if (dep.borrower == address(0)) revert LoanNotFound();
        if (dep.borrower != borrower) revert BorrowerMismatch(loanId, dep.borrower, borrower);

        withdrawalAuthorized[loanId] = true;
        emit WithdrawalAuthorized(loanId);
        emit AutoWithdrawalAuthorized(loanId, messageId);
    }

    /// @notice Withdraw collateral for a loan. Only the original borrower can withdraw, and only
    /// after the owner has authorized it (see `authorizeWithdrawal`).
    function withdraw(uint256 loanId) external nonReentrant {
        Deposit storage dep = deposits[loanId];
        if (dep.borrower == address(0)) revert LoanNotFound();
        if (dep.borrower != msg.sender) revert NotBorrower();
        if (dep.withdrawn) revert AlreadyWithdrawn();
        if (!withdrawalAuthorized[loanId]) revert WithdrawalNotAuthorized();

        dep.withdrawn = true;
        uint256 amount = dep.amount;

        emit Withdrawn(msg.sender, amount, loanId);

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    function getDeposit(uint256 loanId) external view returns (Deposit memory) {
        return deposits[loanId];
    }

    function getUsdValue(uint256 loanId) external view returns (uint256) {
        return deposits[loanId].usdValue;
    }
}
