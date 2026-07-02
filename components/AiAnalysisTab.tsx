'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { SparkleIcon } from '@/components/SparkleIcon'
import { RefreshCw } from 'lucide-react'

export function AiAnalysisTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalysis = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/ai/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh })
      })
      const json = await res.json()
      
      if (!res.ok || json.error) {
        setError(json.message || json.error || 'Errore di connessione')
      } else if (!json.enabled) {
        setError('Funzionalità AI non abilitata')
      } else {
        setData(json)
      }
    } catch (err) {
      setError('Errore di rete o server non raggiungibile')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAnalysis()
  }, [])

  const formatMarkdown = (text: string) => {
    // Basic markdown parsing for bold and lists
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\n\n/g, '</p><p className="mt-4">')
    html = html.replace(/\n- (.*?)(?=\n|$)/g, '<li className="ml-4 list-disc">$1</li>')
    html = html.replace(/\n\d+\. (.*?)(?=\n|$)/g, '<li className="ml-4 list-decimal mt-2">$1</li>')
    return `<p>${html}</p>`
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-6 h-6 border-2 border-muted/20 border-t-muted/80 rounded-full animate-spin" />
        <p className="text-xs tracking-widest text-muted uppercase">Analisi in corso...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-fg">
          <SparkleIcon className="w-5 h-5" strokeWidth={1.5} />
          <h2 className="text-lg font-light tracking-tight">Report Settimanale</h2>
        </div>
        <button
          onClick={() => fetchAnalysis(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-elevated hover:bg-elevated/80 rounded-full text-xs font-medium text-fg t disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Aggiornamento...' : 'Aggiorna'}
        </button>
      </div>

      {error ? (
        <div className="card p-6 bg-expense/5 border-expense/20 text-expense text-sm font-light">
          {error}
        </div>
      ) : data?.analysis_text ? (
        <div className="space-y-6">
          <div 
            className="card p-6 sm:p-8 text-sm sm:text-base font-light leading-relaxed prose prose-invert max-w-none prose-p:text-muted prose-strong:text-fg prose-li:text-muted"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(data.analysis_text) }}
          />
          <p className="text-[10px] text-muted text-right tracking-wider">
            Ultimo aggiornamento: {new Date(data.last_generation_time).toLocaleString('it-IT')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
