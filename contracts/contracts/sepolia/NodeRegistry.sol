// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title NodeRegistry
/// @notice Sepolia-side identity registry for Spacecoin node operators. Registration events are
/// proved cross-chain (via USC) to SpaceFinance on CC3, which uses them to advance a borrower's
/// loan to `NodeVerified` and trigger disbursement.
/// @dev Both directions of duplication are rejected: a nodeId can only ever be claimed once, and
/// an operator address can only register one nodeId. The latter keeps the operator -> loanId
/// mapping on SpaceFinance unambiguous (one operator, one active node identity).
contract NodeRegistry {
    event NodeRegistered(address indexed operator, bytes32 indexed nodeId);

    error ZeroNodeId();
    error NodeAlreadyRegistered(bytes32 nodeId);
    error OperatorAlreadyRegistered(address operator);

    mapping(bytes32 => address) public nodeOperator;
    mapping(address => bytes32) public operatorNodeId;

    /// @notice Register the caller as the operator of `nodeId`.
    /// @dev No proof of actual Spacecoin node ownership is checked here — this is the hackathon
    /// skeleton's identity claim step. TODO: consider requiring a signed attestation from the
    /// Spacecoin node itself before accepting the claim.
    function registerNode(bytes32 nodeId) external {
        if (nodeId == bytes32(0)) revert ZeroNodeId();
        if (nodeOperator[nodeId] != address(0)) revert NodeAlreadyRegistered(nodeId);
        if (operatorNodeId[msg.sender] != bytes32(0)) revert OperatorAlreadyRegistered(msg.sender);

        nodeOperator[nodeId] = msg.sender;
        operatorNodeId[msg.sender] = nodeId;

        emit NodeRegistered(msg.sender, nodeId);
    }

    function isNodeRegistered(bytes32 nodeId) external view returns (bool) {
        return nodeOperator[nodeId] != address(0);
    }
}
