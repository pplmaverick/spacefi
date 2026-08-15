import { createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors/injected'
import { metaMask } from 'wagmi/connectors/metaMask'
import { cc3Testnet } from './chains'

export const config = createConfig({
  chains: [sepolia, cc3Testnet],
  connectors: [
    injected(),
    metaMask({
      dappMetadata: {
        name: 'SpaceFinance',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://spacefinance.app',
      },
    }),
  ],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [cc3Testnet.id]: http(process.env.NEXT_PUBLIC_CC3_TESTNET_RPC_URL),
  },
})
