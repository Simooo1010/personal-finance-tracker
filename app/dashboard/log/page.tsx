'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Edit2, CheckCircle2, XCircle, Info, Ban } from 'lucide-react'
import { getHistory, revertToPoint, TrackedAction } from '@/lib/actionsTracker'
import TransactionForm from '@/components/TransactionForm'
import { Transaction } from '@/lib/supabase'

export default function LogPage() {
  const [history, setHistory] = useState<TrackedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [revertingId, setRevertingId] = useState<string | null>(null)

  // Editing state
  const [editingTx, setEditingTx] = useState<Partial<Transaction> | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)

  const fetchHistory = useCallback(async () => {
    const data = await getHistory()
    setHistory(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHistory()
    window.addEventListener('finance_history_change', fetchHistory)
    return () => window.removeEventListener('finance_history_change', fetchHistory)
  }, [fetchHistory])

  const handleRevert = async (actionId: string) => {
    if (!confirm("Sei sicuro di voler ripristinare il database allo stato successivo a questa azione? Tutte le azioni più recenti verranno annullate.")) return
    
    setRevertingId(actionId)
    const success = await revertToPoint(actionId)
    setRevertingId(null)
    if (success) {
      alert("Ripristino completato con successo.")
    } else {
      alert("Errore durante il ripristino.")
    }
  }

  const handleEdit = (action: TrackedAction) => {
    // Determine the transaction to edit based on the action data
    // Usually undo_data contains the transaction before edit, and redo_data contains the transaction after edit (or the new one).
    // For an edit action, redo_data is the target transaction state.
    // Let's use redo_data as the base for the edit form if it's an add/edit action.
    let txData = action.redo_data
    if (!txData || !txData.id) {
      // Try to fallback to undo_data if redo_data is missing
      txData = action.undo_data
    }

    if (txData && txData.id) {
      setEditingTx(txData as Partial<Transaction>)
      setShowEditForm(true)
    } else {
      alert("Impossibile modificare questa azione direttamente.")
    }
  }

  const getTypeColor = (type: string) => {
    if (type.includes('delete') || type.includes('revert')) return 'text-expense bg-expense/10'
    if (type.includes('add') || type.includes('insert')) return 'text-income bg-income/10'
    return 'text-blue-400 bg-blue-400/10'
  }

  const formatType = (type: string) => {
    return type.replace(/_/g, ' ').toUpperCase()
  }

  return (
    <div className="space-y-8 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-thin tracking-tight text-fg">Registro Attività</h1>
        <p className="text-sm font-light text-muted">Visualizza, modifica o ripristina le tue interazioni recenti.</p>
      </div>

      <div className="card p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <Info className="w-8 h-8 text-muted/50" strokeWidth={1.5} />
            <p className="text-sm text-muted font-light">Nessuna attività registrata</p>
          </div>
        ) : (
          <div className="relative border-l border-border/20 ml-3 md:ml-6 space-y-8 pb-4">
            <AnimatePresence>
              {history.map((action, i) => {
                const isCancelled = action.is_cancelled
                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative pl-6 md:pl-8 group"
                  >
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${
                      isCancelled ? 'bg-muted/50' : 'bg-fg'
                    }`} />

                    <div className={`space-y-3 ${isCancelled ? 'opacity-50' : ''}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] tracking-widest font-medium ${isCancelled ? 'bg-muted/20 text-muted' : getTypeColor(action.type)}`}>
                          {isCancelled ? 'ANNULLATA' : formatType(action.type)}
                        </span>
                        <span className="text-[10px] text-muted tracking-wider">
                          {new Date(action.created_at).toLocaleString('it-IT', { 
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                          })}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <p className={`text-sm font-light ${isCancelled ? 'line-through text-muted' : 'text-fg'}`}>
                          {action.label}
                        </p>
                        
                        {!isCancelled && (
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEdit(action)}
                              className="p-1.5 rounded-md hover:bg-elevated text-muted hover:text-fg transition-colors"
                              title="Modifica Transazione Originaria"
                            >
                              <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                            <button
                              onClick={() => handleRevert(action.id)}
                              disabled={revertingId !== null}
                              className="p-1.5 rounded-md hover:bg-expense/10 text-muted hover:text-expense transition-colors"
                              title="Ripristina a questo stato (Annulla azioni successive)"
                            >
                              <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showEditForm && editingTx && (
        <TransactionForm
          isOpen={showEditForm}
          onClose={() => {
            setShowEditForm(false)
            setEditingTx(null)
          }}
          onSaved={fetchHistory}
          editTransaction={editingTx as Transaction}
          defaultType={editingTx.type as 'income' | 'expense' || 'expense'}
        />
      )}
    </div>
  )
}
