import { createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors/injected'
import { cc3Testnet } from './chains'

export const config = createConfig({
  ssr: true,
  chains: [sepolia, cc3Testnet],
  connectors: [
    injected(),
  ],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [cc3Testnet.id]: http(process.env.NEXT_PUBLIC_CC3_TESTNET_RPC_URL),
  },
})
