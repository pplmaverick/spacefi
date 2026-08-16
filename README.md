# SpaceFinance

![CI](https://github.com/pplmaverick/spacefi/actions/workflows/ci.yml/badge.svg)
![Creditcoin CC3](https://img.shields.io/badge/Creditcoin_CC3-Testnet_102031-blue)
![Solidity](https://img.shields.io/badge/Solidity-0.8.30-363636)
![License](https://img.shields.io/badge/license-MIT-green)
![Hackathon](https://img.shields.io/badge/BUIDL_CTC_2026-Fall-orange)

**Live Demo →** [spacefi.vercel.app](https://spacefi.vercel.app) · Network: Creditcoin CC3 Testnet (Chain ID 102031)

A DePIN infrastructure financing protocol built on Creditcoin CC3, enabling node operators to access collateral-backed loans verified by the Attestcoin Protocol — no bridges, no centralized oracles.

**Deployed on Creditcoin CC3 Testnet + Ethereum Sepolia**

**Sepolia**
- CollateralVault: [0x5acB13a3750e9e1844643D3f20609B46F6E55ac2](https://sepolia.etherscan.io/address/0x5acB13a3750e9e1844643D3f20609B46F6E55ac2)
- NodeRegistry: [0x16af69f36B80Ef7F150Af88e5693f38b2eA013B9](https://sepolia.etherscan.io/address/0x16af69f36B80Ef7F150Af88e5693f38b2eA013B9)

**CC3 Testnet**
- SpaceFinance: [0xEE93Cc7c31367599bf21aB78Aea21D6011d8750B](https://creditcoin-testnet.blockscout.com/address/0xEE93Cc7c31367599bf21aB78Aea21D6011d8750B)
- MockPayoutToken: [0x0a75041429506A30ad804EF757bB0f4942F6811c](https://creditcoin-testnet.blockscout.com/address/0x0a75041429506A30ad804EF757bB0f4942F6811c)
- GuildPool: [0x7EBc98c14920C9A9b060B81047ec96A8906b06C1](https://creditcoin-testnet.blockscout.com/address/0x7EBc98c14920C9A9b060B81047ec96A8906b06C1)

---

## Why Creditcoin-Native

This project is not ported from another chain. Every design decision maps directly to Creditcoin's native cross-chain verification capability.

| Problem | Generic approach | Creditcoin-native approach |
|---|---|---|
| Verify collateral on another chain | Centralized oracle or bridge | Attestcoin Protocol proof — trustless, no relayer |
| Confirm node identity cross-chain | Manual off-chain verification | On-chain USC proof from Sepolia NodeRegistry |
| Loan disbursement trigger | Admin multisig | Automatic on proof submission to SpaceFinance |
| Cross-chain data integrity | Bridge with trust assumptions | Native CC3 verifier precompile (`0x...0FD2`) |

---

## Architecture
<img width="1101" height="566" alt="01" src="https://github.com/user-attachments/assets/152047bd-2f82-4411-953e-95ce250d8749" />

---

## Core Features

### Trustless Cross-Chain Collateral Verification
Borrowers deposit ETH into `CollateralVault` on Sepolia. The Attestcoin Protocol generates a cryptographic proof of the deposit event, which is submitted to `SpaceFinance` on CC3 — no bridge, no oracle operator.

### Node Identity Verification
DePIN node operators register on Sepolia's `NodeRegistry`. The same USC proof mechanism verifies node identity on CC3, ensuring only legitimate operators receive financing.

### Automatic Loan Disbursement
Once both proofs are verified on-chain, `SpaceFinance` automatically updates loan status to `Active` and disburses mUSDF to the borrower — fully trustless and permissionless.

---

## Deployed Contracts

**Ethereum Sepolia (11155111)**

| Contract | Address |
|---|---|
| CollateralVault | [0x5acB13a3750e9e1844643D3f20609B46F6E55ac2](https://sepolia.etherscan.io/address/0x5acB13a3750e9e1844643D3f20609B46F6E55ac2) |
| NodeRegistry | [0x16af69f36B80Ef7F150Af88e5693f38b2eA013B9](https://sepolia.etherscan.io/address/0x16af69f36B80Ef7F150Af88e5693f38b2eA013B9) |

**Creditcoin CC3 Testnet (102031)**

| Contract | Address |
|---|---|
| SpaceFinance | [0xEE93Cc7c31367599bf21aB78Aea21D6011d8750B](https://creditcoin-testnet.blockscout.com/address/0xEE93Cc7c31367599bf21aB78Aea21D6011d8750B) |
| MockPayoutToken (mUSDF) | [0x0a75041429506A30ad804EF757bB0f4942F6811c](https://creditcoin-testnet.blockscout.com/address/0x0a75041429506A30ad804EF757bB0f4942F6811c) |
| EvmV1Decoder (lib) | `0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953` |

---

## Quick Start

**Prerequisites**
- Node.js 18+
- A funded wallet on Sepolia and CC3 Testnet
- Sepolia ETH (for collateral deposit)
- CC3 Testnet CTC (from Creditcoin Discord faucet)

```bash
# 1. Install dependencies
yarn install

# 2. Configure environment
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Deployer wallet private key (no 0x prefix) |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint |
| `CC3_TESTNET_RPC_URL` | CC3 Testnet RPC (default: public endpoint) |
| `PROOF_BUILDER_URL` | Attestcoin ProofBuilder endpoint |

```bash
# 3. Compile
npx hardhat compile

# 4. Deploy to Sepolia
npx hardhat run scripts/deploy-sepolia.ts --network sepolia

# 5. Deploy to CC3 Testnet
npx hardhat run scripts/deploy-cc3.ts --network cc3_testnet

# 6. Run end-to-end flow
npx hardhat run scripts/e2e.ts --network cc3_testnet
```

---

## Implementation Notes

**Attestcoin Protocol Proof Generation (~8-10 min)**
The ProofBuilder must wait for Sepolia block attestation on CC3 before generating a proof. This is an inherent property of the cross-chain attestation protocol — not a bug. The e2e script runs both proof generations in parallel to minimize total wait time.

**USC `chainKey` vs EVM `chainId`**
The Attestcoin Protocol uses its own `chainKey` identifier (Sepolia = `1`), distinct from EVM chain ID (`11155111`). Passing the wrong value causes proof verification to fail silently.

**Gas Estimation for `execute()`**
CC3's precompile gas estimation is unreliable for `SpaceFinance.execute()`. The e2e script applies a 35% gas buffer on top of the estimated value to prevent out-of-gas reverts.

**`EvmV1Decoder` as Linked Library**
`EvmV1Decoder` contains public functions and must be deployed as a separate contract before `SpaceFinance`. Hardhat links it automatically via the deployment script.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.30 |
| Development | Hardhat + ethers.js v6 |
| Cross-chain | Creditcoin Attestcoin Protocol (USC) |
| Proof generation | `@gluwa/usc-sdk` ProofBuilder |
| Testnet token | mUSDF (`0x0a75...811c`) |

---

## Roadmap

**✅ M1 — Core Protocol (completed)**
- CollateralVault and NodeRegistry on Sepolia
- SpaceFinance with Attestcoin proof verification on CC3
- Full e2e: deposit → register → prove → Active → disburse

**⬜ M2 — Frontend**
- Next.js 14 dashboard for node operators
- MetaMask integration with wagmi + viem
- Real-time loan status tracking

**⬜ M3 — Mainnet**
- Deploy to CC3 Mainnet with real CTC collateral
- Integration with real DePIN node registry

---

## Developer

GitHub: [pplmaverick](https://github.com/pplmaverick)  
Wallet: `0xed2B5717c9b936ecC76d75401026A99143e278F5`

## License

MIT
