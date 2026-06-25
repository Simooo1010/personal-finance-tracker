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
import { parseTransaction, getTransactionEffect, WalletType } from '@/lib/transactions'

type TimeRange = '1w' | '2w' | '1m' | '2m' | '6m' | '1y' | 'custom' | 'custom-period'
type CustomPeriodUnit = 'days' | 'weeks' | 'months' | 'years'

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Navigation / Active View States
  const [activeTab, setActiveTab] = useState<'panoramica' | 'patrimonio' | 'cassa' | 'efficienza' | 'debiti'>('panoramica')
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

  // ── 1. PREVIOUS ANALYTICS MODULES COMPUTATIONS (GLOBAL SUMMARY) ──────
  const realTransactions = useMemo(() => {
    return transactions.filter(t => !t.title.endsWith('-transfer]'))
  }, [transactions])

  const totalIncome = useMemo(() => {
    return realTransactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  }, [realTransactions])

  const totalExpense = useMemo(() => {
    return realTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  }, [realTransactions])

  const totalSum = totalIncome + totalExpense
  const incPct = totalSum > 0 ? (totalIncome / totalSum) * 100 : 50
  const expPct = totalSum > 0 ? (totalExpense / totalSum) * 100 : 50

  const monthlyGroup = useMemo(() => {
    return realTransactions.reduce<Record<string, { income: number; expense: number }>>((acc, t) => {
      const key = new Date(t.created_at).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
      if (!acc[key]) acc[key] = { income: 0, expense: 0 }
      if (t.type === 'income') acc[key].income += Number(t.amount)
      else acc[key].expense += Number(t.amount)
      return acc
    }, {})
  }, [realTransactions])

  const topExpenses = useMemo(() => {
    return [...realTransactions]
      .filter(t => t.type === 'expense')
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5)
  }, [realTransactions])

  // ── 2. NEW DETAILED ANALYTICS COMPUTATIONS (FILTERED TIME RANGE) ──
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
        currentApple: 0,
        currentPostepay: 0,
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

    // Cumulative calculations
    let initialNetWorth = 0
    let initialBusta = 0
    let initialFuori = 0
    let initialApple = 0
    let initialPostepay = 0

    const priorTxs = sortedAll.filter(t => new Date(t.created_at) < start)
    priorTxs.forEach(t => {
      const parsed = parseTransaction(t)
      const effect = getTransactionEffect(t)
      const delta = effect.income - effect.expense

      if (parsed.wallet === 'busta') initialBusta += delta
      else if (parsed.wallet === 'fuori') initialFuori += delta
      else if (parsed.wallet === 'apple') initialApple += delta
      else if (parsed.wallet === 'postepay') initialPostepay += delta
      
      initialNetWorth += delta
    })

    const days: { date: Date; dateStr: string }[] = []
    let curr = new Date(start)
    while (curr <= end) {
      days.push({
        date: new Date(curr),
        dateStr: curr.toLocaleDateString('en-CA')
      })
      curr.setDate(curr.getDate() + 1)
    }

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
    let runningApple = initialApple
    let runningPostepay = initialPostepay
    let runningNetWorth = initialNetWorth

    const daily = days.map(day => {
      const dayTxs = txsByDay[day.dateStr] || []

      let dayIncome = 0
      let dayExpense = 0
      let dayOutsideExpense = 0
      let dayBustaDelta = 0
      let dayFuoriDelta = 0
      let dayAppleDelta = 0
      let dayPostepayDelta = 0
      let dayNetWorthDelta = 0

      dayTxs.forEach(t => {
        const parsed = parseTransaction(t)
        const effect = getTransactionEffect(t)
        const isTransfer = t.title.endsWith('-transfer]')
        const delta = effect.income - effect.expense

        if (parsed.wallet === 'busta') dayBustaDelta += delta
        else if (parsed.wallet === 'fuori') dayFuoriDelta += delta
        else if (parsed.wallet === 'apple') dayAppleDelta += delta
        else if (parsed.wallet === 'postepay') dayPostepayDelta += delta

        dayNetWorthDelta += delta

        if (!isTransfer) {
          dayIncome += effect.income
          dayExpense += effect.expense
          if (parsed.wallet !== 'busta') {
            dayOutsideExpense += effect.expense
          }
        }
      })

      runningBusta += dayBustaDelta
      runningFuori += dayFuoriDelta
      runningApple += dayAppleDelta
      runningPostepay += dayPostepayDelta
      runningNetWorth += dayNetWorthDelta

      return {
        date: day.date,
        dateStr: day.dateStr,
        busta: runningBusta,
        fuori: runningFuori,
        apple: runningApple,
        postepay: runningPostepay,
        netWorth: runningNetWorth,
        income: dayIncome,
        expense: dayExpense,
        outsideExpense: dayOutsideExpense
      }
    })

    const rangeRealTxs = rangeTxs.filter(t => !t.title.endsWith('-transfer]'))
    
    let rangeIncome = 0
    let rangeExpense = 0
    rangeRealTxs.forEach(t => {
      const effect = getTransactionEffect(t)
      rangeIncome += effect.income
      rangeExpense += effect.expense
    })
    
    const savingsRate = rangeIncome > 0 ? ((rangeIncome - rangeExpense) / rangeIncome) * 100 : 0

    const withdrawals = rangeTxs.filter(
      t => t.title.endsWith('[busta-transfer]') && t.type === 'expense'
    )

    const totalOutsideExpense = daily.reduce((s, d) => s + d.outsideExpense, 0)
    const avgDailyOutsideExpense = daily.length > 0 ? totalOutsideExpense / daily.length : 0

    let groupedFlows: { label: string; income: number; expense: number }[] = []
    if (daily.length <= 14) {
      groupedFlows = daily.map(d => ({
        label: d.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }),
        income: d.income,
        expense: d.expense
      }))
    } else if (daily.length <= 65) {
      const weeklyMap: Record<string, { income: number; expense: number; start: Date }> = {}
      daily.forEach(d => {
        const startOfWeek = new Date(d.date)
        const day = startOfWeek.getDay()
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
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
        currentApple: runningApple,
        currentPostepay: runningPostepay,
        totalOutsideExpense,
        avgDailyOutsideExpense
      },
      groupedFlows,
      withdrawals
    }
  }, [transactions, dateBoundaries])

  // Sparkline coordinates generator
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

  // Coordinates for active interactive detailed SVG
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
      values = daily.map(d => ({ y1: d.outsideExpense }))
    } else if (activeMetric === 'withdrawals') {
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

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeChartCoords || activeChartCoords.points.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.clientX - rect.left

    const { pad, width, points } = activeChartCoords
    const plotW = width - pad.left - pad.right

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

  const debtStats = useMemo(() => {
    const debts = transactions
      .map(t => {
        const parsed = parseTransaction(t)
        return {
          amount: Number(t.amount),
          ...parsed
        }
      })
      .filter(item => item.isDebt && item.debtInfo !== null)

    const activeDebts = debts.filter(d => d.debtInfo?.status === 'active')
    const credits = activeDebts.filter(d => d.debtInfo?.type === 'to_me')
    const totalCredits = credits.reduce((s, c) => s + c.amount, 0)

    const ownDebts = activeDebts.filter(d => d.debtInfo?.type === 'by_me')
    const totalDebts = ownDebts.reduce((s, d) => s + d.amount, 0)
    const netDebts = totalCredits - totalDebts

    const debitorsMap: Record<string, number> = {}
    credits.forEach(c => {
      const p = c.debtInfo!.person
      debitorsMap[p] = (debitorsMap[p] || 0) + c.amount
    })
    const topDebitors = Object.entries(debitorsMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    const maxDebitorAmount = topDebitors.length > 0 ? topDebitors[0].amount : 1

    const creditorsMap: Record<string, number> = {}
    ownDebts.forEach(d => {
      const p = d.debtInfo!.person
      creditorsMap[p] = (creditorsMap[p] || 0) + d.amount
    })
    const topCreditors = Object.entries(creditorsMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    const maxCreditorAmount = topCreditors.length > 0 ? topCreditors[0].amount : 1

    const wallets: WalletType[] = ['busta', 'fuori', 'apple', 'postepay']
    const walletBreakdown = wallets.map(w => {
      const wCredits = credits.filter(c => c.wallet === w).reduce((s, c) => s + c.amount, 0)
      const wDebts = ownDebts.filter(d => d.wallet === w).reduce((s, d) => s + d.amount, 0)
      return {
        id: w,
        name: w === 'busta' ? '✉️ Busta' : w === 'fuori' ? '✈️ Fuori' : w === 'apple' ? '🍎 Apple Account' : '💳 Postepay',
        credits: wCredits,
        debts: wDebts
      }
    })
    const maxWalletDebtVal = Math.max(...walletBreakdown.map(w => Math.max(w.credits, w.debts)), 1)

    return {
      totalCredits,
      totalDebts,
      netDebts,
      activeCreditsCount: credits.length,
      activeDebtsCount: ownDebts.length,
      topDebitors,
      maxDebitorAmount,
      topCreditors,
      maxCreditorAmount,
      walletBreakdown,
      maxWalletDebtVal
    }
  }, [transactions])

  // Define thematic card groupings
  const themes = [
    {
      id: 'panoramica',
      label: 'Panoramica',
      metrics: []
    },
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
          getSparklineData: () => analyticsData.daily.map(d => d.outsideExpense)
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
          getSparklineData: () => analyticsData.daily.map(d => d.income - d.expense)
        }
      ]
    },
    {
      id: 'debiti',
      label: 'Debiti',
      metrics: [
        {
          id: 'credits-to-redeem',
          label: 'Da Riscattare',
          icon: TrendingUp,
          getValue: () => `€${fmt(debtStats.totalCredits)}`,
          getSparklineData: () => []
        },
        {
          id: 'debts-to-pay',
          label: 'Da Pagare',
          icon: TrendingDown,
          getValue: () => `€${fmt(debtStats.totalDebts)}`,
          getSparklineData: () => []
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
              if (t.metrics.length > 0) {
                setActiveMetric(t.metrics[0].id)
              }
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

      {activeTab === 'panoramica' ? (
        /* ───── TAB 1: PREVIOUS ANALYTICS MODULES VIEW ───── */
        <div className="space-y-12">
          {/* Summary Row */}
          <div className="grid grid-cols-2 gap-8 border-b border-border/10 pb-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-1.5 text-muted">
                <TrendingUp className="w-3.5 h-3.5 text-income" strokeWidth={1.5} />
                <span className="text-[9px] tracking-[0.25em] uppercase font-light">Entrate Totali</span>
              </div>
              <h3 className="text-3xl font-thin tracking-tight text-fg">€{fmt(totalIncome)}</h3>
              <p className="text-[10px] text-muted tracking-wider">
                {realTransactions.filter(t => t.type === 'income').length} operazioni
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-1.5 text-muted">
                <TrendingDown className="w-3.5 h-3.5 text-expense" strokeWidth={1.5} />
                <span className="text-[9px] tracking-[0.25em] uppercase font-light">Uscite Totali</span>
              </div>
              <h3 className="text-3xl font-thin tracking-tight text-fg">€{fmt(totalExpense)}</h3>
              <p className="text-[10px] text-muted tracking-wider">
                {realTransactions.filter(t => t.type === 'expense').length} operazioni
              </p>
            </motion.div>
          </div>

          {/* Ratio bar Section */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-muted">
              <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
                Rapporto Entrate / Uscite
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex rounded-full overflow-hidden h-1.5 bg-elevated">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${incPct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="bg-income"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${expPct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                  className="bg-expense"
                />
              </div>
              <div className="flex justify-between text-[11px] font-light tracking-wider">
                <span className="text-income">Entrate {incPct.toFixed(0)}%</span>
                <span className="text-expense">Uscite {expPct.toFixed(0)}%</span>
              </div>
            </div>
          </motion.div>

          {/* Monthly Stats Section */}
          {Object.keys(monthlyGroup).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 text-muted pb-2 border-b border-border/10">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
                  Profilo Mensile
                </span>
              </div>
              <div className="space-y-6">
                {Object.entries(monthlyGroup).slice(0, 6).map(([month, data]) => {
                  const mt = data.income + data.expense
                  const ip = mt > 0 ? (data.income / mt) * 100 : 0
                  const net = data.income - data.expense
                  return (
                    <div key={month} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-sm font-light text-fg capitalize">{month}</span>
                        <span className={`text-sm font-light ${net >= 0 ? 'text-income' : 'text-expense'}`}>
                          {net >= 0 ? '+' : ''}€{fmt(net)}
                        </span>
                      </div>
                      <div className="flex rounded-full overflow-hidden h-1 bg-elevated">
                        <div className="bg-income" style={{ width: `${ip}%` }} />
                        <div className="bg-expense" style={{ width: `${100 - ip}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Top expenses Section */}
          {topExpenses.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 text-muted pb-2 border-b border-border/10">
                <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
                  Classifica Uscite
                </span>
              </div>
              <div className="space-y-5">
                {topExpenses.map((t, i) => {
                  const pct = totalExpense > 0 ? (Number(t.amount) / totalExpense) * 100 : 0
                  return (
                    <div key={t.id} className="flex items-start gap-4">
                      <span className="text-xs text-muted w-4 shrink-0 mt-0.5 font-light">{i + 1}</span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <p className="text-sm font-light text-fg truncate">
                            {t.title.replace(/ \[(busta|fuori)\]$/, '')}
                          </p>
                          <p className="text-sm font-normal text-expense ml-2 shrink-0">€{fmt(Number(t.amount))}</p>
                        </div>
                        <div className="h-1 rounded-full bg-elevated overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                            className="h-full bg-expense/40 rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      ) : activeTab === 'debiti' ? (
        /* ───── TAB 5: DEBT ANALYTICS VIEW ───── */
        <div className="space-y-12">
          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-border/10 pb-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 card p-4 bg-surface"
            >
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">Crediti Attivi</span>
              <h3 className="text-2xl font-thin tracking-tight text-income">€{fmt(debtStats.totalCredits)}</h3>
              <p className="text-[10px] text-muted tracking-wider">{debtStats.activeCreditsCount} persone ti devono</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-2 card p-4 bg-surface"
            >
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">Debiti Attivi</span>
              <h3 className="text-2xl font-thin tracking-tight text-expense">€{fmt(debtStats.totalDebts)}</h3>
              <p className="text-[10px] text-muted tracking-wider">Devi a {debtStats.activeDebtsCount} persone</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-2 card p-4 bg-surface"
            >
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">Bilancio Netto</span>
              <h3 className={`text-2xl font-thin tracking-tight ${debtStats.netDebts >= 0 ? 'text-income' : 'text-expense'}`}>
                {debtStats.netDebts >= 0 ? '+' : ''}€{fmt(debtStats.netDebts)}
              </h3>
              <p className="text-[10px] text-muted tracking-wider">Saldo crediti/debiti</p>
            </motion.div>
          </div>

          {/* Breakdown Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Top Debitori Chart */}
            <div className="card p-6 space-y-6">
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">Chi ti deve (Top Debitori)</span>
              {debtStats.topDebitors.length === 0 ? (
                <p className="text-xs font-light text-muted py-6 text-center">Nessun creditore attivo</p>
              ) : (
                <div className="space-y-4">
                  {debtStats.topDebitors.map((d, i) => {
                    const pct = (d.amount / debtStats.maxDebitorAmount) * 100
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-light">
                          <span className="text-fg">{d.name}</span>
                          <span className="text-income">€{fmt(d.amount)}</span>
                        </div>
                        <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            className="h-full bg-income rounded-full"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Top Creditori Chart */}
            <div className="card p-6 space-y-6">
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">A chi devi (Top Creditori)</span>
              {debtStats.topCreditors.length === 0 ? (
                <p className="text-xs font-light text-muted py-6 text-center">Nessun debito attivo</p>
              ) : (
                <div className="space-y-4">
                  {debtStats.topCreditors.map((c, i) => {
                    const pct = (c.amount / debtStats.maxCreditorAmount) * 100
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-light">
                          <span className="text-fg">{c.name}</span>
                          <span className="text-expense">€{fmt(c.amount)}</span>
                        </div>
                        <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            className="h-full bg-expense rounded-full"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Debts by Wallet Chart */}
            <div className="card p-6 space-y-6 md:col-span-2">
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">Distribuzione Debiti/Crediti per Portafoglio</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {debtStats.walletBreakdown.map((w, i) => {
                  const maxVal = debtStats.maxWalletDebtVal || 1
                  const credPct = (w.credits / maxVal) * 100
                  const debPct = (w.debts / maxVal) * 100
                  return (
                    <div key={i} className="card bg-surface/50 p-4 space-y-3 flex flex-col justify-between">
                      <span className="text-[9px] tracking-wider text-muted uppercase">{w.name}</span>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted">
                          <span>Credito:</span>
                          <span className="text-income">€{fmt(w.credits)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted">
                          <span>Debito:</span>
                          <span className="text-expense">€{fmt(w.debts)}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-2 border-t border-border/5">
                        <div className="h-1 bg-elevated rounded-full overflow-hidden flex gap-0.5">
                          <div className="h-full bg-income" style={{ width: `${credPct}%` }} />
                          <div className="h-full bg-expense" style={{ width: `${debPct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ───── TABS 2, 3, 4: ADVANCED GRAPHS DASHBOARD ───── */
        <>
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

                  {/* Sparkline layout with custom preview shapes */}
                  <div className="mt-4 flex items-end justify-between z-10">
                    <span className="text-[9px] text-muted tracking-wider">Anteprima</span>
                    {sparkData.length > 1 ? (
                      m.id === 'net-worth' ? (
                        <svg width="85" height="28" className="opacity-75">
                          <path
                            d={getSparklinePath(sparkData, 85, 26)}
                            fill="none"
                            stroke={isSel ? 'var(--fg)' : 'var(--muted)'}
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : m.id === 'income-vs-expense' ? (
                        (() => {
                          const previewFlows = analyticsData.groupedFlows.slice(-6)
                          const maxFlow = Math.max(...previewFlows.flatMap(f => [f.income, f.expense]), 1)
                          return (
                            <svg width="85" height="28" className="opacity-75">
                              {previewFlows.map((f, idx) => {
                                const hInc = (f.income / maxFlow) * 22
                                const hExp = (f.expense / maxFlow) * 22
                                const x = idx * 14
                                return (
                                  <g key={idx}>
                                    <rect x={x} y={28 - hInc} width={3} height={hInc} fill="var(--income)" className="t" />
                                    <rect x={x + 4} y={28 - hExp} width={3} height={hExp} fill="var(--expense)" className="t" />
                                  </g>
                                )
                              })}
                            </svg>
                          )
                        })()
                      ) : m.id === 'busta-vs-fuori' ? (
                        (() => {
                          const sparkBusta = analyticsData.daily.map(d => d.busta)
                          const sparkFuori = analyticsData.daily.map(d => d.fuori)
                          const allPoints = [...sparkBusta, ...sparkFuori]
                          const minVal = Math.min(...allPoints)
                          const maxVal = Math.max(...allPoints)
                          const diffVal = maxVal - minVal === 0 ? 1 : maxVal - minVal
                          
                          const getPath = (data: number[]) => {
                            const pts = data.map((v, i) => {
                              const x = (i / (data.length - 1)) * 85
                              const y = 26 - ((v - minVal) / diffVal) * 24
                              return `${x.toFixed(1)},${y.toFixed(1)}`
                            })
                            return `M ${pts.join(' L ')}`
                          }
                          
                          return (
                            <svg width="85" height="28" className="opacity-75">
                              <path d={getPath(sparkBusta)} fill="none" stroke="var(--muted)" strokeWidth="1" />
                              <path d={getPath(sparkFuori)} fill="none" stroke="#818cf8" strokeWidth="1" />
                            </svg>
                          )
                        })()
                      ) : m.id === 'burn-rate' ? (
                        <svg width="85" height="28" className="opacity-75">
                          <path
                            d={getSparklinePath(sparkData, 85, 26)}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : m.id === 'withdrawals' ? (
                        (() => {
                          const maxW = Math.max(...sparkData, 1)
                          return (
                            <svg width="85" height="28" className="opacity-75">
                              {sparkData.map((v, idx) => {
                                if (v === 0) return null
                                const x = (idx / (sparkData.length - 1)) * 85
                                const h = (v / maxW) * 22
                                return (
                                  <line
                                    key={idx}
                                    x1={x}
                                    y1={28}
                                    x2={x}
                                    y2={28 - h}
                                    stroke="var(--expense)"
                                    strokeWidth="1.5"
                                  />
                                )
                              })}
                            </svg>
                          )
                        })()
                      ) : m.id === 'savings-rate' ? (
                        (() => {
                          const rate = analyticsData.totals.savingsRate || 0
                          const rateClamped = Math.min(100, Math.max(0, Math.abs(rate)))
                          const strokeDash = (rateClamped / 100) * 50.2
                          return (
                            <svg width="24" height="24" className="opacity-80 transform -rotate-90">
                              <circle cx="12" cy="12" r="8" fill="transparent" stroke="var(--border)" strokeWidth="2.5" />
                              <circle
                                cx="12"
                                cy="12"
                                r="8"
                                fill="transparent"
                                stroke={rate >= 0 ? 'var(--income)' : 'var(--expense)'}
                                strokeWidth="2.5"
                                strokeDasharray="50.2"
                                strokeDashoffset={50.2 - strokeDash}
                              />
                            </svg>
                          )
                        })()
                      ) : (
                        <span className="text-[9px] text-muted italic">Dati insufficienti</span>
                      )
                    ) : (
                      <span className="text-[9px] text-muted italic">Dati insufficienti</span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Main Interactive Detail Chart Screen */}
          <div className="card p-6 space-y-6">
            
            {/* Embedded and Discrete Date Selector (Compact Header) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/5">
              <div className="space-y-1">
                <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block">
                  Dettaglio Grafico Attivo
                </span>
                <h3 className="text-xl font-light text-fg capitalize">
                  {activeGroup?.metrics.find(m => m.id === activeMetric)?.label}
                </h3>
              </div>

              {/* Minimal inline time options */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex p-0.5 bg-elevated rounded-lg">
                  {(['1w', '1m', '2m', '6m', '1y', 'custom', 'custom-period'] as TimeRange[]).map(r => {
                    let label = ''
                    if (r === '1w') label = '1S'
                    if (r === '1m') label = '1M'
                    if (r === '2m') label = '2M'
                    if (r === '6m') label = '6M'
                    if (r === '1y') label = '1A'
                    if (r === 'custom') label = 'Date'
                    if (r === 'custom-period') label = 'Pers'

                    return (
                      <button
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-normal tracking-wider cursor-pointer t ${
                          timeRange === r ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Compact inline custom parameters row */}
            <AnimatePresence mode="wait">
              {timeRange === 'custom' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-4 p-3 bg-elevated/40 rounded-xl border border-border/5"
                >
                  <div className="flex-1">
                    <span className="text-[8px] text-muted tracking-wider uppercase block mb-1">Da data</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className="w-full bg-transparent border-b border-border/20 py-1 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-[8px] text-muted tracking-wider uppercase block mb-1">A data</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className="w-full bg-transparent border-b border-border/20 py-1 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                    />
                  </div>
                </motion.div>
              )}

              {timeRange === 'custom-period' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-4 p-3 bg-elevated/40 rounded-xl border border-border/5"
                >
                  <div className="flex-1">
                    <span className="text-[8px] text-muted tracking-wider uppercase block mb-1">Quantità</span>
                    <input
                      type="number"
                      min="1"
                      value={customPeriodValue}
                      onChange={e => setCustomPeriodValue(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent border-b border-border/20 py-1 text-xs font-light text-fg focus:outline-none focus:border-fg t"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-[8px] text-muted tracking-wider uppercase block mb-1">Unità</span>
                    <select
                      value={customPeriodUnit}
                      onChange={e => setCustomPeriodUnit(e.target.value as CustomPeriodUnit)}
                      className="w-full bg-transparent border-b border-border/20 py-1 text-xs font-light text-fg focus:outline-none focus:border-fg cursor-pointer t"
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

            {/* Chart renders */}
            {analyticsData.daily.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted space-y-2">
                <Info className="w-5 h-5 text-muted/50" />
                <p className="text-xs font-light">Nessuna transazione registrata nel periodo selezionato</p>
              </div>
            ) : activeMetric === 'savings-rate' ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-8">
                <div className="relative w-44 h-44">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="transparent"
                      stroke="var(--border)"
                      strokeWidth="6"
                    />
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
              <div className="space-y-6">
                <div className="relative w-full h-[200px] flex items-end gap-3 px-2 border-b border-border/10">
                  {analyticsData.groupedFlows.map((flow, i) => {
                    const maxVal = Math.max(
                      ...analyticsData.groupedFlows.map(f => Math.max(f.income, f.expense)),
                      10
                    )
                    const incPct = (flow.income / maxVal) * 100
                    const expPct = (flow.expense / maxVal) * 100

                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-12 bg-elevated/95 border border-border/40 text-[10px] p-2 rounded-lg shadow-xl z-20 pointer-events-none transition-all flex flex-col gap-0.5 shrink-0 whitespace-nowrap">
                          <span className="font-medium text-fg mb-0.5">{flow.label}</span>
                          <span className="text-income">Entrate: €{fmt(flow.income)}</span>
                          <span className="text-expense">Uscite: €{fmt(flow.expense)}</span>
                        </div>

                        <div className="w-full flex items-end gap-1 justify-center h-[160px] pb-1">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${incPct}%` }}
                            className="w-2.5 rounded-t-sm bg-income/60 group-hover:bg-income transition-colors"
                          />
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${expPct}%` }}
                            className="w-2.5 rounded-t-sm bg-expense/60 group-hover:bg-expense transition-colors"
                          />
                        </div>
                        <span className="text-[8px] text-muted tracking-wider truncate w-full text-center mt-1 py-1 block">
                          {flow.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                
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

                  {activeMetric === 'busta-vs-fuori' ? (
                    <>
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

          {/* Auxiliary Statistics Cards */}
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
        </>
      )}

    </div>
  )
}
