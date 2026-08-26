// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AggregatorV3Interface} from "../sepolia/CollateralVault.sol";

/// @title MockV3Aggregator
/// @notice Minimal Chainlink-style price feed for CollateralVault tests. Mirrors the shape of
/// Chainlink's own MockV3Aggregator test helper closely enough for our needs (8-decimal answer,
/// updatable) without pulling in the real Chainlink contracts package.
contract MockV3Aggregator is AggregatorV3Interface {
    uint80 private _roundId;
    int256 private _answer;

    constructor(int256 initialAnswer) {
        _answer = initialAnswer;
        _roundId = 1;
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _roundId += 1;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, block.timestamp, block.timestamp, _roundId);
    }
}
