import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { goalOn, totals, dayLog, SLOTS } from '../lib/nutrition.js'
import { fmtNum, fmtDate, todayISO, isoOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { addFoodSheet, entrySheet, entrySub, manualGoalSheet, slotName } from '../foodSheets.jsx'
import { Bar, MacroRows, Remaining } from '../components/NutritionCard.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const DEFICIT_NAME = { 10: 'gentle deficit', 20: 'moderate deficit', 25: 'aggressive deficit' }

// The Food tab: one day of eating against its target, meal by meal.
export default function Food() {
  const nav = useNavigate()
  const N = useStore(s => s.S.nutrition)
  const today = todayISO()
  const [day, setDay] = useState(today)
  if (!goalOn(N, today)) return <Intro />

  const goal = goalOn(N, day)
  const log = dayLog(N, day)
  const sum = totals(log)
  const shift = d => {
    const x = new Date(day + 'T12:00:00'); x.setDate(x.getDate() + d)
    const iso = isoOf(x)
    if (iso <= today) setDay(iso)
  }
  const sub = t('Target {0} kcal', fmtNum(goal.kcal)) + (goal.method !== 'manual' && DEFICIT_NAME[goal.pct] ? ' · ' + t(DEFICIT_NAME[goal.pct]) : '')

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Food')}</h1><div className="sub">{sub}</div></div>
      <button className="iconbtn" style={{ color: 'var(--yellow)' }} onClick={() => nav('/food/goal')} aria-label={t('Target and macros')}><Icon name="target" /></button>
    </div>

    <div className="card">
      <div className="row between">
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => shift(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{day === today ? t('Today') + ', ' + fmtDate(day, true) : fmtDate(day, true)}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15, opacity: day === today ? 0.3 : 1 }} disabled={day === today}
          onClick={() => shift(1)} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
      </div>
      <Remaining eaten={sum.kcal} goal={goal} big />
      <Bar value={sum.kcal} of={goal.kcal} size="lg" />
      <div className="kfoot"><span>{t('{0} eaten', fmtNum(sum.kcal))}</span><span>{t('Target {0}', fmtNum(goal.kcal))}</span></div>
      <hr className="divider" />
      <MacroRows sum={sum} goal={goal} />
    </div>

    {SLOTS.map(slot => {
      const es = log.filter(e => e.slot === slot)
      return <section key={slot} className="sect">
        <h2 className="sect-t split"><span>{slotName(slot)}</span><span>{es.length ? fmtNum(totals(es).kcal) + ' kcal' : '—'}</span></h2>
        <div className="sect-b">
          {es.map(e => <button key={e.id} className="lrow tap" onClick={() => entrySheet(day, e)}>
            <span className="lrow-m"><span className="lrow-t">{e.name}</span>{entrySub(e) && <span className="lrow-s">{entrySub(e)}</span>}</span>
            <span className="lrow-v">{fmtNum(e.kcal)}</span>
          </button>)}
          <button className="lrow tap add" onClick={() => addFoodSheet(slot, day)}><Icon name="plus" /><span className="lrow-t">{t('Add')}</span></button>
        </div>
      </section>
    })}
  </div>
}

function Intro() {
  const nav = useNavigate()
  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Food')}</h1><div className="sub">{t('Calories and macros, without the guesswork')}</div></div></div>
    <div className="card">
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <span className="lrow-i" style={{ '--tint': 'var(--yellow)' }}><Icon name="target" /></span>
        <div className="big" style={{ fontSize: 22 }}>{t('Set your daily target')}</div>
      </div>
      <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.45 }}>
        {t('Worked out from your weight, body fat and training: calories for a deficit you choose, and how much protein, fat and carbs. Then log what you eat against it — describe a meal and AI does the numbers.')}
      </div>
      <Button variant="primary" icon="sparkles" onClick={() => nav('/food/goal')}>{t('Calculate my target')}</Button>
      <div style={{ height: 8 }} />
      <Button onClick={() => manualGoalSheet()}>{t('Enter my own numbers')}</Button>
    </div>
  </div>
}
