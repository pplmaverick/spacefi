import { defineChain } from 'viem'

export const cc3Testnet = defineChain({
  id: 102031,
  name: 'Creditcoin CC3 Testnet',
  nativeCurrency: { name: 'CTC', symbol: 'CTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://cc3-testnet.blockscout.com' },
  },
})

export const cc3Mainnet = defineChain({
  id: 102030,
  name: 'Creditcoin CC3',
  nativeCurrency: { name: 'CTC', symbol: 'CTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet3.creditcoin.network'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://creditcoin.blockscout.com' },
  },
})
