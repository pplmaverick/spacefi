// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {INativeQueryVerifier} from "../cc3/VerifierInterface.sol";

/// @title MockNativeQueryVerifier
/// @notice Test-only stand-in for the Native Query Verifier precompile that lives at
/// 0x0000000000000000000000000000000000000FD2 on real Creditcoin networks. Hardhat Network has no
/// such precompile, so tests inject this contract's bytecode at that address via
/// `hardhat_setCode` (see test/helpers/precompile.ts) instead of calling the real thing.
/// @dev Always reports proofs as verified — the whole point is to unit-test SpaceFinance's own
/// state machine (loan verification, disbursement, repayment) without depending on a real USC
/// proof pipeline. `calculateTxIndex` derives a value from `merkleProof.root` purely so tests can
/// get distinct queryIds by passing distinct merkle roots.
contract MockNativeQueryVerifier is INativeQueryVerifier {
    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external pure returns (bool) {
        return true;
    }

    function calculateTxIndex(
        INativeQueryVerifier.MerkleProof calldata merkleProof
    ) external pure returns (uint64) {
        return uint64(uint256(merkleProof.root));
    }
}
