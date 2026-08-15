export const CONTRACTS = {
  collateralVault: {
    address: process.env.NEXT_PUBLIC_COLLATERAL_VAULT as `0x${string}`,
    chainId: 11155111,
  },
  nodeRegistry: {
    address: process.env.NEXT_PUBLIC_NODE_REGISTRY as `0x${string}`,
    chainId: 11155111,
  },
  spaceFinance: {
    address: process.env.NEXT_PUBLIC_SPACE_FINANCE as `0x${string}`,
    chainId: 102031,
  },
  mockPayoutToken: {
    address: process.env.NEXT_PUBLIC_MOCK_PAYOUT_TOKEN as `0x${string}`,
    chainId: 102031,
  },
}

export const COLLATERAL_VAULT_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [{ type: 'uint256', name: 'loanId' }] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256', name: 'loanId' }], outputs: [] },
  { name: 'getDeposit', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'loanId' }], outputs: [{ type: 'tuple', components: [{ type: 'address', name: 'borrower' }, { type: 'uint256', name: 'amount' }, { type: 'bool', name: 'withdrawn' }] }] },
  { type: 'event', name: 'Deposited', inputs: [{ type: 'address', name: 'borrower', indexed: true }, { type: 'uint256', name: 'amount' }, { type: 'uint256', name: 'loanId', indexed: true }] },
] as const

export const NODE_REGISTRY_ABI = [
  { name: 'registerNode', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32', name: 'nodeId' }], outputs: [] },
  { name: 'isNodeRegistered', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32', name: 'nodeId' }], outputs: [{ type: 'bool' }] },
  { name: 'operatorNodeId', type: 'function', stateMutability: 'view', inputs: [{ type: 'address', name: 'operator' }], outputs: [{ type: 'bytes32' }] },
  { type: 'event', name: 'NodeRegistered', inputs: [{ type: 'address', name: 'operator', indexed: true }, { type: 'bytes32', name: 'nodeId', indexed: true }] },
] as const

export const SPACE_FINANCE_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint8', name: 'action' },
      { type: 'uint64', name: 'chainKey' },
      { type: 'uint64', name: 'blockHeight' },
      { type: 'bytes', name: 'encodedTransaction' },
      { type: 'bytes32', name: 'merkleRoot' },
      { type: 'tuple[]', name: 'siblings', components: [{ type: 'bool', name: 'isLeft' }, { type: 'bytes32', name: 'hash' }] },
      { type: 'bytes32', name: 'lowerEndpointDigest' },
      { type: 'bytes32[]', name: 'continuityRoots' },
    ],
    outputs: [{ type: 'bool' }],
  },
  { name: 'getLoan', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256', name: 'loanId' }], outputs: [{ type: 'tuple', components: [{ type: 'address', name: 'borrower' }, { type: 'uint256', name: 'collateralAmount' }, { type: 'bytes32', name: 'nodeId' }, { type: 'uint8', name: 'status' }] }] },
  { name: 'borrowerToLoanId', type: 'function', stateMutability: 'view', inputs: [{ type: 'address', name: 'borrower' }], outputs: [{ type: 'uint256' }] },
] as const

export const LOAN_STATUS = ['None', 'CollateralVerified', 'NodeVerified', 'Active', 'Repaid'] as const
