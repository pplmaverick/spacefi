'use client'
import { useState } from 'react'
import { useAccount, useConnect, useConnectors, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { cc3Testnet } from '@/lib/chains'

export function WalletButton({ requiredChainId }: { requiredChainId?: number }) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!isConnected) {
    // useConnectors() reflects the live EIP-6963 announcements from whatever wallet
    // extensions are actually installed — each carries its own real name/uid/icon,
    // so we render exactly what the browser broadcasts instead of guessing identity.
    // Phantom is excluded: it's a Solana-first wallet whose EVM support isn't a fit here.
    // The untargeted `injected()` fallback (id 'injected') exists in wagmi.ts purely for
    // browsers with no EIP-6963 wallets — once a real EIP-6963 wallet is present, showing
    // it too just invites clicking into whichever extension happens to hold window.ethereum.
    const hasEip6963Wallet = connectors.some((connector) => connector.id !== 'injected')
    const uniqueConnectors = connectors.filter(
      (connector, i) =>
        !connector.name.toLowerCase().includes('phantom') &&
        connectors.findIndex((c) => c.name === connector.name) === i &&
        (!hasEip6963Wallet || connector.id !== 'injected')
    )

    return (
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition-colors font-medium font-mono"
        >
          Connect Wallet
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-52 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
              {uniqueConnectors.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 font-mono">No wallet detected</div>
              )}
              {uniqueConnectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector })
                    setMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-100 hover:bg-gray-800 transition-colors font-mono flex items-center gap-2"
                >
                  {connector.icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={connector.icon} alt="" className="w-4 h-4 rounded-sm" />
                  )}
                  {connector.id === 'injected' ? 'Browser Wallet' : connector.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
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
