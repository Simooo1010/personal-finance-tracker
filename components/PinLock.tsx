'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { verifyPin } from '@/app/actions'
import { Delete, Lock } from 'lucide-react'

interface PinLockProps {
  onSuccess: () => void
}

export default function PinLock({ onSuccess }: PinLockProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDigit = useCallback((digit: string) => {
    if (pin.length >= 6) return
    const newPin = pin + digit
    setPin(newPin)
    setError(false)

    if (newPin.length >= 6) {
      // Auto-submit when 6 digits entered
      setLoading(true)
      verifyPin(newPin).then((success) => {
        if (success) {
          onSuccess()
        } else {
          setError(true)
          setPin('')
          setLoading(false)
        }
      })
    }
  }, [pin, onSuccess])

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(false)
  }, [])

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50 safe-top safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-8 w-full max-w-xs px-4"
      >
        {/* Lock Icon */}
        <motion.div
          animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <Lock className="w-10 h-10 text-foreground opacity-40" strokeWidth={1} />
        </motion.div>

        {/* Title */}
        <p className="text-foreground/60 text-sm font-extralight tracking-[0.2em] uppercase">
          Inserisci PIN
        </p>

        {/* PIN Dots */}
        <div className="flex gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              className={`w-3 h-3 rounded-full border transition-smooth ${
                error
                  ? 'bg-expense border-expense'
                  : pin.length > i
                  ? 'bg-foreground border-foreground'
                  : 'border-foreground/20'
              }`}
              animate={error && pin.length === 0 ? { scale: [1, 1.3, 1] } : {}}
              transition={{ delay: i * 0.05 }}
            />
          ))}
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-expense text-xs font-extralight tracking-wider"
            >
              PIN non corretto
            </motion.p>
          )}
        </AnimatePresence>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 w-full mt-4">
          {digits.map((digit, idx) => {
            if (digit === '') return <div key={idx} />
            if (digit === 'del') {
              return (
                <button
                  key={idx}
                  onClick={handleDelete}
                  className="flex items-center justify-center h-16 rounded-2xl text-foreground/60 active:bg-foreground/5 transition-smooth"
                >
                  <Delete className="w-6 h-6" strokeWidth={1} />
                </button>
              )
            }
            return (
              <motion.button
                key={idx}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleDigit(digit)}
                disabled={loading}
                className="flex items-center justify-center h-16 rounded-2xl text-2xl font-extralight text-foreground active:bg-foreground/5 transition-smooth"
              >
                {digit}
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
