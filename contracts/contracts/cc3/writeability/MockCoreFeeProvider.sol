// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICoreFeeProvider} from "usc-write-ability/contracts/write-ability/abstract/ICoreFeeProvider.sol";

/// @title MockCoreFeeProvider
/// @notice Stub replacement for the Creditcoin native `get_core_fee` precompile (selector
/// 0x5b023376), which only exists on production Creditcoin infrastructure, not CC3 testnet. Always
/// answers a zero core fee, so `FeeRegistry.coreFee()` returns 0 and `Outbox.publishMessage` never
/// touches the ATTEST/AttestorVault fee-custody path — this contract exists only to satisfy
/// `FeeRegistry`'s constructor (`ICoreFeeProvider` must be a nonzero, code-bearing address).
/// @dev Hackathon stub — do not deploy this to anything but a testnet.
contract MockCoreFeeProvider is ICoreFeeProvider {
    function get_core_fee(uint32) external pure override returns (uint256) {
        return 0;
    }
}
