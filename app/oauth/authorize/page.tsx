'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabaseClient'

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <Consent />
    </Suspense>
  )
}

function Consent() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<'checking' | 'ready' | 'submitting' | 'error'>('checking')
  const [error, setError] = useState('')

  const clientId = params.get('client_id') || ''
  const redirectUri = params.get('redirect_uri') || ''
  const state = params.get('state') || ''
  const codeChallenge = params.get('code_challenge') || ''
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256'

  useEffect(() => {
    if (!clientId || !redirectUri || !codeChallenge) {
      setError('Richiesta di autorizzazione non valida: parametri mancanti.')
      setStatus('error')
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        const next = `/oauth/authorize?${params.toString()}`
        router.replace(`/login?next=${encodeURIComponent(next)}`)
        return
      }
      setStatus('ready')
    })
  }, [clientId, redirectUri, codeChallenge]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDecision(allow: boolean) {
    if (!allow) {
      const redirect = new URL(redirectUri)
      redirect.searchParams.set('error', 'access_denied')
      if (state) redirect.searchParams.set('state', state)
      window.location.href = redirect.toString()
      return
    }

    setStatus('submitting')
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setError('Sessione scaduta, effettua di nuovo il login.')
      setStatus('error')
      return
    }

    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        supabase_access_token: data.session.access_token,
        supabase_refresh_token: data.session.refresh_token,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error_description || body.error || 'Autorizzazione fallita.')
      setStatus('error')
      return
    }

    const { redirect_url } = await res.json()
    window.location.href = redirect_url
  }

  let redirectHost = redirectUri
  try {
    redirectHost = new URL(redirectUri).hostname
  } catch {
    // leave as-is
  }

  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8 text-center"
      >
        <div className="space-y-1">
          <h1 className="text-[10px] tracking-[0.4em] uppercase text-muted font-light">Finanze</h1>
          <p className="text-[9px] tracking-widest uppercase text-muted/50">Autorizza accesso esterno</p>
        </div>

        {status === 'checking' && <p className="text-sm text-muted font-light">Verifica sessione...</p>}

        {status === 'error' && (
          <p className="text-xs text-expense font-light">{error}</p>
        )}

        {(status === 'ready' || status === 'submitting') && (
          <>
            <p className="text-sm text-fg font-light leading-relaxed">
              <span className="font-medium">{redirectHost}</span> richiede accesso in <strong>sola lettura</strong> ai
              tuoi dati finanziari (portafogli, saldi, transazioni). Nessuna modifica potrà essere effettuata.
            </p>
            <div className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={status === 'submitting'}
                onClick={() => handleDecision(true)}
                className="w-full py-3 bg-fg text-bg rounded-full text-xs tracking-wider uppercase font-medium hover:opacity-90 t disabled:opacity-40 cursor-pointer"
              >
                {status === 'submitting' ? 'Autorizzazione...' : 'Consenti'}
              </motion.button>
              <button
                disabled={status === 'submitting'}
                onClick={() => handleDecision(false)}
                className="w-full py-3 rounded-full text-xs tracking-wider uppercase font-medium text-muted hover:text-fg t disabled:opacity-40 cursor-pointer"
              >
                Nega
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
