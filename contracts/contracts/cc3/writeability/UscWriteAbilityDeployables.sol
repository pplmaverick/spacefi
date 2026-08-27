// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Nothing in this repo imports these concrete write-ability contracts directly (SpaceFinance only
// needs the IOutbox interface; CollateralVault only needs MessageReceiverBase) — Hardhat compiles
// a file only if it's under `contracts/` or transitively imported by something that is, so without
// this file `ethers.getContractFactory("usc-write-ability/.../Outbox.sol:Outbox")` etc. in the
// deploy scripts would fail with "no artifact found". This file exists purely to pull their
// artifacts into the build; it has no logic of its own and is never deployed itself.
import {Outbox} from "usc-write-ability/contracts/write-ability/Outbox.sol";
import {Inbox} from "usc-write-ability/contracts/write-ability/Inbox.sol";
import {EOAValidator} from "usc-write-ability/contracts/write-ability/EOAValidator.sol";
import {AttestorRegistry} from "usc-write-ability/contracts/write-ability/AttestorRegistry.sol";
import {AttestorVault} from "usc-write-ability/contracts/write-ability/AttestorVault.sol";
import {FeeRegistry} from "usc-write-ability/contracts/write-ability/FeeRegistry.sol";
