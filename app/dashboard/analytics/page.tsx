'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Calendar, 
  BarChart3, 
  Wallet, 
  ArrowLeftRight, 
  Percent, 
  Flame, 
  SlidersHorizontal,
  Info
} from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'

type TimeRange = '1w' | '2w' | '1m' | '2m' | '6m' | '1y' | 'custom' | 'custom-period'
type CustomPeriodUnit = 'days' | 'weeks' | 'months' | 'years'

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Navigation / Active View States
  const [activeTab, setActiveTab] = useState<'patrimonio' | 'cassa' | 'efficienza'>('patrimonio')
  const [activeMetric, setActiveMetric] = useState<string>('net-worth')

  // Date Filtering States
  const [timeRange, setTimeRange] = useState<TimeRange>('1m')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [customPeriodValue, setCustomPeriodValue] = useState<number>(3)
  const [customPeriodUnit, setCustomPeriodUnit] = useState<CustomPeriodUnit>('weeks')

  // Tooltip Hover State
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // 1. Resolve exact date boundaries
  const dateBoundaries = useMemo(() => {
    const today = new Date()
    let start = new Date()
    let end = new Date(today)

    if (timeRange === '1w') {
      start.setDate(today.getDate() - 7)
    } else if (timeRange === '2w') {
      start.setDate(today.getDate() - 14)
    } else if (timeRange === '1m') {
      start.setDate(today.getDate() - 30)
    } else if (timeRange === '2m') {
      start.setDate(today.getDate() - 60)
    } else if (timeRange === '6m') {
      start.setMonth(today.getMonth() - 6)
    } else if (timeRange === '1y') {
      start.setFullYear(today.getFullYear() - 1)
    } else if (timeRange === 'custom') {
      start = customStartDate ? new Date(customStartDate) : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      if (customEndDate) end = new Date(customEndDate)
    } else if (timeRange === 'custom-period') {
      const val = Math.max(1, customPeriodValue)
      if (customPeriodUnit === 'days') {
        start.setDate(today.getDate() - val)
      } else if (customPeriodUnit === 'weeks') {
        start.setDate(today.getDate() - val * 7)
      } else if (customPeriodUnit === 'months') {
        start.setMonth(today.getMonth() - val)
      } else if (customPeriodUnit === 'years') {
        start.setFullYear(today.getFullYear() - val)
      }
    }

    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [timeRange, customStartDate, customEndDate, customPeriodValue, customPeriodUnit])

  // 2. Main Financial Computations
  const analyticsData = useMemo(() => {
    if (transactions.length === 0) return {
      daily: [],
      totals: {
        rangeIncome: 0,
        rangeExpense: 0,
        savingsRate: 0,
        currentNetWorth: 0,
        currentBusta: 0,
        currentFuori: 0,
        totalOutsideExpense: 0,
        avgDailyOutsideExpense: 0
      },
      groupedFlows: [],
      withdrawals: []
    }

    const sortedAll = [...transactions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const { start, end } = dateBoundaries

    // Calculate historical balance before selected start range
    let initialNetWorth = 0
    let initialBusta = 0
    let initialFuori = 0

    const priorTxs = sortedAll.filter(t => new Date(t.created_at) < start)
    priorTxs.forEach(t => {
      const amt = Number(t.amount)
      const isBusta = t.title.endsWith(' [busta]') || t.title.endsWith(' [busta-transfer]')
      const mult = t.type === 'income' ? 1 : -1

      if (isBusta) initialBusta += amt * mult
      else initialFuori += amt * mult
      initialNetWorth += amt * mult
    })

    // Generate daily steps list for the range
    const days: { date: Date; dateStr: string }[] = []
    let curr = new Date(start)
    while (curr <= end) {
      days.push({
        date: new Date(curr),
        dateStr: curr.toLocaleDateString('en-CA') // YYYY-MM-DD
      })
      curr.setDate(curr.getDate() + 1)
    }

    // Group transactions inside range by date key
    const rangeTxs = sortedAll.filter(t => {
      const d = new Date(t.created_at)
      return d >= start && d <= end
    })

    const txsByDay: Record<string, Transaction[]> = {}
    rangeTxs.forEach(t => {
      const k = new Date(t.created_at).toLocaleDateString('en-CA')
      if (!txsByDay[k]) txsByDay[k] = []
      txsByDay[k].push(t)
    })

    let runningBusta = initialBusta
    let runningFuori = initialFuori
    let runningNetWorth = initialNetWorth

    const daily = days.map(day => {
      const dayTxs = txsByDay[day.dateStr] || []

      let dayIncome = 0
      let dayExpense = 0
      let dayBustaDelta = 0
      let dayFuoriDelta = 0
      let dayNetWorthDelta = 0

      dayTxs.forEach(t => {
        const amt = Number(t.amount)
        const isBusta = t.title.endsWith(' [busta]') || t.title.endsWith(' [busta-transfer]')
        const mult = t.type === 'income' ? 1 : -1
        const isTransfer = t.title.endsWith('-transfer]')

        if (isBusta) dayBustaDelta += amt * mult
        else dayFuoriDelta += amt * mult
        dayNetWorthDelta += amt * mult

        // Exclude internal transfers for real income/expense calculations
        if (!isTransfer) {
          if (t.type === 'income') dayIncome += amt
          else dayExpense += amt
        }
      })

      runningBusta += dayBustaDelta
      runningFuori += dayFuoriDelta
      runningNetWorth += dayNetWorthDelta

      return {
        date: day.date,
        dateStr: day.dateStr,
        busta: runningBusta,
        fuori: runningFuori,
        netWorth: runningNetWorth,
        income: dayIncome,
        expense: dayExpense
      }
    })

    // Totals in the range (excluding transfers)
    const rangeRealTxs = rangeTxs.filter(t => !t.title.endsWith('-transfer]'))
    const rangeIncome = rangeRealTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const rangeExpense = rangeRealTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const savingsRate = rangeIncome > 0 ? ((rangeIncome - rangeExpense) / rangeIncome) * 100 : 0

    // Busta to Fuori withdrawals
    const withdrawals = rangeTxs.filter(
      t => t.title.endsWith('[busta-transfer]') && t.type === 'expense'
    )

    // Outside (Fuori) real expenses for burn rate
    const outsideExpenses = rangeRealTxs.filter(
      t => t.type === 'expense' && !t.title.endsWith(' [busta]')
    )
    const totalOutsideExpense = outsideExpenses.reduce((s, t) => s + Number(t.amount), 0)
    const avgDailyOutsideExpense = daily.length > 0 ? totalOutsideExpense / daily.length : 0

    // Grouping for income vs expenses bars
    // <=14 days: daily, <=65 days: weekly, >65 days: monthly
    let groupedFlows: { label: string; income: number; expense: number }[] = []
    if (daily.length <= 14) {
      groupedFlows = daily.map(d => ({
        label: d.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
        income: d.income,
        expense: d.expense
      }))
    } else if (daily.length <= 65) {
      // Group by week
      const weeklyMap: Record<string, { income: number; expense: number; start: Date }> = {}
      daily.forEach(d => {
        const startOfWeek = new Date(d.date)
        const day = startOfWeek.getDay()
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) // monday
        startOfWeek.setDate(diff)
        const kw = startOfWeek.toLocaleDateString('en-CA')

        if (!weeklyMap[kw]) {
          weeklyMap[kw] = { income: 0, expense: 0, start: new Date(startOfWeek) }
        }
        weeklyMap[kw].income += d.income
        weeklyMap[kw].expense += d.expense
      })

      groupedFlows = Object.values(weeklyMap).map(w => {
        const endW = new Date(w.start)
        endW.setDate(endW.getDate() + 6)
        const label = `${w.start.getDate()}/${w.start.getMonth() + 1} - ${endW.getDate()}/${endW.getMonth() + 1}`
        return { label, income: w.income, expense: w.expense }
      })
    } else {
      // Group by month
      const monthlyMap: Record<string, { income: number; expense: number }> = {}
      daily.forEach(d => {
        const km = d.date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
        if (!monthlyMap[km]) {
          monthlyMap[km] = { income: 0, expense: 0 }
        }
        monthlyMap[km].income += d.income
        monthlyMap[km].expense += d.expense
      })
      groupedFlows = Object.entries(monthlyMap).map(([label, w]) => ({
        label,
        income: w.income,
        expense: w.expense
      }))
    }

    return {
      daily,
      totals: {
        rangeIncome,
        rangeExpense,
        savingsRate,
        currentNetWorth: runningNetWorth,
        currentBusta: runningBusta,
        currentFuori: runningFuori,
        totalOutsideExpense,
        avgDailyOutsideExpense
      },
      groupedFlows,
      withdrawals
    }
  }, [transactions, dateBoundaries])

  // Quick Sparkline path generator
  const getSparklinePath = (data: number[], w = 80, h = 30) => {
    if (data.length < 2) return ''
    const min = Math.min(...data)
    const max = Math.max(...data)
    const diff = max - min === 0 ? 1 : max - min

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / diff) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    return `M ${points.join(' L ')}`
  }

  // Active detailed SVG Chart coordinates generator
  const activeChartCoords = useMemo(() => {
    const { daily } = analyticsData
    if (daily.length === 0) return null

    const width = 500
    const height = 200
    const pad = { top: 20, right: 20, bottom: 30, left: 60 }
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom

    let values: { y1: number; y2?: number }[] = []

    if (activeMetric === 'net-worth') {
      values = daily.map(d => ({ y1: d.netWorth }))
    } else if (activeMetric === 'busta-vs-fuori') {
      values = daily.map(d => ({ y1: d.busta, y2: d.fuori }))
    } else if (activeMetric === 'burn-rate') {
      values = daily.map(d => ({ y1: d.fuori }))
    } else if (activeMetric === 'withdrawals') {
      // Create index mapping for withdrawals over days
      const daysCount = daily.length
      const wMap = new Array(daysCount).fill(0)
      analyticsData.withdrawals.forEach(w => {
        const k = new Date(w.created_at).toLocaleDateString('en-CA')
        const idx = daily.findIndex(d => d.dateStr === k)
        if (idx !== -1) wMap[idx] += Number(w.amount)
      })
      values = wMap.map(val => ({ y1: val }))
    }

    if (values.length === 0) return null

    const allY = values.flatMap(v => [v.y1, v.y2 !== undefined ? v.y2 : v.y1])
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const diffY = maxY - minY === 0 ? 10 : maxY - minY
    const yMin = minY - diffY * 0.1
    const yMax = maxY + diffY * 0.1

    const points = daily.map((day, i) => {
      const x = pad.left + (i / (daily.length - 1)) * plotW
      const y1Val = values[i].y1
      const y2Val = values[i].y2
      const y1 = pad.top + (1 - (y1Val - yMin) / (yMax - yMin)) * plotH
      const y2 = y2Val !== undefined ? pad.top + (1 - (y2Val - yMin) / (yMax - yMin)) * plotH : undefined

      return {
        x,
        y1,
        y2,
        date: day.date,
        dateStr: day.dateStr,
        val1: y1Val,
        val2: y2Val
      }
    })

    return { points, pad, width, height, yMin, yMax, plotW, plotH }
  }, [activeMetric, analyticsData])

  // Mouse Move tool for Hover Tooltips on charts
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeChartCoords || activeChartCoords.points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.clientX - rect.left

    const { pad, width, points } = activeChartCoords
    const plotW = width - pad.left - pad.right

    // Translate Client X relative to plot width
    const svgPlotStart = (pad.left / width) * rect.width
    const svgPlotWidth = (plotW / width) * rect.width
    const pct = (clientX - svgPlotStart) / svgPlotWidth
    const idx = Math.min(
      points.length - 1,
      Math.max(0, Math.round(pct * (points.length - 1)))
    )
    setHoveredIndex(idx)
  }

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  // Define thematic card groupings
  const themes = [
    {
      id: 'patrimonio',
      label: 'Patrimonio & Flussi',
      metrics: [
        {
          id: 'net-worth',
          label: 'Saldo Totale',
          icon: Activity,
          getValue: () => `€${fmt(analyticsData.totals.currentNetWorth || 0)}`,
          getSparklineData: () => analyticsData.daily.map(d => d.netWorth)
        },
        {
          id: 'income-vs-expense',
          label: 'Entrate vs Uscite',
          icon: BarChart3,
          getValue: () => `€${fmt(analyticsData.totals.rangeIncome || 0)} / €${fmt(analyticsData.totals.rangeExpense || 0)}`,
          getSparklineData: () => analyticsData.daily.map(d => d.income - d.expense)
        }
      ]
    },
    {
      id: 'cassa',
      label: 'Portafogli & Prelievi',
      metrics: [
        {
          id: 'busta-vs-fuori',
          label: 'Distribuzione Fondi',
          icon: Wallet,
          getValue: () => `B: €${fmt(analyticsData.totals.currentBusta || 0)} | F: €${fmt(analyticsData.totals.currentFuori || 0)}`,
          getSparklineData: () => analyticsData.daily.map(d => d.busta)
        },
        {
          id: 'burn-rate',
          label: 'Consumo Fuori',
          icon: Flame,
          getValue: () => `€${fmt(analyticsData.totals.avgDailyOutsideExpense || 0)} / gg`,
          getSparklineData: () => analyticsData.daily.map(d => d.fuori)
        },
        {
          id: 'withdrawals',
          label: 'Prelievi Busta',
          icon: ArrowLeftRight,
          getValue: () => `${analyticsData.withdrawals.length} volte (Tot: €${fmt(analyticsData.withdrawals.reduce((s,t)=>s+Number(t.amount), 0))})`,
          getSparklineData: () => {
            const wMap = new Array(analyticsData.daily.length).fill(0)
            analyticsData.withdrawals.forEach(w => {
              const k = new Date(w.created_at).toLocaleDateString('en-CA')
              const idx = analyticsData.daily.findIndex(d => d.dateStr === k)
              if (idx !== -1) wMap[idx] += Number(w.amount)
            })
            return wMap
          }
        }
      ]
    },
    {
      id: 'efficienza',
      label: 'Efficienza Finanziaria',
      metrics: [
        {
          id: 'savings-rate',
          label: 'Tasso di Risparmio',
          icon: Percent,
          getValue: () => `${analyticsData.totals.savingsRate?.toFixed(1) || '0.0'}%`,
          getSparklineData: () => {
            // Group savings rate monthly for sparkline if possible, else return static
            return analyticsData.daily.map(d => d.income - d.expense)
          }
        }
      ]
    }
  ]

  const activeGroup = themes.find(t => t.id === activeTab)

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 py-4">

      {/* Main Thematic Tab Selection (A) */}
      <div className="flex gap-6 border-b border-border/10 pb-3 overflow-x-auto scrollbar-none">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id as any)
              setActiveMetric(t.metrics[0].id)
              setHoveredIndex(null)
            }}
            className={`text-[10px] tracking-[0.25em] uppercase font-normal pb-2 border-b-2 t shrink-0 cursor-pointer ${
              activeTab === t.id 
                ? 'border-fg text-fg font-medium' 
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Mini metric sparkline cards (C) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {activeGroup?.metrics.map(m => {
          const Icon = m.icon
          const isSel = activeMetric === m.id
          const sparkData = m.getSparklineData()

          return (
            <motion.div
              key={m.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setActiveMetric(m.id)
                setHoveredIndex(null)
              }}
              className={`card p-5 cursor-pointer flex flex-col justify-between min-h-[120px] transition-all relative overflow-hidden ${
                isSel ? 'bg-elevated/80 border border-fg/10 shadow-lg' : 'hover:bg-elevated/40 border border-transparent'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1 z-10">
                  <span className="text-[9px] tracking-[0.2em] uppercase text-muted font-normal block">
                    {m.label}
                  </span>
                  <h4 className="text-lg font-light tracking-tight text-fg">
                    {m.getValue()}
                  </h4>
                </div>
                <div className={`p-2 rounded-lg ${isSel ? 'bg-fg/5 text-fg' : 'bg-transparent text-muted'}`}>
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>

              {/* Sparkline line render */}
              <div className="mt-4 flex items-end justify-between z-10">
                <span className="text-[9px] text-muted tracking-wider">Trend Periodo</span>
                {sparkData.length > 1 ? (
                  <svg width="85" height="28" className="opacity-75">
                    <path
                      d={getSparklinePath(sparkData, 85, 26)}
                      fill="none"
                      stroke={isSel ? 'var(--fg)' : 'var(--muted)'}
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <span className="text-[9px] text-muted italic">Dati insufficienti</span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Date Range Selector Panel */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted">
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[9px] tracking-[0.25em] uppercase font-normal">Filtro Intervallo Temporale</span>
          </div>

          {/* Quick choices row */}
          <div className="flex flex-wrap gap-1 p-0.5 bg-elevated rounded-lg">
            {(['1w', '1m', '2m', '6m', '1y', 'custom', 'custom-period'] as TimeRange[]).map(r => {
              let label = ''
              if (r === '1w') label = '1 Settimana'
              if (r === '1m') label = '1 Mese'
              if (r === '2m') label = '2 Mesi'
              if (r === '6m') label = '6 Mesi'
              if (r === '1y') label = '1 Anno'
              if (r === 'custom') label = 'Date Specifiche'
              if (r === 'custom-period') label = 'Personalizzato'

              return (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 rounded-md text-[9px] tracking-wider uppercase font-normal cursor-pointer t ${
                    timeRange === r ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conditional extra controls */}
        <AnimatePresence mode="wait">
          {timeRange === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 gap-4 pt-2 border-t border-border/10"
            >
              <div>
                <label className="text-[9px] tracking-wider uppercase text-muted block mb-1">Da data</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="w-full bg-transparent border-b border-border/30 py-1.5 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                />
              </div>
              <div>
                <label className="text-[9px] tracking-wider uppercase text-muted block mb-1">A data</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="w-full bg-transparent border-b border-border/30 py-1.5 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                />
              </div>
            </motion.div>
          )}

          {timeRange === 'custom-period' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-end gap-4 pt-2 border-t border-border/10"
            >
              <div className="flex-1">
                <label className="text-[9px] tracking-wider uppercase text-muted block mb-1">Quantità</label>
                <input
                  type="number"
                  min="1"
                  value={customPeriodValue}
                  onChange={e => setCustomPeriodValue(parseInt(e.target.value) || 1)}
                  className="w-full bg-transparent border-b border-border/30 py-1.5 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] tracking-wider uppercase text-muted block mb-1">Unità di Misura</label>
                <select
                  value={customPeriodUnit}
                  onChange={e => setCustomPeriodUnit(e.target.value as CustomPeriodUnit)}
                  className="w-full bg-transparent border-b border-border/30 py-1.5 text-xs font-light text-fg focus:outline-none focus:border-fg cursor-pointer t"
                >
                  <option value="days" className="bg-surface text-fg">Giorni</option>
                  <option value="weeks" className="bg-surface text-fg">Settimane</option>
                  <option value="months" className="bg-surface text-fg">Mesi</option>
                  <option value="years" className="bg-surface text-fg">Anni</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Interactive Detail Chart Screen */}
      <div className="card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">
              Dettaglio Grafico Attivo
            </span>
            <h3 className="text-xl font-light text-fg capitalize">
              {activeGroup?.metrics.find(m => m.id === activeMetric)?.label}
            </h3>
          </div>

          <div className="text-right text-[10px] text-muted tracking-wider">
            Intervallo: {dateBoundaries.start.toLocaleDateString('it-IT')} - {dateBoundaries.end.toLocaleDateString('it-IT')}
          </div>
        </div>

        {/* Chart render states */}
        {analyticsData.daily.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted space-y-2">
            <Info className="w-5 h-5 text-muted/50" />
            <p className="text-xs font-light">Nessuna transazione registrata nel periodo selezionato</p>
          </div>
        ) : activeMetric === 'savings-rate' ? (
          /* Specialized Savings Rate Donut / Circular Progress */
          <div className="flex flex-col items-center justify-center py-8 space-y-8">
            <div className="relative w-44 h-44">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke="var(--border)"
                  strokeWidth="6"
                />
                {/* Savings Rate Progress */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke={analyticsData.totals.savingsRate >= 0 ? 'var(--income)' : 'var(--expense)'}
                  strokeWidth="6"
                  strokeDasharray="263.8"
                  initial={{ strokeDashoffset: 263.8 }}
                  animate={{ 
                    strokeDashoffset: 263.8 - (263.8 * Math.min(100, Math.max(0, Math.abs(analyticsData.totals.savingsRate)))) / 100 
                  }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </svg>
              {/* Inner Stats */}
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-0.5 text-center">
                <span className={`text-4xl font-thin tracking-tight ${
                  analyticsData.totals.savingsRate >= 0 ? 'text-income' : 'text-expense'
                }`}>
                  {analyticsData.totals.savingsRate >= 0 ? '+' : ''}
                  {analyticsData.totals.savingsRate?.toFixed(1)}%
                </span>
                <span className="text-[9px] tracking-wider text-muted uppercase">Tasso di Risparmio</span>
              </div>
            </div>

            {/* Quick Balance Breakdown table for Period */}
            <div className="w-full max-w-sm grid grid-cols-2 gap-8 border-t border-border/10 pt-6">
              <div className="space-y-1">
                <span className="text-[9px] tracking-wider text-muted uppercase block">Entrate Totali</span>
                <p className="text-base font-light text-income">€{fmt(analyticsData.totals.rangeIncome)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] tracking-wider text-muted uppercase block">Uscite Totali</span>
                <p className="text-base font-light text-expense">€{fmt(analyticsData.totals.rangeExpense)}</p>
              </div>
            </div>
          </div>
        ) : activeMetric === 'income-vs-expense' ? (
          /* Periodic Bar Chart (Income vs Expense) */
          <div className="space-y-6">
            <div className="relative w-full h-[200px] flex items-end gap-3 px-2 border-b border-border/10">
              {analyticsData.groupedFlows.map((flow, i) => {
                const maxVal = Math.max(
                  ...analyticsData.groupedFlows.map(f => Math.max(f.income, f.expense)),
                  10 // guard
                )
                const incPct = (flow.income / maxVal) * 100
                const expPct = (flow.expense / maxVal) * 100

                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    {/* Hover detail tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 absolute -top-12 bg-elevated/95 border border-border/40 text-[10px] p-2 rounded-lg shadow-xl z-20 pointer-events-none transition-all flex flex-col gap-0.5 shrink-0 whitespace-nowrap">
                      <span className="font-medium text-fg mb-0.5">{flow.label}</span>
                      <span className="text-income">Entrate: €{fmt(flow.income)}</span>
                      <span className="text-expense">Uscite: €{fmt(flow.expense)}</span>
                    </div>

                    <div className="w-full flex items-end gap-1 justify-center h-[160px] pb-1">
                      {/* Income Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${incPct}%` }}
                        className="w-2.5 rounded-t-sm bg-income/60 group-hover:bg-income transition-colors"
                      />
                      {/* Expense Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${expPct}%` }}
                        className="w-2.5 rounded-t-sm bg-expense/60 group-hover:bg-expense transition-colors"
                      />
                    </div>
                    {/* Label */}
                    <span className="text-[8px] text-muted tracking-wider truncate w-full text-center mt-1 py-1 block">
                      {flow.label}
                    </span>
                  </div>
                )
              })}
            </div>
            
            {/* Legend */}
            <div className="flex justify-center gap-6 text-[10px] text-muted tracking-wider">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-income" />
                <span>Entrate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-expense" />
                <span>Uscite</span>
              </div>
            </div>
          </div>
        ) : activeChartCoords ? (
          /* SVG Line / Path charts with Tooltips */
          <div className="relative">
            <svg
              viewBox={`0 0 ${activeChartCoords.width} ${activeChartCoords.height}`}
              className="w-full h-auto select-none"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="area-grad-busta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--muted)" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="var(--muted)" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="area-grad-fuori" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1={activeChartCoords.pad.left}
                y1={activeChartCoords.pad.top}
                x2={activeChartCoords.width - activeChartCoords.pad.right}
                y2={activeChartCoords.pad.top}
                stroke="var(--border)"
                strokeWidth="0.8"
                strokeDasharray="4,4"
              />
              <line
                x1={activeChartCoords.pad.left}
                y1={activeChartCoords.pad.top + activeChartCoords.plotH / 2}
                x2={activeChartCoords.width - activeChartCoords.pad.right}
                y2={activeChartCoords.pad.top + activeChartCoords.plotH / 2}
                stroke="var(--border)"
                strokeWidth="0.8"
                strokeDasharray="4,4"
              />
              <line
                x1={activeChartCoords.pad.left}
                y1={activeChartCoords.height - activeChartCoords.pad.bottom}
                x2={activeChartCoords.width - activeChartCoords.pad.right}
                y2={activeChartCoords.height - activeChartCoords.pad.bottom}
                stroke="var(--border)"
                strokeWidth="0.8"
              />

              {/* Chart paths */}
              {activeMetric === 'busta-vs-fuori' ? (
                <>
                  {/* Busta Area and Line (Grayish) */}
                  <path
                    d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y1}`).join(' ')} L ${
                      activeChartCoords.points[activeChartCoords.points.length - 1].x
                    } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                      activeChartCoords.height - activeChartCoords.pad.bottom
                    } Z`}
                    fill="url(#area-grad-busta)"
                  />
                  <path
                    d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y1}`).join(' ')}
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth="1.2"
                  />

                  {/* Fuori Area and Line (Indigo) */}
                  <path
                    d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y2}`).join(' ')} L ${
                      activeChartCoords.points[activeChartCoords.points.length - 1].x
                    } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                      activeChartCoords.height - activeChartCoords.pad.bottom
                    } Z`}
                    fill="url(#area-grad-fuori)"
                  />
                  <path
                    d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y2!}`).join(' ')}
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1.2"
                  />
                </>
              ) : activeMetric === 'withdrawals' ? (
                /* Withdrawal spikes (bar/step representation) */
                activeChartCoords.points.map((p, idx) => {
                  if (p.val1 === 0) return null
                  return (
                    <line
                      key={idx}
                      x1={p.x}
                      y1={activeChartCoords.height - activeChartCoords.pad.bottom}
                      x2={p.x}
                      y2={p.y1}
                      stroke="var(--expense)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  )
                })
              ) : (
                /* Standard Line Curve (Net Worth, Burn Rate) */
                <>
                  <path
                    d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y1}`).join(' ')} L ${
                      activeChartCoords.points[activeChartCoords.points.length - 1].x
                    } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                      activeChartCoords.height - activeChartCoords.pad.bottom
                    } Z`}
                    fill="url(#area-grad)"
                  />
                  <path
                    d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y1}`).join(' ')}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                </>
              )}

              {/* Hover highlight indicators */}
              {hoveredIndex !== null && activeChartCoords.points[hoveredIndex] && (
                <>
                  <line
                    x1={activeChartCoords.points[hoveredIndex].x}
                    y1={activeChartCoords.pad.top}
                    x2={activeChartCoords.points[hoveredIndex].x}
                    y2={activeChartCoords.height - activeChartCoords.pad.bottom}
                    stroke="var(--border)"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  {activeMetric === 'busta-vs-fuori' ? (
                    <>
                      <circle
                        cx={activeChartCoords.points[hoveredIndex].x}
                        cy={activeChartCoords.points[hoveredIndex].y1}
                        r="4"
                        fill="var(--muted)"
                      />
                      <circle
                        cx={activeChartCoords.points[hoveredIndex].x}
                        cy={activeChartCoords.points[hoveredIndex].y2!}
                        r="4"
                        fill="#818cf8"
                      />
                    </>
                  ) : (
                    <circle
                      cx={activeChartCoords.points[hoveredIndex].x}
                      cy={activeChartCoords.points[hoveredIndex].y1}
                      r="4"
                      fill={activeMetric === 'withdrawals' ? 'var(--expense)' : '#ffffff'}
                    />
                  )}
                </>
              )}

              {/* X & Y Labels */}
              <text
                x={activeChartCoords.pad.left}
                y={activeChartCoords.height - 8}
                fill="var(--muted)"
                fontSize="7"
                letterSpacing="1"
                textAnchor="start"
              >
                {activeChartCoords.points[0]?.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
              </text>
              <text
                x={activeChartCoords.width - activeChartCoords.pad.right}
                y={activeChartCoords.height - 8}
                fill="var(--muted)"
                fontSize="7"
                letterSpacing="1"
                textAnchor="end"
              >
                {activeChartCoords.points[activeChartCoords.points.length - 1]?.date.toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'short'
                })}
              </text>

              {/* Y Value levels */}
              <text
                x={activeChartCoords.pad.left - 8}
                y={activeChartCoords.pad.top + 3}
                fill="var(--muted)"
                fontSize="7"
                textAnchor="end"
              >
                €{activeChartCoords.yMax.toFixed(0)}
              </text>
              <text
                x={activeChartCoords.pad.left - 8}
                y={activeChartCoords.height - activeChartCoords.pad.bottom + 3}
                fill="var(--muted)"
                fontSize="7"
                textAnchor="end"
              >
                €{activeChartCoords.yMin.toFixed(0)}
              </text>
            </svg>

            {/* Hover Floating Details Card */}
            {hoveredIndex !== null && activeChartCoords.points[hoveredIndex] && (
              <div className="absolute top-0 right-0 bg-elevated/95 border border-border/40 p-3 rounded-xl shadow-xl space-y-1 z-20 pointer-events-none">
                <span className="text-[9px] text-muted tracking-wider uppercase block">
                  {new Date(activeChartCoords.points[hoveredIndex].date).toLocaleDateString('it-IT', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
                {activeMetric === 'busta-vs-fuori' ? (
                  <div className="space-y-0.5 text-xs font-light">
                    <p className="text-fg flex justify-between gap-4">
                      <span>Busta:</span>
                      <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val1)}</span>
                    </p>
                    <p className="text-[#818cf8] flex justify-between gap-4">
                      <span>Fuori:</span>
                      <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val2!)}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-light text-fg">
                    €{fmt(activeChartCoords.points[hoveredIndex].val1)}
                  </p>
                )}
              </div>
            )}
            
            {/* Custom chart legend for Busta vs Fuori */}
            {activeMetric === 'busta-vs-fuori' && (
              <div className="flex justify-center gap-6 text-[10px] text-muted tracking-wider pt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-muted" />
                  <span>Envelope Busta</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#818cf8]" />
                  <span>Pocket Fuori</span>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Auxiliary Statistics Cards (Detailed Metrics depending on view) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {activeMetric === 'withdrawals' && (
          <>
            <div className="card p-5 space-y-2">
              <span className="text-[9px] tracking-wider text-muted uppercase">Importo Medio Prelievo</span>
              <h4 className="text-2xl font-thin tracking-tight text-fg">
                €{fmt(
                  analyticsData.withdrawals.length > 0 
                    ? analyticsData.withdrawals.reduce((s,t) => s + Number(t.amount), 0) / analyticsData.withdrawals.length
                    : 0
                )}
              </h4>
              <p className="text-[10px] text-muted tracking-wide">
                Calcolato su {analyticsData.withdrawals.length} prelievi registrati
              </p>
            </div>
            <div className="card p-5 space-y-2">
              <span className="text-[9px] tracking-wider text-muted uppercase">Prelievo Massimo</span>
              <h4 className="text-2xl font-thin tracking-tight text-fg text-expense">
                €{fmt(
                  analyticsData.withdrawals.length > 0 
                    ? Math.max(...analyticsData.withdrawals.map(t => Number(t.amount)))
                    : 0
                )}
              </h4>
              <p className="text-[10px] text-muted tracking-wide">
                La singola ricarica di contante più elevata nel periodo
              </p>
            </div>
          </>
        )}

        {activeMetric === 'burn-rate' && (
          <>
            <div className="card p-5 space-y-2">
              <span className="text-[9px] tracking-wider text-muted uppercase">Spesa Fuori Totale</span>
              <h4 className="text-2xl font-thin tracking-tight text-fg">
                €{fmt(analyticsData.totals.totalOutsideExpense || 0)}
              </h4>
              <p className="text-[10px] text-muted tracking-wide">
                Spese correnti registrate escludendo il deposito busta
              </p>
            </div>
            <div className="card p-5 space-y-2">
              <span className="text-[9px] tracking-wider text-muted uppercase">Copertura Residua Stima</span>
              <h4 className="text-2xl font-thin tracking-tight text-fg text-income">
                {analyticsData.totals.avgDailyOutsideExpense > 0 
                  ? `${Math.floor((analyticsData.totals.currentFuori || 0) / analyticsData.totals.avgDailyOutsideExpense)} giorni`
                  : 'N/A'
                }
              </h4>
              <p className="text-[10px] text-muted tracking-wide">
                Durata stimata dei fondi fuori busta in base al tasso di spesa
              </p>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
