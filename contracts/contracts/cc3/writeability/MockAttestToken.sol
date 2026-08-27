// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockAttestToken
/// @notice Placeholder ATTEST token for the write-ability stub deployment. `Outbox` and
/// `AttestorVault` both require a nonzero, code-bearing token address, but with
/// `MockCoreFeeProvider` returning a zero core fee this token is never actually transferred by the
/// publish path. Anyone can mint for testnet convenience.
/// @dev Hackathon stub — do not deploy this to anything but a testnet.
contract MockAttestToken is ERC20 {
    constructor() ERC20("Mock ATTEST", "mATTEST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
