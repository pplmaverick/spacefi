// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CollateralVault
/// @notice Sepolia-side collateral custody for SpaceFinance. Borrowers deposit ETH here; the
/// deposit event is proved cross-chain (via USC) to the SpaceFinance contract on CC3, which
/// verifies the deposit and advances the loan state machine.
/// @dev Release authorization ("loan repaid") is a temporary owner-gated flag for the hackathon
/// skeleton. There is no automated CC3 -> Sepolia notification path yet: USC only proves events
/// in the Sepolia -> CC3 direction, so closing the loop requires either a second oracle hop or an
/// off-chain relayer. TODO: replace with a real cross-chain repayment signal.
contract CollateralVault is Ownable, ReentrancyGuard {
    struct Deposit {
        address borrower;
        uint256 amount;
        bool withdrawn;
    }

    event Deposited(address indexed borrower, uint256 amount, uint256 indexed loanId);
    event WithdrawalAuthorized(uint256 indexed loanId);
    event Withdrawn(address indexed borrower, uint256 amount, uint256 indexed loanId);

    error ZeroAmount();
    error LoanNotFound();
    error NotBorrower();
    error AlreadyWithdrawn();
    error WithdrawalNotAuthorized();

    uint256 public nextLoanId = 1;

    mapping(uint256 => Deposit) public deposits;
    // TODO: this is a placeholder for the real "loan repaid on CC3" signal. Today it is set
    // manually by the owner; it should eventually be driven by a verified cross-chain proof.
    mapping(uint256 => bool) public withdrawalAuthorized;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deposit ETH as collateral for a new loan. Emits `Deposited`, which is the event
    /// SpaceFinance proves via USC to advance the loan to `CollateralVerified`.
    function deposit() external payable nonReentrant returns (uint256 loanId) {
        if (msg.value == 0) revert ZeroAmount();

        loanId = nextLoanId++;
        deposits[loanId] = Deposit({borrower: msg.sender, amount: msg.value, withdrawn: false});

        emit Deposited(msg.sender, msg.value, loanId);
    }

    /// @dev Simplified stand-in for the real repayment signal. Only the owner (deployer /
    /// operator for this hackathon skeleton) can flip this. TODO: replace with verified proof.
    function authorizeWithdrawal(uint256 loanId) external onlyOwner {
        if (deposits[loanId].borrower == address(0)) revert LoanNotFound();
        withdrawalAuthorized[loanId] = true;
        emit WithdrawalAuthorized(loanId);
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
}
