// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {IOutbox} from "usc-write-ability/contracts/write-ability/abstract/IOutbox.sol";
import {USCBase} from "./USCBase.sol";

/// @title SpaceFinance
/// @notice CC3-side DePIN financing protocol. Proves two Sepolia-side events via USC
/// (`CollateralVault.Deposited` and `NodeRegistry.NodeRegistered`) to advance a per-borrower loan
/// state machine and, once both are verified, disburse a payout token from the treasury. Borrowers
/// can hold multiple concurrent loans and repay them via `repay`.
/// @dev Pattern mirrors usc-testnet-bridge-examples/contracts/sol/USCLoanManager.sol: inherit
/// USCBase, implement `_processAndEmitEvent` to fan out on `action`, decode the proved receipt
/// with EvmV1Decoder, and enforce an emitter allow-list so only the registered source contracts'
/// events are trusted.
contract SpaceFinance is Ownable, ReentrancyGuard, USCBase {
    using SafeERC20 for IERC20;

    enum LoanStatus {
        None,
        CollateralVerified,
        NodeVerified,
        Active,
        Repaid,
        Withdrawn
    }

    enum Actions {
        CollateralDeposited, // 0
        NodeRegistered // 1
    }

    struct Loan {
        address borrower;
        uint256 collateralAmount;
        uint256 usdValue;
        bytes32 nodeId;
        LoanStatus status;
        uint256 repaidAmount;
        // Disbursed principal for this loan, set once in `_disburse` (70% of `usdValue`). Stored
        // per-loan rather than as a single contract-wide constant because LTV now varies with each
        // loan's collateral value; `repay` compares cumulative repayment against this field.
        uint256 loanAmount;
    }

    // keccak256("Deposited(address,uint256,uint256,uint256)") — CollateralVault.Deposited canonical
    // signature (borrower, loanId, amount, usdValue). Only `borrower` is indexed; the rest is read
    // from `log.data`.
    bytes32 public constant DEPOSITED_EVENT_SIGNATURE = keccak256("Deposited(address,uint256,uint256,uint256)");
    // keccak256("NodeRegistered(address,bytes32)") — NodeRegistry.NodeRegistered canonical signature.
    // Both fields are indexed, so both are read from `topics`, no `log.data` decode needed.
    bytes32 public constant NODE_REGISTERED_EVENT_SIGNATURE = keccak256("NodeRegistered(address,bytes32)");

    error InvalidAction(uint8 action);
    error SourceContractsNotConfigured();
    error NoLoanForOperator(address operator);

    // Addresses of the Sepolia-side contracts whose events this contract trusts. Any proved event
    // whose emitter does not match these is rejected (fail-closed), same as
    // USCLoanManager.sourceLoanContract in the reference tutorial.
    address public collateralVault;
    address public nodeRegistry;

    // USC write-ability Outbox (CC3 -> Sepolia). Optional: while unset, repay()/markRepaid() behave
    // exactly as before (collateral release stays a manual Sepolia-side admin action). Once set,
    // a fully repaid loan is announced automatically via publishMessage — see _publishRepayment.
    address public outbox;

    IERC20 public payoutToken;
    address public treasury;
    // LTV applied against a loan's proved collateral usdValue at disbursement time. 70 = 70%.
    // TODO: layer in Spacecoin node revenue once it's available on-chain (see getNodeRevenue).
    uint256 public constant LTV_PERCENT = 70;

    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerToLoanIds;

    event SourceContractsRegistered(address indexed collateralVault, address indexed nodeRegistry);
    event OutboxRegistered(address indexed outbox);
    event RepaymentPublished(uint256 indexed loanId, bytes32 indexed messageId);
    event CollateralVerified(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event NodeVerified(uint256 indexed loanId, address indexed operator, bytes32 nodeId);
    event LoanDisbursed(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanMarkedRepaid(uint256 indexed loanId);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower);
    event PartialRepayment(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 totalRepaid);

    constructor(
        address initialOwner,
        address payoutToken_,
        address treasury_
    ) Ownable(initialOwner) {
        require(payoutToken_ != address(0) && treasury_ != address(0), "zero address");
        payoutToken = IERC20(payoutToken_);
        treasury = treasury_;
    }

    /// @notice One-time (or updatable, owner-only) wiring of the trusted Sepolia source contracts.
    function registerSourceContract(address collateralVault_, address nodeRegistry_) external onlyOwner {
        require(collateralVault_ != address(0) && nodeRegistry_ != address(0), "zero address");
        collateralVault = collateralVault_;
        nodeRegistry = nodeRegistry_;
        emit SourceContractsRegistered(collateralVault_, nodeRegistry_);
    }

    /// @notice One-time (or updatable, owner-only) wiring of the USC write-ability Outbox used to
    /// announce repayments to Sepolia. See `outbox` and `_publishRepayment`.
    function registerOutbox(address outbox_) external onlyOwner {
        require(outbox_ != address(0), "zero address");
        outbox = outbox_;
        emit OutboxRegistered(outbox_);
    }

    /// @dev Called by USCBase.execute() once the proof has verified. Fans out on `action`.
    function _processAndEmitEvent(
        uint8 action,
        bytes32, // queryId — dedup already handled by USCBase.processedQueries
        bytes memory encodedTransaction
    ) internal override {
        if (collateralVault == address(0) || nodeRegistry == address(0)) {
            revert SourceContractsNotConfigured();
        }

        if (action == uint8(Actions.CollateralDeposited)) {
            _handleCollateralDeposited(encodedTransaction);
        } else if (action == uint8(Actions.NodeRegistered)) {
            _handleNodeRegistered(encodedTransaction);
        } else {
            revert InvalidAction(action);
        }
    }

    function _handleCollateralDeposited(bytes memory encodedTransaction) internal {
        EvmV1Decoder.LogEntry memory log = _firstLogFor(encodedTransaction, DEPOSITED_EVENT_SIGNATURE);

        require(log.address_ == collateralVault, "Deposited not emitted by registered CollateralVault");
        require(log.topics.length == 2, "invalid Deposited topics");

        // topics[0] = event signature (already matched by getLogsByEventSignature)
        // topics[1] = borrower (indexed)
        // data      = loanId, amount, usdValue (NOT indexed — must abi.decode)
        // `loanId` here is CollateralVault's Sepolia-side id, reused directly as the key into
        // `loans` so both chains share one loanId namespace instead of SpaceFinance minting its
        // own via a separate counter.
        address borrower = address(uint160(uint256(log.topics[1])));
        (uint256 loanId, uint256 amount, uint256 usdValue) = abi.decode(log.data, (uint256, uint256, uint256));

        loans[loanId] = Loan({
            borrower: borrower,
            collateralAmount: amount,
            usdValue: usdValue,
            nodeId: bytes32(0),
            status: LoanStatus.CollateralVerified,
            repaidAmount: 0,
            loanAmount: 0
        });
        borrowerToLoanIds[borrower].push(loanId);

        emit CollateralVerified(loanId, borrower, amount);
    }

    function _handleNodeRegistered(bytes memory encodedTransaction) internal {
        EvmV1Decoder.LogEntry memory log = _firstLogFor(encodedTransaction, NODE_REGISTERED_EVENT_SIGNATURE);

        require(log.address_ == nodeRegistry, "NodeRegistered not emitted by registered NodeRegistry");
        require(log.topics.length == 3, "invalid NodeRegistered topics");

        // Both fields are indexed on this event — both come from topics, data is empty.
        // topics[1] = operator (indexed), topics[2] = nodeId (indexed)
        address operator = address(uint160(uint256(log.topics[1])));
        bytes32 nodeId = log.topics[2];

        // Not specified in the request: now that a borrower can hold multiple concurrent loans
        // (borrowerToLoanIds), NodeRegistered has to resolve to one specific loan. Default here:
        // the most recently created loan for this operator that is still awaiting node
        // verification. See summary note — confirm this is the intended matching rule.
        uint256[] storage ids = borrowerToLoanIds[operator];
        uint256 loanId;
        for (uint256 i = ids.length; i > 0; i--) {
            if (loans[ids[i - 1]].status == LoanStatus.CollateralVerified) {
                loanId = ids[i - 1];
                break;
            }
        }
        if (loanId == 0) revert NoLoanForOperator(operator);

        Loan storage loan = loans[loanId];
        loan.nodeId = nodeId;
        loan.status = LoanStatus.NodeVerified;
        emit NodeVerified(loanId, operator, nodeId);

        _disburse(loanId);
    }

    /// @dev Decodes the proved source-chain receipt and returns the single log matching
    /// `eventSignature`. Mirrors USCLoanManager._validateTransactionContents /
    /// _processFundLogs — we only ever expect one matching log per transaction.
    function _firstLogFor(
        bytes memory encodedTransaction,
        bytes32 eventSignature
    ) internal pure returns (EvmV1Decoder.LogEntry memory) {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "unsupported source tx type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "source transaction did not succeed");

        EvmV1Decoder.LogEntry[] memory matches = EvmV1Decoder.getLogsByEventSignature(receipt, eventSignature);
        require(matches.length > 0, "expected event not found in receipt");

        return matches[0];
    }

    function _disburse(uint256 loanId) internal nonReentrant {
        Loan storage loan = loans[loanId];
        uint256 amount = (loan.usdValue * LTV_PERCENT) / 100;
        loan.loanAmount = amount;
        loan.status = LoanStatus.Active;

        emit LoanDisbursed(loanId, loan.borrower, amount);

        payoutToken.safeTransferFrom(treasury, loan.borrower, amount);
    }

    /// @notice Repay an active loan. Accepts partial repayments; once cumulative repayment meets
    /// or exceeds `loan.loanAmount` (the principal disbursed for this specific loan), the loan is
    /// marked `Repaid`.
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "loan not active");
        require(msg.sender == loan.borrower, "not borrower");

        payoutToken.safeTransferFrom(msg.sender, treasury, amount);
        loan.repaidAmount += amount;

        if (loan.repaidAmount >= loan.loanAmount) {
            loan.status = LoanStatus.Repaid;
            emit LoanRepaid(loanId, msg.sender);
            _publishRepayment(loanId, loan.borrower);
        } else {
            emit PartialRepayment(loanId, msg.sender, amount, loan.repaidAmount);
        }
    }

    /// @dev Owner-gated fallback for closing the loop without a full repay() (e.g. off-chain
    /// settlement, or recovering a loan whose automated relay never arrived). Mirrors
    /// CollateralVault.authorizeWithdrawal as the equivalent manual override on the other chain.
    function markRepaid(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "loan not active");
        loan.status = LoanStatus.Repaid;
        emit LoanMarkedRepaid(loanId);
        _publishRepayment(loanId, loan.borrower);
    }

    /// @notice Announces a fully repaid loan to Sepolia via the USC write-ability Outbox, so
    /// CollateralVault can automatically authorize the collateral withdrawal (see
    /// CollateralVault._processMessage). A no-op while `outbox` is unset, so this stays optional
    /// and backward compatible with the manual CollateralVault.authorizeWithdrawal admin path.
    /// @dev canAck = false: this deployment never runs the acknowledgment/relayer-fee side of the
    /// write-ability layer, only message publishing + attestor-signed delivery.
    function _publishRepayment(uint256 loanId, address borrower) internal {
        if (outbox == address(0)) return;
        bytes memory payload = abi.encode(loanId, borrower);
        bytes32 messageId = IOutbox(outbox).publishMessage(false, payload);
        emit RepaymentPublished(loanId, messageId);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getLoansByBorrower(address borrower) external view returns (uint256[] memory) {
        return borrowerToLoanIds[borrower];
    }

    /// @notice Spacecoin node revenue lookup, for sizing/underwriting loans against a node's
    /// actual earnings instead of (or in addition to) fixed collateral.
    /// @dev TODO: not implemented yet. Two things have to be true before this can be wired up:
    /// 1. TokenPaymentEscrow (0xC130F5D76f0b4Ce8FE2ceA0D2C2b8f53A39a5cd0) lives on Creditcoin
    ///    MAINNET, not CC3 Testnet. "Same-chain, no USC needed" only holds once SpaceFinance itself
    ///    is deployed to mainnet too — on testnet (where this skeleton currently lives) that address
    ///    is a different, unrelated contract (or nothing at all). Calling it from testnet today
    ///    would be wrong, which is why this still returns a hardcoded 0.
    /// 2. TokenPaymentEscrow has no built-in per-node revenue aggregate (only single-receipt
    ///    lookups via getReceipt(client, requestUUID)) — see scripts/query-node-revenue.ts, which
    ///    computes this off-chain by paginating Blockscout's indexed ReceiptClaimed history.
    ///    A real on-chain implementation needs either an off-chain indexer submitting periodic
    ///    checkpoints, or a mirroring contract that accumulates ReceiptClaimed events itself —
    ///    it can't just be a single external view call.
    function getNodeRevenue(bytes32 nodeId) external view returns (uint256 totalRevenue) {
        // Intentionally unused until the above is resolved.
        nodeId;
        return 0;
    }
}
