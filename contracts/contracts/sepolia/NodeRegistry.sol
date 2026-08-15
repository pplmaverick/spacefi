// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NodeRegistry
/// @notice Sepolia-side identity registry for Spacecoin node operators. Registration events are
/// proved cross-chain (via USC) to SpaceFinance on CC3, which uses them to advance a borrower's
/// loan to `NodeVerified` and trigger disbursement.
/// @dev Registration requires prior owner approval of the specific (operator, nodeId) pair via
/// `approveNode`. There is no on-chain uniqueness constraint on nodeId or operator anymore — the
/// approval mapping is the only gate.
contract NodeRegistry is Ownable {
    event NodeRegistered(address indexed operator, bytes32 indexed nodeId);
    event NodeApproved(address indexed operator, bytes32 indexed nodeId);

    error ZeroNodeId();

    mapping(bytes32 => address) public nodeOperator;
    mapping(address => mapping(bytes32 => bool)) public approvedOperators;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Owner-gated approval for `operator` to register `nodeId`.
    function approveNode(address operator, bytes32 nodeId) external onlyOwner {
        approvedOperators[operator][nodeId] = true;
        emit NodeApproved(operator, nodeId);
    }

    /// @notice Register the caller as the operator of `nodeId`. Requires prior approval via
    /// `approveNode`.
    function registerNode(bytes32 nodeId) external {
        if (nodeId == bytes32(0)) revert ZeroNodeId();
        require(approvedOperators[msg.sender][nodeId], "Not approved");

        nodeOperator[nodeId] = msg.sender;

        emit NodeRegistered(msg.sender, nodeId);
    }

    function isNodeRegistered(bytes32 nodeId) external view returns (bool) {
        return nodeOperator[nodeId] != address(0);
    }
}
