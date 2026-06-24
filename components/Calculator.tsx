'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Delete } from 'lucide-react'

interface CalculatorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: number) => void
  initialValue?: number
}

export default function Calculator({ isOpen, onClose, onConfirm, initialValue }: CalculatorProps) {
  const [display, setDisplay] = useState(initialValue?.toString() || '0')
  const [operator, setOperator] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState<number | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)

  const handleDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit)
      setWaitingForOperand(false)
    } else {
      setDisplay(prev => prev === '0' ? digit : prev + digit)
    }
  }, [waitingForOperand])

  const handleDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }
    if (!display.includes('.')) {
      setDisplay(prev => prev + '.')
    }
  }, [display, waitingForOperand])

  const calculate = useCallback((a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '×': return a * b
      case '÷': return b !== 0 ? a / b : 0
      default: return b
    }
  }, [])

  const handleOperator = useCallback((nextOp: string) => {
    const current = parseFloat(display)

    if (prevValue !== null && operator && !waitingForOperand) {
      const result = calculate(prevValue, current, operator)
      setDisplay(String(Math.round(result * 100) / 100))
      setPrevValue(result)
    } else {
      setPrevValue(current)
    }

    setOperator(nextOp)
    setWaitingForOperand(true)
  }, [display, prevValue, operator, waitingForOperand, calculate])

  const handleEquals = useCallback(() => {
    const current = parseFloat(display)
    if (prevValue !== null && operator) {
      const result = calculate(prevValue, current, operator)
      setDisplay(String(Math.round(result * 100) / 100))
      setPrevValue(null)
      setOperator(null)
      setWaitingForOperand(true)
    }
  }, [display, prevValue, operator, calculate])

  const handleClear = useCallback(() => {
    setDisplay('0')
    setOperator(null)
    setPrevValue(null)
    setWaitingForOperand(false)
  }, [])

  const handleBackspace = useCallback(() => {
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0')
  }, [])

  const handleConfirm = useCallback(() => {
    const value = parseFloat(display)
    if (!isNaN(value) && value > 0) {
      onConfirm(value)
    }
  }, [display, onConfirm])

  const buttons = [
    ['C', '⌫', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Calculator Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md glass rounded-t-3xl p-6 safe-bottom"
          >
            {/* Display */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={onClose} className="p-2 text-muted">
                <X className="w-5 h-5" strokeWidth={1} />
              </button>
              <div className="text-right flex-1 mx-4">
                {operator && prevValue !== null && (
                  <p className="text-xs text-muted font-extralight">
                    {prevValue} {operator}
                  </p>
                )}
                <p className="text-3xl font-extralight tracking-wide">
                  {display}
                </p>
              </div>
              <button
                onClick={handleConfirm}
                className="p-2.5 bg-income/20 text-income rounded-full"
              >
                <Check className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Buttons Grid */}
            <div className="grid grid-cols-4 gap-2">
              {buttons.flat().map((btn, i) => {
                const isOperator = ['+', '-', '×', '÷'].includes(btn)
                const isEquals = btn === '='
                const isSpecial = btn === 'C' || btn === '⌫'
                const isZero = btn === '0'

                return (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => {
                      if (btn === 'C') handleClear()
                      else if (btn === '⌫') handleBackspace()
                      else if (btn === '.') handleDecimal()
                      else if (btn === '=') handleEquals()
                      else if (isOperator) handleOperator(btn)
                      else handleDigit(btn)
                    }}
                    className={`h-14 rounded-2xl text-lg font-light transition-smooth ${
                      isOperator
                        ? 'bg-foreground/10 text-foreground'
                        : isEquals
                        ? 'bg-income text-white'
                        : isSpecial
                        ? 'bg-foreground/5 text-muted'
                        : 'bg-foreground/[0.03] text-foreground active:bg-foreground/10'
                    } ${isZero ? 'col-span-2' : ''}`}
                  >
                    {btn === '⌫' ? <Delete className="w-5 h-5 mx-auto" strokeWidth={1} /> : btn}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
