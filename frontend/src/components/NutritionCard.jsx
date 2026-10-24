import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { goalOn, totals, dayLog, slotAt } from '../lib/nutrition.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { addFoodSheet } from '../foodSheets.jsx'
import { Button } from './ui.jsx'

const MACROS = [
  { k: 'p', label: 'Protein' },
  { k: 'f', label: 'Fat' },
  { k: 'c', label: 'Carbs' },
]
const pct = (v, of) => (of > 0 ? Math.min(100, (v / of) * 100) : 0)

export const Bar = ({ value, of, size = '', color }) => (
  <div className={'kbar ' + size}><span style={{ width: pct(value, of) + '%', background: color }} /></div>
)

// What's left today, in the one number that matters. Going over is said plainly, never in red:
// a day over target is information, not a failure.
export function Remaining({ eaten, goal, big }) {
  const left = goal.kcal - eaten
  const over = left < 0
  return big ? (
    <div className="kleft">
      <div className="n">{fmtNum(Math.abs(left))}</div>
      <div className="u">{over ? t('kcal over') : t('kcal left')}</div>
    </div>
  ) : (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <div className="big">{fmtNum(Math.abs(left))}</div>
      <span className="muted" style={{ fontSize: 16 }}>{over ? t('kcal over') : t('kcal left')}</span>
      <span className="muted small" style={{ marginLeft: 'auto' }}>{t('{0} of {1}', fmtNum(eaten), fmtNum(goal.kcal))}</span>
    </div>
  )
}

// Protein / fat / carbs against the goal — three columns on Home, rows on the Food screen.
export function MacroGrid({ sum, goal }) {
  return <div className="mgrid">
    {MACROS.map(m => <div key={m.k}>
      <div className="l">{t(m.label)}</div>
      <div className="v">{fmtNum(Math.round(sum[m.k]))} <i>/ {fmtNum(goal[m.k])} g</i></div>
      <Bar value={sum[m.k]} of={goal[m.k]} size="sm" color={`var(--mac-${m.k})`} />
    </div>)}
  </div>
}
export function MacroRows({ sum, goal }) {
  return <div className="macrows">
    {MACROS.map(m => <div key={m.k} className="macrow">
      <div className="h"><span>{t(m.label)}</span><span>{fmtNum(Math.round(sum[m.k]))} <i>/ {fmtNum(goal[m.k])} g</i></span></div>
      <Bar value={sum[m.k]} of={goal[m.k]} color={`var(--mac-${m.k})`} />
    </div>)}
  </div>
}

// Today on Home: only once a target exists — before that the Food tab is where it starts.
export default function NutritionCard() {
  const nav = useNavigate()
  const N = useStore(s => s.S.nutrition)
  const today = todayISO()
  const goal = goalOn(N, today)
  if (!goal) return null
  const sum = totals(dayLog(N, today))
  return <div className="card">
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Nutrition')}</h2>
      <Button size="sm" icon="plus" onClick={() => addFoodSheet(slotAt(new Date().getHours()), today)}>{t('Add')}</Button>
    </div>
    <div className="tappable" style={{ cursor: 'pointer' }} onClick={() => nav('/food')}>
      <Remaining eaten={sum.kcal} goal={goal} />
      <div style={{ marginTop: 10 }}><Bar value={sum.kcal} of={goal.kcal} /></div>
      <MacroGrid sum={sum} goal={goal} />
    </div>
  </div>
}
