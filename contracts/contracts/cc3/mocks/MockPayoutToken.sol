// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Placeholder payout token for the SpaceFinance skeleton. Stands in for whatever real
/// asset (stablecoin, wrapped CTC, etc.) the treasury eventually disburses. Anyone can mint for
/// testnet convenience — do not deploy this to anything but a testnet.
contract MockPayoutToken is ERC20 {
    constructor() ERC20("SpaceFinance Mock Payout", "mUSDF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
