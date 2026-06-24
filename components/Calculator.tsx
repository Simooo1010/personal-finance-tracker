'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Delete } from 'lucide-react'

interface CalculatorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: number) => void
  initialValue?: number
}

// Helper to tokenize math expressions safely
const tokenize = (str: string): string[] => {
  const tokens: string[] = []
  let i = 0
  while (i < str.length) {
    const char = str[i]
    if (char === ' ') {
      i++
      continue
    }
    if ('+-*/()'.includes(char)) {
      tokens.push(char)
      i++
    } else if (/[0-9.]/.test(char)) {
      let num = ''
      while (i < str.length && /[0-9.]/.test(str[i])) {
        num += str[i]
        i++
      }
      tokens.push(num)
    } else {
      i++
    }
  }
  return tokens
}

// Helper to pre-process tokens for unary operators (e.g., -5 becomes 0 - 5)
const preprocessTokens = (tokens: string[]): string[] => {
  const result: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '-' || token === '+') {
      const isUnary = i === 0 || ['+', '-', '*', '/', '('].includes(tokens[i - 1])
      if (isUnary) {
        result.push('0')
      }
    }
    result.push(token)
  }
  return result
}

// Shunting-yard algorithm to evaluate RPN
const evaluateRPN = (tokens: string[]): number | null => {
  const queue: string[] = []
  const stack: string[] = []
  const precedence: Record<string, number> = {
    '+': 1, '-': 1,
    '*': 2, '/': 2
  }

  for (const token of tokens) {
    if (!isNaN(parseFloat(token))) {
      queue.push(token)
    } else if (token in precedence) {
      while (
        stack.length > 0 &&
        stack[stack.length - 1] !== '(' &&
        precedence[stack[stack.length - 1]] >= precedence[token]
      ) {
        queue.push(stack.pop()!)
      }
      stack.push(token)
    } else if (token === '(') {
      stack.push(token)
    } else if (token === ')') {
      while (stack.length > 0 && stack[stack.length - 1] !== '(') {
        queue.push(stack.pop()!)
      }
      if (stack.length === 0) return null // mismatched parenthesis
      stack.pop() // pop '('
    }
  }

  while (stack.length > 0) {
    const op = stack.pop()!
    if (op === '(' || op === ')') return null
    queue.push(op)
  }

  const evalStack: number[] = []
  for (const token of queue) {
    if (!isNaN(parseFloat(token))) {
      evalStack.push(parseFloat(token))
    } else {
      if (evalStack.length < 2) return null
      const b = evalStack.pop()!
      const a = evalStack.pop()!
      switch (token) {
        case '+': evalStack.push(a + b); break
        case '-': evalStack.push(a - b); break
        case '*': evalStack.push(a * b); break
        case '/': 
          if (b === 0) return null
          evalStack.push(a / b)
          break
      }
    }
  }

  if (evalStack.length !== 1) return null
  return evalStack[0]
}

const safeEval = (expr: string): number | null => {
  try {
    const clean = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/,/g, '.')
    const tokens = tokenize(clean)
    const processed = preprocessTokens(tokens)
    return evaluateRPN(processed)
  } catch (e) {
    return null
  }
}

export default function Calculator({ isOpen, onClose, onConfirm, initialValue }: CalculatorProps) {
  const [formula, setFormula] = useState('0')
  const [liveResult, setLiveResult] = useState<number | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  // Sync with initialValue when opening
  useEffect(() => {
    if (isOpen) {
      setFormula(initialValue?.toString() || '0')
      setWaitingForOperand(false)
    }
  }, [isOpen, initialValue])

  // Live evaluation as formula changes
  useEffect(() => {
    const res = safeEval(formula)
    setLiveResult(res)
  }, [formula])

  useEffect(() => {
    setMounted(true)
    setIsMobile(window.innerWidth < 640)
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleDigit = useCallback((digit: string) => {
    setFormula(prev => {
      if (waitingForOperand) {
        setWaitingForOperand(false)
        return digit
      }
      return prev === '0' ? digit : prev + digit
    })
  }, [waitingForOperand])

  const handleDecimal = useCallback(() => {
    setFormula(prev => {
      if (waitingForOperand) {
        setWaitingForOperand(false)
        return '0.'
      }
      // Simple validation: check if the last number already has a decimal
      const parts = prev.split(/[\+\-×÷\(\)\s]/)
      const lastPart = parts[parts.length - 1]
      if (lastPart.includes('.')) return prev
      return prev + '.'
    })
  }, [waitingForOperand])

  const handleOperator = useCallback((op: string) => {
    setWaitingForOperand(false)
    setFormula(prev => {
      // Replace last operator if typed consecutively (e.g. "50 + " -> "50 × ")
      const trimmed = prev.trim()
      if (trimmed.endsWith('+') || trimmed.endsWith('-') || trimmed.endsWith('×') || trimmed.endsWith('÷')) {
        const index = prev.lastIndexOf(trimmed.slice(-1))
        return prev.slice(0, index) + op + ' '
      }
      return prev === '0' && op === '-' ? '-' : prev + ' ' + op + ' '
    })
  }, [])

  const handleParenthesis = useCallback((paren: string) => {
    setWaitingForOperand(false)
    setFormula(prev => {
      if (prev === '0') return paren
      // Add spacing around parenthesis if helpful, or just append
      return prev + paren
    })
  }, [])

  const handleEquals = useCallback(() => {
    if (liveResult !== null) {
      setFormula(String(Math.round(liveResult * 10000) / 10000))
      setWaitingForOperand(true)
    }
  }, [liveResult])

  const handleClear = useCallback(() => {
    setFormula('0')
    setWaitingForOperand(false)
  }, [])

  const handleBackspace = useCallback(() => {
    setFormula(prev => {
      if (prev.length <= 1) return '0'
      // If it ends with spaces (operator padding), delete the operator and spacing
      if (prev.endsWith(' ')) {
        const trimmed = prev.trim()
        const lastChar = trimmed.slice(-1)
        const idx = prev.lastIndexOf(lastChar)
        return prev.slice(0, idx)
      }
      return prev.slice(0, -1)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const finalVal = liveResult !== null ? liveResult : parseFloat(formula)
    if (!isNaN(finalVal) && finalVal > 0) {
      onConfirm(finalVal)
    }
  }, [liveResult, formula, onConfirm])

  // Keypad rows: exactly 4 columns per row
  const buttons = [
    ['C', '(', ')', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '⌫', '='],
  ]

  if (!mounted) return null

  const panelVariants = {
    hidden: { y: isMobile ? '100%' : 20, opacity: isMobile ? 1 : 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: isMobile ? '100%' : 20, opacity: isMobile ? 0 : 0 }
  }

  const hasOperator = /[\+\-×÷]/.test(formula)

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Calculator Panel */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-surface rounded-t-[28px] sm:rounded-2xl p-6 safe-b border-t sm:border border-border/10 shadow-2xl"
          >
            {/* Display */}
            <div className="flex flex-col justify-end min-h-[90px] mb-6 px-2">
              <div className="flex items-center justify-between mb-2">
                <button onClick={onClose} className="p-1 text-muted hover:text-fg t">
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
                {/* Live Preview Result */}
                {liveResult !== null && hasOperator && (
                  <p className="text-sm text-muted font-normal tracking-wide animate-fade-in">
                    = {liveResult.toLocaleString('it-IT', { maximumFractionDigits: 4 })}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl font-thin tracking-wide text-fg break-words max-h-24 overflow-y-auto select-all">
                  {formula}
                </p>
              </div>
            </div>

            {/* Buttons Grid */}
            <div className="grid grid-cols-4 gap-2">
              {buttons.flat().map((btn, i) => {
                const isOperator = ['+', '-', '×', '÷'].includes(btn)
                const isEquals = btn === '='
                const isParenthesis = ['(', ')'].includes(btn)
                const isSpecial = btn === 'C' || btn === '⌫'

                return (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => {
                      if (btn === 'C') handleClear()
                      else if (btn === '⌫') handleBackspace()
                      else if (isParenthesis) handleParenthesis(btn)
                      else if (btn === '.') handleDecimal()
                      else if (btn === '=') handleEquals()
                      else if (isOperator) handleOperator(btn)
                      else handleDigit(btn)
                    }}
                    className={`h-14 rounded-xl text-lg font-light t cursor-pointer ${
                      isOperator
                        ? 'bg-elevated text-fg hover:bg-border/20'
                        : isEquals
                        ? 'bg-income text-white shadow-sm'
                        : isSpecial
                        ? 'bg-elevated/50 text-muted hover:bg-elevated'
                        : isParenthesis
                        ? 'bg-elevated/40 text-fg hover:bg-elevated/70'
                        : 'bg-elevated/30 text-fg hover:bg-elevated/80'
                    }`}
                  >
                    {btn === '⌫' ? <Delete className="w-5 h-5 mx-auto" strokeWidth={1.5} /> : btn}
                  </motion.button>
                )
              })}
            </div>

            {/* Confirm CTA */}
            <div className="mt-4">
              <button
                onClick={handleConfirm}
                disabled={liveResult === null && isNaN(parseFloat(formula))}
                className="w-full py-3 bg-income/10 hover:bg-income hover:text-white text-income text-xs tracking-wider uppercase font-medium rounded-xl t cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                Conferma Importo
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
