'use client'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

export function WalletButton({ requiredChainId }: { requiredChainId?: number }) {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition-colors font-medium font-mono"
      >
        Connect Wallet
      </button>
    )
  }

  const shortAddress = `${address?.slice(0, 6)}...${address?.slice(-4)}`
  const chainName = chainId === sepolia.id ? 'Sepolia' : chainId === cc3Testnet.id ? 'CC3 Testnet' : `Chain ${chainId}`
  const isWrongChain = requiredChainId !== undefined && chainId !== requiredChainId
  const targetChainName = requiredChainId === sepolia.id ? 'Sepolia' : 'CC3 Testnet'

  return (
    <div className="flex items-center gap-2">
      {isWrongChain && (
        <button
          onClick={() => switchChain({ chainId: requiredChainId! })}
          className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors"
        >
          Switch to {targetChainName}
        </button>
      )}
      <span className="text-sm text-gray-400 font-mono">{chainName}</span>
      <span className="px-3 py-1.5 bg-gray-800 text-gray-100 text-sm rounded-lg font-mono">{shortAddress}</span>
      <button
        onClick={() => disconnect()}
        className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition-colors"
      >
        Disconnect
      </button>
    </div>
  )
}
