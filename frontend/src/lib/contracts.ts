import { parseAbi } from 'viem'

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
  guildPool: {
    address: process.env.NEXT_PUBLIC_GUILD_POOL as `0x${string}`,
    chainId: 102031,
  },
}

export const COLLATERAL_VAULT_ABI = parseAbi([
  'function deposit() external payable returns (uint256 loanId)',
  'function withdraw(uint256 loanId) external',
  'function authorizeWithdrawal(uint256 loanId) external',
  'function getDeposit(uint256 loanId) external view returns (address borrower, uint256 amount, uint256 usdValue, bool withdrawn)',
  'function deposits(uint256 loanId) external view returns (address borrower, uint256 amount, uint256 usdValue, bool withdrawn)',
  'function getUsdValue(uint256 loanId) external view returns (uint256)',
  'event Deposited(address indexed borrower, uint256 loanId, uint256 amount, uint256 usdValue)',
])

export const NODE_REGISTRY_ABI = parseAbi([
  'function approveNode(address operator, bytes32 nodeId) external',
  'function registerNode(bytes32 nodeId) external',
  'function isNodeRegistered(bytes32 nodeId) external view returns (bool)',
  'function approvedOperators(address operator, bytes32 nodeId) external view returns (bool)',
  'event NodeRegistered(address indexed operator, bytes32 indexed nodeId)',
  'event NodeApproved(address indexed operator, bytes32 indexed nodeId)',
])

export const SPACE_FINANCE_ABI = parseAbi([
  'struct MerkleProofEntry { bytes32 hash; bool isLeft; }',
  'function execute(uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, MerkleProofEntry[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) external',
  'function repay(uint256 loanId, uint256 amount) external',
  'function markRepaid(uint256 loanId) external',
  'function getLoan(uint256 loanId) external view returns (address borrower, uint256 collateralAmount, uint256 usdValue, bytes32 nodeId, uint8 status, uint256 repaidAmount)',
  'function getLoansByBorrower(address borrower) external view returns (uint256[])',
  'function loanAmount() external view returns (uint256)',
  'event LoanRepaid(uint256 indexed loanId, address indexed borrower)',
  'event PartialRepayment(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 totalRepaid)',
])

export const MOCK_PAYOUT_TOKEN_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function mint(address to, uint256 amount) external',
])

export const GUILD_POOL_ABI = parseAbi([
  'function createGuild(address[5] calldata members) external',
  'function approveGuildMember(uint256 guildId, address member) external',
  'function joinGuild(uint256 guildId) external',
  'function freezeGuild(uint256 guildId, address defaulter) external',
  'function isGuildMember(address member) external view returns (bool)',
  'function isGuildFrozen(address member) external view returns (bool)',
  'function getGuild(uint256 guildId) external view returns (address[5] members, bool[5] approved, bool frozen, uint256 memberCount)',
  'function memberToGuildId(address member) external view returns (uint256)',
  'event GuildCreated(uint256 indexed guildId, address indexed creator)',
  'event MemberApproved(uint256 indexed guildId, address indexed member)',
  'event MemberJoined(uint256 indexed guildId, address indexed member)',
  'event GuildFrozen(uint256 indexed guildId, address indexed defaulter)',
])

export const LOAN_STATUS = [
  'None',
  'CollateralVerified',
  'NodeVerified',
  'Active',
  'Repaid',
  'Withdrawn',
] as const
