'use client'
import { useEffect, useRef, useState } from 'react'

export type AutoRelayStatus = 'idle' | 'relaying' | 'relayed' | 'already-relayed' | 'error'

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 20_000

/**
 * Once a loan is Repaid (status 4) but Sepolia hasn't authorized the withdrawal yet, POSTs to
 * /api/relay to trigger the USC write-ability relay (sign + deliver the message SpaceFinance
 * already published) — so the borrower never has to wait on an admin or click anything extra.
 * `isAuthorized`'s own polling (wagmi `refetchInterval`) is what actually notices the result;
 * this hook only needs to fire the relay attempt, with a few retries if the endpoint errors
 * (e.g. transient RPC hiccup) or a real user reloads onto an already-Repaid-but-unrelayed loan.
 */
export function useAutoRelay(params: {
  loanId: string | bigint | undefined
  loanStatus: number | undefined
  isAuthorized: boolean | undefined
  isWithdrawn: boolean | undefined
}) {
  const { loanId, loanStatus, isAuthorized, isWithdrawn } = params
  const [status, setStatus] = useState<AutoRelayStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const shouldRelay =
      loanId !== undefined && loanStatus === 4 && isAuthorized === false && !isWithdrawn && attempt < MAX_ATTEMPTS
    if (!shouldRelay || inFlightRef.current) return

    inFlightRef.current = true
    setStatus('relaying')
    setError(null)

    fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loanId: loanId.toString() }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Relay request failed (${res.status})`)
        setStatus(data.status === 'already-delivered' ? 'already-relayed' : 'relayed')
      })
      .catch((e) => {
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
        setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY_MS)
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [loanId, loanStatus, isAuthorized, isWithdrawn, attempt])

  return { status, error }
}
