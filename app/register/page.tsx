'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabaseClient'
import { createDefaultWallet } from '@/lib/wallets'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (password.length < 6) {
      setError('La password deve contenere almeno 6 caratteri')
      return
    }
    
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message === 'User already registered' ? 'Utente già registrato' : error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await createDefaultWallet(data.user.id)
      router.push('/onboarding')
      router.refresh()
    }
  }

  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-10"
      >
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-[10px] tracking-[0.4em] uppercase text-muted font-light">Finanze</h1>
          <p className="text-[9px] tracking-widest uppercase text-muted/50">Crea il tuo account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@email.com"
                required
                className="w-full bg-transparent border-b border-border/30 py-2.5 text-base font-light text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg t"
              />
            </div>
            <div>
              <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-transparent border-b border-border/30 py-2.5 text-base font-light text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg t"
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-expense font-light text-center"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-fg text-bg rounded-xl text-xs tracking-wider uppercase font-medium hover:opacity-90 t disabled:opacity-40 cursor-pointer"
          >
            {loading ? 'Registrazione...' : 'Registrati'}
          </motion.button>
        </form>

        {/* Login link */}
        <p className="text-center text-xs text-muted font-light">
          Hai già un account?{' '}
          <Link href="/login" className="text-fg hover:underline t">
            Accedi
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
