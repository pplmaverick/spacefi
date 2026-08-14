// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {USCBase} from "./USCBase.sol";

/// @title SpaceFinance
/// @notice CC3-side DePIN financing protocol. Proves two Sepolia-side events via USC
/// (`CollateralVault.Deposited` and `NodeRegistry.NodeRegistered`) to advance a per-borrower loan
/// state machine and, once both are verified, disburse a payout token from the treasury.
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
        Repaid
    }

    enum Actions {
        CollateralDeposited, // 0
        NodeRegistered // 1
    }

    struct Loan {
        address borrower;
        uint256 collateralAmount;
        bytes32 nodeId;
        LoanStatus status;
    }

    // keccak256("Deposited(address,uint256,uint256)") — CollateralVault.Deposited canonical signature.
    // `amount` is NOT indexed on that event, so it must be read from `log.data`, not `topics`.
    bytes32 public constant DEPOSITED_EVENT_SIGNATURE = keccak256("Deposited(address,uint256,uint256)");
    // keccak256("NodeRegistered(address,bytes32)") — NodeRegistry.NodeRegistered canonical signature.
    // Both fields are indexed, so both are read from `topics`, no `log.data` decode needed.
    bytes32 public constant NODE_REGISTERED_EVENT_SIGNATURE = keccak256("NodeRegistered(address,bytes32)");

    error InvalidAction(uint8 action);
    error SourceContractsNotConfigured();
    error LoanAlreadyExists(uint256 loanId);
    error NoLoanForOperator(address operator);
    error LoanNotInExpectedStatus(uint256 loanId, LoanStatus expected, LoanStatus actual);

    // Addresses of the Sepolia-side contracts whose events this contract trusts. Any proved event
    // whose emitter does not match these is rejected (fail-closed), same as
    // USCLoanManager.sourceLoanContract in the reference tutorial.
    address public collateralVault;
    address public nodeRegistry;

    IERC20 public payoutToken;
    address public treasury;
    // Flat disbursement amount for the hackathon skeleton.
    // TODO: size this from the borrower's collateral and/or their Spacecoin node revenue
    // (see TokenPaymentEscrow.ReceiptClaimed on CC3 mainnet — same-chain read, no USC needed)
    // instead of a fixed constant.
    uint256 public loanAmount;

    mapping(uint256 => Loan) public loans;
    mapping(address => uint256) public borrowerToLoanId;

    event SourceContractsRegistered(address indexed collateralVault, address indexed nodeRegistry);
    event CollateralVerified(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event NodeVerified(uint256 indexed loanId, address indexed operator, bytes32 nodeId);
    event LoanDisbursed(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanMarkedRepaid(uint256 indexed loanId);

    constructor(
        address initialOwner,
        address payoutToken_,
        address treasury_,
        uint256 loanAmount_
    ) Ownable(initialOwner) {
        require(payoutToken_ != address(0) && treasury_ != address(0), "zero address");
        payoutToken = IERC20(payoutToken_);
        treasury = treasury_;
        loanAmount = loanAmount_;
    }

    /// @notice One-time (or updatable, owner-only) wiring of the trusted Sepolia source contracts.
    function registerSourceContract(address collateralVault_, address nodeRegistry_) external onlyOwner {
        require(collateralVault_ != address(0) && nodeRegistry_ != address(0), "zero address");
        collateralVault = collateralVault_;
        nodeRegistry = nodeRegistry_;
        emit SourceContractsRegistered(collateralVault_, nodeRegistry_);
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
        require(log.topics.length == 3, "invalid Deposited topics");

        // topics[0] = event signature (already matched by getLogsByEventSignature)
        // topics[1] = borrower (indexed)
        // topics[2] = loanId (indexed)
        // data      = amount (NOT indexed — must abi.decode)
        address borrower = address(uint160(uint256(log.topics[1])));
        uint256 loanId = uint256(log.topics[2]);
        uint256 amount = abi.decode(log.data, (uint256));

        if (loans[loanId].status != LoanStatus.None) revert LoanAlreadyExists(loanId);

        loans[loanId] = Loan({
            borrower: borrower,
            collateralAmount: amount,
            nodeId: bytes32(0),
            status: LoanStatus.CollateralVerified
        });
        borrowerToLoanId[borrower] = loanId;

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

        uint256 loanId = borrowerToLoanId[operator];
        if (loanId == 0) revert NoLoanForOperator(operator);

        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.CollateralVerified) {
            revert LoanNotInExpectedStatus(loanId, LoanStatus.CollateralVerified, loan.status);
        }

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
        loan.status = LoanStatus.Active;

        emit LoanDisbursed(loanId, loan.borrower, loanAmount);

        payoutToken.safeTransferFrom(treasury, loan.borrower, loanAmount);
    }

    /// @dev Placeholder for closing the loop. There is no automated CC3 -> Sepolia signal yet, so
    /// this is owner-gated for the skeleton (mirrors CollateralVault.authorizeWithdrawal on the
    /// other chain). TODO: replace with a verified repayment proof once the reverse direction is
    /// designed.
    function markRepaid(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "loan not active");
        loan.status = LoanStatus.Repaid;
        emit LoanMarkedRepaid(loanId);
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
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
