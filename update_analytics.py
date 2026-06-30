import re

path = 'app/dashboard/analytics/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded cumulative initial values
old_initial = '''    // Cumulative calculations
    let initialNetWorth = 0
    let initialBusta = 0
    let initialFuori = 0
    let initialApple = 0
    let initialPostepay = 0

    const priorTxs = sortedAll.filter(t => new Date(t.created_at) < start)
    priorTxs.forEach(t => {
      const parsed = parseTransaction(t, defaultWallet)
      const effect = getTransactionEffect(t, defaultWallet)
      const delta = effect.income - effect.expense

      if (parsed.wallet === 'busta') initialBusta += delta
      else if (parsed.wallet === 'fuori') initialFuori += delta
      else if (parsed.wallet === 'apple') initialApple += delta
      else if (parsed.wallet === 'postepay') initialPostepay += delta
      
      initialNetWorth += delta
    })'''

new_initial = '''    // Cumulative calculations
    let initialNetWorth = 0
    let initialBalances: Record<string, number> = {}
    walletSlugs.forEach(s => initialBalances[s] = 0)

    const priorTxs = sortedAll.filter(t => new Date(t.created_at) < start)
    priorTxs.forEach(t => {
      const parsed = parseTransaction(t, defaultWallet)
      const effect = getTransactionEffect(t, defaultWallet)
      const delta = effect.income - effect.expense

      if (initialBalances[parsed.wallet] === undefined) initialBalances[parsed.wallet] = 0
      initialBalances[parsed.wallet] += delta
      initialNetWorth += delta
    })'''

content = content.replace(old_initial, new_initial)

# Replace daily calculations
old_daily = '''    let runningBusta = initialBusta
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
        const parsed = parseTransaction(t, defaultWallet)
        const effect = getTransactionEffect(t, defaultWallet)
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
    })'''

new_daily = '''    let runningBalances = { ...initialBalances }
    let runningNetWorth = initialNetWorth

    const daily = days.map(day => {
      const dayTxs = txsByDay[day.dateStr] || []

      let dayIncome = 0
      let dayExpense = 0
      let dayOutsideExpense = 0
      let dayBalancesDelta: Record<string, number> = {}
      let dayNetWorthDelta = 0

      dayTxs.forEach(t => {
        const parsed = parseTransaction(t, defaultWallet)
        const effect = getTransactionEffect(t, defaultWallet)
        const isTransfer = t.title.endsWith('-transfer]')
        const delta = effect.income - effect.expense

        if (dayBalancesDelta[parsed.wallet] === undefined) dayBalancesDelta[parsed.wallet] = 0
        dayBalancesDelta[parsed.wallet] += delta
        dayNetWorthDelta += delta

        if (!isTransfer) {
          dayIncome += effect.income
          dayExpense += effect.expense
          if (parsed.wallet !== defaultWallet) {
            dayOutsideExpense += effect.expense
          }
        }
      })

      walletSlugs.forEach(s => {
        if (runningBalances[s] === undefined) runningBalances[s] = 0
        runningBalances[s] += (dayBalancesDelta[s] || 0)
      })
      runningNetWorth += dayNetWorthDelta

      return {
        date: day.date,
        dateStr: day.dateStr,
        balances: { ...runningBalances },
        netWorth: runningNetWorth,
        income: dayIncome,
        expense: dayExpense,
        outsideExpense: dayOutsideExpense
      }
    })'''

content = content.replace(old_daily, new_daily)

old_totals = '''      totals: {
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
      },'''

new_totals = '''      totals: {
        rangeIncome,
        rangeExpense,
        savingsRate,
        currentNetWorth: runningNetWorth,
        currentBalances: runningBalances,
        totalOutsideExpense,
        avgDailyOutsideExpense
      },'''

content = content.replace(old_totals, new_totals)

old_initial_returns = '''    if (transactions.length === 0) return {
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
      },'''

new_initial_returns = '''    if (transactions.length === 0) return {
      daily: [],
      totals: {
        rangeIncome: 0,
        rangeExpense: 0,
        savingsRate: 0,
        currentNetWorth: 0,
        currentBalances: {},
        totalOutsideExpense: 0,
        avgDailyOutsideExpense: 0
      },'''

content = content.replace(old_initial_returns, new_initial_returns)

# Replace 'busta-vs-fuori' logic in activeChartCoords
old_chart_y_vals = '''    if (activeMetric === 'net-worth') {
      values = daily.map(d => ({ y1: d.netWorth }))
    } else if (activeMetric === 'busta-vs-fuori') {
      values = daily.map(d => ({ y1: d.busta, y2: d.fuori, y3: d.apple, y4: d.postepay }))
    }'''

new_chart_y_vals = '''    if (activeMetric === 'net-worth') {
      values = daily.map(d => ({ y1: d.netWorth }))
    } else if (activeMetric === 'busta-vs-fuori') {
      values = daily.map(d => {
        const vals: any = {}
        wallets.slice(0, 4).forEach((w, i) => {
          vals[`y${i+1}`] = d.balances[w.slug] || 0
        })
        return vals
      })
    }'''
content = content.replace(old_chart_y_vals, new_chart_y_vals)

old_y_flat = '''    const allY = values.flatMap(v => {
      if (activeMetric === 'busta-vs-fuori') {
        return [v.y1, v.y2!, v.y3!, v.y4!]
      }
      return [v.y1]
    })'''
new_y_flat = '''    const allY = values.flatMap(v => {
      if (activeMetric === 'busta-vs-fuori') {
        const arr = []
        if (v.y1 !== undefined) arr.push(v.y1)
        if (v.y2 !== undefined) arr.push(v.y2)
        if (v.y3 !== undefined) arr.push(v.y3)
        if (v.y4 !== undefined) arr.push(v.y4)
        return arr
      }
      return [v.y1]
    })'''
content = content.replace(old_y_flat, new_y_flat)

# Replace debt logic
old_debt_wallets = '''    const wallets: WalletType[] = ['busta', 'fuori', 'apple', 'postepay']
    const walletBreakdown = wallets.map(w => {
      const wCredits = credits.filter(c => c.wallet === w).reduce((s, c) => s + c.amount, 0)
      const wDebts = ownDebts.filter(d => d.wallet === w).reduce((s, d) => s + d.amount, 0)
      return {
        id: w,
        name: w === 'busta' ? '✉️ Busta' : w === 'fuori' ? '✈️ Fuori' : w === 'apple' ? '🍎 Apple Account' : '💳 Postepay',
        credits: wCredits,
        debts: wDebts
      }
    })'''
new_debt_wallets = '''    const walletBreakdown = wallets.map(w => {
      const wCredits = credits.filter(c => c.wallet === w.slug).reduce((s, c) => s + c.amount, 0)
      const wDebts = ownDebts.filter(d => d.wallet === w.slug).reduce((s, d) => s + d.amount, 0)
      return {
        id: w.slug,
        name: w.name,
        credits: wCredits,
        debts: wDebts
      }
    })'''
content = content.replace(old_debt_wallets, new_debt_wallets)

# Replace 'busta-vs-fuori' metric label formatting
old_bvf_metric = '''        {
          id: 'busta-vs-fuori',
          label: 'Distribuzione Fondi',
          icon: Wallet,
          getValue: () => `B: €${fmt(analyticsData.totals.currentBusta || 0)} | F: €${fmt(analyticsData.totals.currentFuori || 0)} | A: €${fmt(analyticsData.totals.currentApple || 0)} | P: €${fmt(analyticsData.totals.currentPostepay || 0)}`,
          getSparklineData: () => analyticsData.daily.map(d => d.busta)
        },'''
new_bvf_metric = '''        {
          id: 'busta-vs-fuori',
          label: 'Distribuzione Fondi',
          icon: Wallet,
          getValue: () => {
             const items = wallets.slice(0, 3).map(w => `${w.name.charAt(0)}: €${fmt(analyticsData.totals.currentBalances[w.slug] || 0)}`)
             return items.join(' | ')
          },
          getSparklineData: () => analyticsData.daily.map(d => d.balances[wallets[0]?.slug] || 0)
        },'''
content = content.replace(old_bvf_metric, new_bvf_metric)

# Replace sparkline for busta vs fuori
old_spark_bvf = '''                      ) : m.id === 'busta-vs-fuori' ? (
                        (() => {
                          const sparkBusta = analyticsData.daily.map(d => d.busta)
                          const sparkFuori = analyticsData.daily.map(d => d.fuori)
                          const sparkApple = analyticsData.daily.map(d => d.apple || 0)
                          const sparkPostepay = analyticsData.daily.map(d => d.postepay || 0)
                          const allPoints = [...sparkBusta, ...sparkFuori, ...sparkApple, ...sparkPostepay]'''
new_spark_bvf = '''                      ) : m.id === 'busta-vs-fuori' ? (
                        (() => {
                          const spark0 = analyticsData.daily.map(d => d.balances[wallets[0]?.slug] || 0)
                          const spark1 = wallets[1] ? analyticsData.daily.map(d => d.balances[wallets[1].slug] || 0) : []
                          const spark2 = wallets[2] ? analyticsData.daily.map(d => d.balances[wallets[2].slug] || 0) : []
                          const spark3 = wallets[3] ? analyticsData.daily.map(d => d.balances[wallets[3].slug] || 0) : []
                          const allPoints = [...spark0, ...spark1, ...spark2, ...spark3]'''
content = content.replace(old_spark_bvf, new_spark_bvf)

old_spark_bvf2 = '''                          return (
                            <svg width="85" height="28" className="opacity-75">
                              <path d={getPath(sparkBusta)} fill="none" stroke="var(--muted)" strokeWidth="1" />
                              <path d={getPath(sparkFuori)} fill="none" stroke="#818cf8" strokeWidth="1" />
                              <path d={getPath(sparkApple)} fill="none" stroke="#38bdf8" strokeWidth="1" />
                              <path d={getPath(sparkPostepay)} fill="none" stroke="#eab308" strokeWidth="1" />
                            </svg>
                          )'''
new_spark_bvf2 = '''                          return (
                            <svg width="85" height="28" className="opacity-75">
                              <path d={getPath(spark0)} fill="none" stroke="var(--muted)" strokeWidth="1" />
                              {spark1.length > 0 && <path d={getPath(spark1)} fill="none" stroke="#818cf8" strokeWidth="1" />}
                              {spark2.length > 0 && <path d={getPath(spark2)} fill="none" stroke="#38bdf8" strokeWidth="1" />}
                              {spark3.length > 0 && <path d={getPath(spark3)} fill="none" stroke="#eab308" strokeWidth="1" />}
                            </svg>
                          )'''
content = content.replace(old_spark_bvf2, new_spark_bvf2)

# Replace detailed chart lines for busta vs fuori
old_detail_bvf = '''                      {/* Busta */}
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

                      {/* Fuori */}
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

                      {/* Apple Account */}
                      <path
                        d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y3}`).join(' ')} L ${
                          activeChartCoords.points[activeChartCoords.points.length - 1].x
                        } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                          activeChartCoords.height - activeChartCoords.pad.bottom
                        } Z`}
                        fill="url(#area-grad-apple)"
                      />
                      <path
                        d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y3!}`).join(' ')}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />

                      {/* Postepay */}
                      <path
                        d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y4}`).join(' ')} L ${
                          activeChartCoords.points[activeChartCoords.points.length - 1].x
                        } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                          activeChartCoords.height - activeChartCoords.pad.bottom
                        } Z`}
                        fill="url(#area-grad-postepay)"
                      />
                      <path
                        d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y4!}`).join(' ')}
                        fill="none"
                        stroke="#eab308"
                        strokeWidth="1.2"
                      />'''
new_detail_bvf = '''                      {wallets[0] && (
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
                        </>
                      )}

                      {wallets[1] && activeChartCoords.points[0].y2 !== undefined && (
                        <>
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
                      )}

                      {wallets[2] && activeChartCoords.points[0].y3 !== undefined && (
                        <>
                          <path
                            d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y3}`).join(' ')} L ${
                              activeChartCoords.points[activeChartCoords.points.length - 1].x
                            } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                              activeChartCoords.height - activeChartCoords.pad.bottom
                            } Z`}
                            fill="url(#area-grad-apple)"
                          />
                          <path
                            d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y3!}`).join(' ')}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="1.2"
                          />
                        </>
                      )}

                      {wallets[3] && activeChartCoords.points[0].y4 !== undefined && (
                        <>
                          <path
                            d={`${activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y4}`).join(' ')} L ${
                              activeChartCoords.points[activeChartCoords.points.length - 1].x
                            } ${activeChartCoords.height - activeChartCoords.pad.bottom} L ${activeChartCoords.points[0].x} ${
                              activeChartCoords.height - activeChartCoords.pad.bottom
                            } Z`}
                            fill="url(#area-grad-postepay)"
                          />
                          <path
                            d={activeChartCoords.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y4!}`).join(' ')}
                            fill="none"
                            stroke="#eab308"
                            strokeWidth="1.2"
                          />
                        </>
                      )}'''
content = content.replace(old_detail_bvf, new_detail_bvf)

# Detailed hover tooltip markers
old_hover_circles = '''                      {activeMetric === 'busta-vs-fuori' ? (
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
                          <circle
                            cx={activeChartCoords.points[hoveredIndex].x}
                            cy={activeChartCoords.points[hoveredIndex].y3!}
                            r="4"
                            fill="#38bdf8"
                          />
                          <circle
                            cx={activeChartCoords.points[hoveredIndex].x}
                            cy={activeChartCoords.points[hoveredIndex].y4!}
                            r="4"
                            fill="#eab308"
                          />
                        </>
                      )'''
new_hover_circles = '''                      {activeMetric === 'busta-vs-fuori' ? (
                        <>
                          {wallets[0] && (
                            <circle
                              cx={activeChartCoords.points[hoveredIndex].x}
                              cy={activeChartCoords.points[hoveredIndex].y1}
                              r="4"
                              fill="var(--muted)"
                            />
                          )}
                          {wallets[1] && activeChartCoords.points[hoveredIndex].y2 !== undefined && (
                            <circle
                              cx={activeChartCoords.points[hoveredIndex].x}
                              cy={activeChartCoords.points[hoveredIndex].y2!}
                              r="4"
                              fill="#818cf8"
                            />
                          )}
                          {wallets[2] && activeChartCoords.points[hoveredIndex].y3 !== undefined && (
                            <circle
                              cx={activeChartCoords.points[hoveredIndex].x}
                              cy={activeChartCoords.points[hoveredIndex].y3!}
                              r="4"
                              fill="#38bdf8"
                            />
                          )}
                          {wallets[3] && activeChartCoords.points[hoveredIndex].y4 !== undefined && (
                            <circle
                              cx={activeChartCoords.points[hoveredIndex].x}
                              cy={activeChartCoords.points[hoveredIndex].y4!}
                              r="4"
                              fill="#eab308"
                            />
                          )}
                        </>
                      )'''
content = content.replace(old_hover_circles, new_hover_circles)

# Hover tooltip text
old_hover_text = '''                    {activeMetric === 'busta-vs-fuori' ? (
                      <div className="space-y-0.5 text-xs font-light">
                        <p className="text-fg flex justify-between gap-4">
                          <span>Busta:</span>
                          <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val1)}</span>
                        </p>
                        <p className="text-[#818cf8] flex justify-between gap-4">
                          <span>Fuori:</span>
                          <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val2!)}</span>
                        </p>
                        <p className="text-[#38bdf8] flex justify-between gap-4">
                          <span>Apple:</span>
                          <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val3!)}</span>
                        </p>
                        <p className="text-[#eab308] flex justify-between gap-4">
                          <span>Postepay:</span>
                          <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val4!)}</span>
                        </p>
                      </div>
                    )'''
new_hover_text = '''                    {activeMetric === 'busta-vs-fuori' ? (
                      <div className="space-y-0.5 text-xs font-light">
                        {wallets[0] && (
                          <p className="text-fg flex justify-between gap-4">
                            <span>{wallets[0].name}:</span>
                            <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val1)}</span>
                          </p>
                        )}
                        {wallets[1] && activeChartCoords.points[hoveredIndex].val2 !== undefined && (
                          <p className="text-[#818cf8] flex justify-between gap-4">
                            <span>{wallets[1].name}:</span>
                            <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val2!)}</span>
                          </p>
                        )}
                        {wallets[2] && activeChartCoords.points[hoveredIndex].val3 !== undefined && (
                          <p className="text-[#38bdf8] flex justify-between gap-4">
                            <span>{wallets[2].name}:</span>
                            <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val3!)}</span>
                          </p>
                        )}
                        {wallets[3] && activeChartCoords.points[hoveredIndex].val4 !== undefined && (
                          <p className="text-[#eab308] flex justify-between gap-4">
                            <span>{wallets[3].name}:</span>
                            <span className="font-normal">€{fmt(activeChartCoords.points[hoveredIndex].val4!)}</span>
                          </p>
                        )}
                      </div>
                    )'''
content = content.replace(old_hover_text, new_hover_text)


with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
