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
- CollateralVault: [0x984a87770ff3F8D978704eEe9ae5A0DBBaB8125E](https://sepolia.etherscan.io/address/0x984a87770ff3F8D978704eEe9ae5A0DBBaB8125E)
- NodeRegistry: [0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3](https://sepolia.etherscan.io/address/0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3)

**CC3 Testnet**
- SpaceFinance: [0x4Ee3fda05549955494184b28198210A427013760](https://creditcoin-testnet.blockscout.com/address/0x4Ee3fda05549955494184b28198210A427013760)
- MockPayoutToken: [0xbc7d2C3dafF757D47AF8f4Eb305A16A1e55feb3D](https://creditcoin-testnet.blockscout.com/address/0xbc7d2C3dafF757D47AF8f4Eb305A16A1e55feb3D)
- GuildPool: [0x9d56b68c55f044d493FD0AE0a0a2Bc6aEE9cE9d1](https://creditcoin-testnet.blockscout.com/address/0x9d56b68c55f044d493FD0AE0a0a2Bc6aEE9cE9d1)

Full write-ability layer contracts (Outbox, Inbox, EOAValidator, ...) are listed in [Deployed Contracts](#deployed-contracts) below.

---

## Why Creditcoin-Native

This project is not ported from another chain. Every design decision maps directly to Creditcoin's native cross-chain verification capability.

| Problem | Generic approach | Creditcoin-native approach |
|---|---|---|
| Verify collateral on another chain | Centralized oracle or bridge | Attestcoin Protocol proof — trustless, no relayer |
| Confirm node identity cross-chain | Manual off-chain verification | On-chain USC proof from Sepolia NodeRegistry |
| Loan disbursement trigger | Admin multisig | Automatic on proof submission to SpaceFinance |
| Cross-chain data integrity | Bridge with trust assumptions | Native CC3 verifier precompile (`0x...0FD2`) |
| Collateral release after repayment | Admin multisig on the destination chain | Automatic, via the USC **write-ability** layer (CC3 → Sepolia) |

---

## Architecture
<img width="1101" alt="SpaceFinance architecture: bidirectional Sepolia <-> Creditcoin CC3 flow via USC and the write-ability layer" src="assets/architecture.png" />

---

## Core Features

### Trustless Cross-Chain Collateral Verification
Borrowers deposit ETH into `CollateralVault` on Sepolia. The Attestcoin Protocol generates a cryptographic proof of the deposit event, which is submitted to `SpaceFinance` on CC3 — no bridge, no oracle operator.

### Node Identity Verification
DePIN node operators register on Sepolia's `NodeRegistry`. The same USC proof mechanism verifies node identity on CC3, ensuring only legitimate operators receive financing.

### Automatic Loan Disbursement
Once both proofs are verified on-chain, `SpaceFinance` automatically updates loan status to `Active` and disburses mUSDF to the borrower — fully trustless and permissionless.

### Automated Collateral Release — USC Write-Ability Layer (CC3 → Sepolia)
USC's proof mechanism above is one-directional: it can prove a Sepolia event *into* CC3, but not the reverse. That meant the last step of every loan — releasing the Sepolia collateral once a borrower fully repaid on CC3 — needed a manual admin call (`CollateralVault.authorizeWithdrawal`). SpaceFinance closes that loop using the **USC write-ability layer** (`@gluwa/usc-contracts`'s `Outbox`/`Inbox`/`EOAValidator` contracts), giving it a genuine bidirectional cross-chain flow:

```
CC3                                                  Sepolia
────                                                 ───────
SpaceFinance.repay()
  └─ loan fully repaid
       └─ Outbox.publishMessage(loanId, borrower)
                │
                │  attestor quorum signs the message hash
                ▼
                                        Inbox.deliverMessage(...)
                                          └─ EOAValidator checks signatures
                                          └─ CollateralVault.receiveMessage(...)
                                               └─ auto-authorizes the withdrawal
                                                    (no admin step)
```

`SpaceFinance.registerOutbox()` and `CollateralVault`'s trusted-inbox/trusted-emitter wiring make this opt-in and backward compatible — `repay()`/`markRepaid()` behave exactly as before if no `Outbox` is registered, and `authorizeWithdrawal` remains as a manual fallback.

**Honest disclosure on what's mocked and what isn't:** the `Outbox`, `Inbox`, `EOAValidator`, and `AttestorRegistry` contracts deployed above are the genuine, unmodified write-ability contracts from `@gluwa/usc-contracts@0.2.0` — no custom fork, no simplified reimplementation. The only mocked piece is the *attestor identity*: instead of a production USC attestor network, three freshly generated test EOAs stand in as the signing quorum, and `MockCoreFeeProvider` stands in for the Creditcoin-native `get_core_fee` precompile (returns a flat zero fee, so the ATTEST fee-custody path is simply unused rather than faked).

The signing + delivery step itself runs two ways: in production, `spacefi.vercel.app`'s `frontend/src/app/api/relay` Vercel serverless function triggers automatically the moment a borrower's `repay()` confirms (via `frontend/src/lib/useAutoRelay.ts`) — the borrower never sees or does anything extra. `contracts/scripts/relayer/relay-repayment.ts` is the same logic as a standalone CLI script, kept for local development and manual/offline testing (e.g. running the contracts test suite against a testnet without the frontend deployed). Both re-derive the message to sign strictly from on-chain events — neither ever trusts a caller-supplied payload — so the relay endpoint is safe to leave permissionless.

This has been run end-to-end on the real CC3 testnet + Sepolia, through the actual live frontend — a real `repay()` → real `Outbox.publishMessage` → the serverless relayer signing and calling `Inbox.deliverMessage` → real automatic `withdraw()`, not just a local simulation.

---

## Deployed Contracts

**Ethereum Sepolia (11155111)**

| Contract | Address |
|---|---|
| CollateralVault | [0x984a87770ff3F8D978704eEe9ae5A0DBBaB8125E](https://sepolia.etherscan.io/address/0x984a87770ff3F8D978704eEe9ae5A0DBBaB8125E) |
| NodeRegistry | [0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3](https://sepolia.etherscan.io/address/0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3) |

**Creditcoin CC3 Testnet (102031)**

| Contract | Address |
|---|---|
| SpaceFinance | [0x4Ee3fda05549955494184b28198210A427013760](https://creditcoin-testnet.blockscout.com/address/0x4Ee3fda05549955494184b28198210A427013760) |
| MockPayoutToken (mUSDF) | [0xbc7d2C3dafF757D47AF8f4Eb305A16A1e55feb3D](https://creditcoin-testnet.blockscout.com/address/0xbc7d2C3dafF757D47AF8f4Eb305A16A1e55feb3D) |
| GuildPool | [0x9d56b68c55f044d493FD0AE0a0a2Bc6aEE9cE9d1](https://creditcoin-testnet.blockscout.com/address/0x9d56b68c55f044d493FD0AE0a0a2Bc6aEE9cE9d1) |
| EvmV1Decoder (lib) | [0x717b7e01f2805E330586dD5e09c5221821Afe5Cb](https://creditcoin-testnet.blockscout.com/address/0x717b7e01f2805E330586dD5e09c5221821Afe5Cb) |

### USC Write-Ability Layer (CC3 → Sepolia)

**Creditcoin CC3 Testnet (102031)**

| Contract | Address | Role |
|---|---|---|
| Outbox | [0x556e1cA65a003b1ffce58eDd14CE3c0c6F520137](https://creditcoin-testnet.blockscout.com/address/0x556e1cA65a003b1ffce58eDd14CE3c0c6F520137) | `SpaceFinance.repay()` publishes here |
| FeeRegistry | [0x72DFfEEcfcBdD249Dae5A7b6a753f5D897199950](https://creditcoin-testnet.blockscout.com/address/0x72DFfEEcfcBdD249Dae5A7b6a753f5D897199950) | Reads core fee from MockCoreFeeProvider |
| MockCoreFeeProvider | [0x84a9367612F6083e71fdf266B932CbbB8dB04F2d](https://creditcoin-testnet.blockscout.com/address/0x84a9367612F6083e71fdf266B932CbbB8dB04F2d) | Stub for the Creditcoin `get_core_fee` precompile (returns 0) |
| AttestorVault | [0x8Bf9F918C7ab80e195D2bFe51a14823c4548E108](https://creditcoin-testnet.blockscout.com/address/0x8Bf9F918C7ab80e195D2bFe51a14823c4548E108) | Fee custody (unused — core fee is 0) |
| MockAttestToken | [0x2fF53637e0446123390A6eDabB5c7ec942d462F6](https://creditcoin-testnet.blockscout.com/address/0x2fF53637e0446123390A6eDabB5c7ec942d462F6) | Placeholder ATTEST token |

**Ethereum Sepolia (11155111)**

| Contract | Address | Role |
|---|---|---|
| Inbox | [0xa97075b19fda8c58728956323A3433ba8438b3fd](https://sepolia.etherscan.io/address/0xa97075b19fda8c58728956323A3433ba8438b3fd) | Delivers messages to `CollateralVault` |
| EOAValidator | [0xE38b8d44C849792A8B7ebcec7971b9bb0067B5d1](https://sepolia.etherscan.io/address/0xE38b8d44C849792A8B7ebcec7971b9bb0067B5d1) | Verifies the mock attestor quorum (3-of-3) |
| AttestorRegistry | [0x6a888F55Db13cF949390D85ecFAF2C01fB66Fcfe](https://sepolia.etherscan.io/address/0x6a888F55Db13cF949390D85ecFAF2C01fB66Fcfe) | Holds the mock attestor address set |

See [Automated Collateral Release](#automated-collateral-release--usc-write-ability-layer-cc3--sepolia) above for what's real vs. mocked in this layer.

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
| `MOCK_ATTESTOR_ADDRESSES` | 3+ comma-separated test EOA addresses standing in for a USC attestor network (write-ability layer only) |
| `MOCK_ATTESTOR_PRIVATE_KEYS` | Matching private keys, used off-chain by the relayer script to sign — never real funds, never reuse `PRIVATE_KEY` |

```bash
# 3. Compile
npx hardhat compile

# 4. Deploy to Sepolia
npx hardhat run scripts/deploy-sepolia.ts --network sepolia

# 5. Deploy to CC3 Testnet
npx hardhat run scripts/deploy-cc3.ts --network cc3_testnet

# 6. Run end-to-end flow (deposit -> proofs -> Active -> disburse)
npx hardhat run scripts/e2e.ts --network cc3_testnet

# 7. Deploy the USC write-ability layer (CC3 side, then Sepolia side)
npx hardhat run scripts/deploy-cc3-writeability.ts --network cc3_testnet
npx hardhat run scripts/deploy-sepolia-writeability.ts --network sepolia

# 8. On the live frontend (spacefi.vercel.app), step 8 happens automatically: the moment a
#    borrower's repay() confirms, the app calls a Vercel serverless function (/api/relay) that
#    signs and delivers the message to Sepolia — no extra step for the borrower.
#    For local development / testing without the frontend deployed, run the same logic manually:
npx hardhat run scripts/relayer/relay-repayment.ts
```

---

## Testing

75 automated Hardhat tests: 70 covering the 4 core contracts (CollateralVault, NodeRegistry, SpaceFinance, GuildPool) — edge cases, access control, USC mock verification — plus 5 covering the write-ability layer end-to-end (repay → publish → sign → deliver → auto-authorize → withdraw, including rejection of an under-signed or tampered delivery).

```bash
cd contracts && npx hardhat test
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

**Write-ability message hash & signature format**
`Inbox.deliverMessage` hashes `abi.encode(messageId, emitterAddress, localChainKey, creditcoinChainId, payload)` and expects each attestor signature to be a raw `ecrecover`-style 65-byte `(r,s,v)` signature over that hash directly — no EIP-191/`personal_sign` prefix. `Outbox`'s `MessagePublished` event also packs `emitterAddress` as `bytes32(bytes20(emitter))`, which zero-pads on the *right* (the address occupies the first 20 bytes), unlike the usual right-aligned `address`-as-`bytes32` topic encoding — decoding it the normal way silently recovers the wrong address. Both are handled in `scripts/utils/mockAttestor.ts`.

**`usc-write-ability` package alias**
`@gluwa/usc-contracts@0.2.0`'s write-ability contracts (`Outbox`/`Inbox`/`EOAValidator`/...) aren't compatible with the `0.1.2` version this project already depends on for the read-path (`EvmV1Decoder`, `decodeReceiptFields`) — v0.2.0's published package no longer includes the `contracts/decoding/**` files v0.1.2 does. Both versions are installed side by side via a Yarn/npm package alias (`usc-write-ability` → `npm:@gluwa/usc-contracts@0.2.0`) so neither path is disturbed.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.30 |
| Development | Hardhat + ethers.js v6 |
| Cross-chain (Sepolia → CC3) | Creditcoin Attestcoin Protocol (USC) |
| Cross-chain (CC3 → Sepolia) | USC write-ability layer (`@gluwa/usc-contracts@0.2.0`: Outbox/Inbox/EOAValidator) |
| Proof generation | `@gluwa/usc-sdk` ProofBuilder |
| Testnet token | mUSDF ([`0xbc7d...eb3D`](https://creditcoin-testnet.blockscout.com/address/0xbc7d2C3dafF757D47AF8f4Eb305A16A1e55feb3D)) |

---

## Roadmap

**✅ M1 — Core Protocol (completed)**
- CollateralVault and NodeRegistry on Sepolia
- SpaceFinance with Attestcoin proof verification on CC3
- Full e2e: deposit → register → prove → Active → disburse

**✅ M1.5 — Write-Ability Layer (completed)**
- `SpaceFinance.repay()`/`markRepaid()` auto-publish via `Outbox`
- `CollateralVault` auto-authorizes withdrawal via `Inbox`/`MessageReceiverBase` — no admin step
- Removes the Phase 1 limitation of a manual, admin-gated collateral release
- Attestor *identity* is mocked (test EOAs); contract logic is the real, unmodified write-ability layer
- Signing + delivery runs automatically via a Vercel serverless function (`/api/relay`), triggered the moment `repay()` confirms — no CLI script needed in production
- Write-ability relay status ("Relaying repayment to Sepolia...", "Withdrawal authorized", ...) surfaced live to borrowers on `/apply` and `/dashboard`
- Manual `authorizeWithdrawal` admin path deliberately kept as a fallback, not removed — used only if the automated relay ever fails

**⬜ M2 — Advanced Risk Engine**
- Real revenue-based dynamic LTV (on-chain, not UI-layer)
- Multi-node batch borrowing support
- Guild pool auto-liquidation mechanism

**⬜ M3 — Mainnet**
- Deploy to CC3 Mainnet with real CTC collateral
- Integration with real DePIN node registry
- Batch verification for the write-ability layer (multiple repayments relayed per proof)
- Replace the mock attestor set with a production USC attestor network

---

## Developer

GitHub: [pplmaverick](https://github.com/pplmaverick)  
Wallet: `0xed2B5717c9b936ecC76d75401026A99143e278F5`

## License

MIT
