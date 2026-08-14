# SpaceFinance

![Network](https://img.shields.io/badge/Creditcoin_CC3_Testnet-102031-blue)
![Solidity](https://img.shields.io/badge/Solidity-0.8.30-purple)
![License](https://img.shields.io/badge/license-MIT-green)

A DePIN infrastructure financing protocol built on Creditcoin CC3, enabling node operators to access collateral-backed loans verified by the Attestcoin Protocol — no bridges, no centralized oracles.

**Deployed on Creditcoin CC3 Testnet + Ethereum Sepolia**

| Network | Contract | Address |
|---|---|---|
| Sepolia (11155111) | CollateralVault | `0xBdC53E50b1167cE1199bFaD54A034f7ab1741051` |
| Sepolia (11155111) | NodeRegistry | `0x15636CE4C0EdE55335f84E6386f8F49C897c077d` |
| CC3 Testnet (102031) | SpaceFinance | `0xBdC53E50b1167cE1199bFaD54A034f7ab1741051` |
| CC3 Testnet (102031) | MockPayoutToken | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` |

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

Ethereum Sepolia Creditcoin CC3 Testnet
───────────────── ──────────────────────
CollateralVault SpaceFinance
deposit() ──── Attestcoin ──────► verifyAndExecute()
Protocol │
NodeRegistry ▼
registerNode() ─── proof ──────► Loan → Active
│
▼
mUSDF disbursed
to borrower


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
| CollateralVault | `0xBdC53E50b1167cE1199bFaD54A034f7ab1741051` |
| NodeRegistry | `0x15636CE4C0EdE55335f84E6386f8F49C897c077d` |

**Creditcoin CC3 Testnet (102031)**

| Contract | Address |
|---|---|
| SpaceFinance | `0xBdC53E50b1167cE1199bFaD54A034f7ab1741051` |
| MockPayoutToken (mUSDF) | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` |
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
| Testnet token | mUSDF (`0x072A...531f`) |

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
