'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { useEffect } from 'react'

export default function OnboardingPage() {
  const router = useRouter()
  
  useEffect(() => {
    localStorage.setItem('onboarding_completed', 'true')
  }, [])

  return (
    <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-fg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-12"
      >
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-thin tracking-tight">Benvenuto in Finanze!</h1>
          <p className="text-muted font-light">
            Il tuo nuovo strumento personale per gestire le spese in modo semplice ed elegante.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-surface rounded-3xl p-8 border border-border/5 space-y-5"
        >
          <div className="flex items-center gap-3">
            <div className="bg-income/10 p-2.5 rounded-full">
              <Info className="w-6 h-6 text-income" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-light">Cosa sono i Portafogli?</h2>
          </div>
          
          <div className="space-y-4 text-sm font-light text-muted leading-relaxed">
            <p>
              I portafogli ti permettono di separare i tuoi soldi in diversi contenitori 
              (es. Contanti, Conto in Banca, Risparmi).
            </p>
            <p>
              Ogni transazione viene associata a un portafoglio per sapere esattamente 
              dove si trovano i tuoi soldi.
            </p>
            <p className="text-muted/60">
              Se non ti serve questa funzionalità, puoi semplicemente ignorarla e 
              usare il portafoglio predefinito.
            </p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 pt-4"
        >
          <button
            onClick={() => router.push('/dashboard/wallets')}
            className="flex-1 py-4 bg-surface border border-border/20 text-fg rounded-2xl text-xs tracking-wider uppercase font-medium hover:bg-elevated t cursor-pointer"
          >
            Configura i Portafogli
          </button>
          
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 py-4 bg-fg text-bg rounded-2xl text-xs tracking-wider uppercase font-medium hover:opacity-90 t cursor-pointer"
          >
            Inizia Subito
          </button>
        </motion.div>
      </motion.div>
    </div>
  )
}
