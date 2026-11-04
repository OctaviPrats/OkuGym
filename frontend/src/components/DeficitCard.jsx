import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { deficitLast, deficitOver, phasesOf, fatOf } from '../lib/nutrition.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { manualGoalSheet } from '../foodSheets.jsx'
import Icon from './Icon.jsx'

// "1830", or "−250" for a stretch spent above maintenance.
export const kcalNum = v => (v < 0 ? '−' + fmtNum(-v) : fmtNum(v))
// "≈ 0.2 kg" — only for an actual deficit: a surplus has no fat loss to show.
export const fatText = (kcal, unit) => (kcal > 0 ? '≈ ' + fmtNum(fatOf(kcal, unit)) + ' ' + unit : '—')
export const daysText = w => t('{0} of {1} days', w.counted, w.n)

// The three running totals: the last 7 and 30 days and the current phase, all up to yesterday.
export function deficitWindows(N, today) {
  const phases = phasesOf(N, today)
  const cur = phases[phases.length - 1]
  return {
    w7: deficitLast(N, 7, today),
    w30: deficitLast(N, 30, today),
    phase: cur ? deficitOver(N, cur.from, cur.to, today) : null,
    phaseFrom: cur ? cur.from : null,
    phases,
  }
}

// Days under a manual goal without a maintenance figure can't count towards the deficit;
// saying how many, with the way to fix it, beats silently showing a smaller number.
export function NoTdeeNote({ n }) {
  if (!n) return null
  return <button className="note dnote" onClick={() => manualGoalSheet()}>
    <Icon name="info" />
    <span>{t(n === 1 ? '{0} day has no maintenance figure and isn’t counted. Add yours to your target.' : '{0} days have no maintenance figure and aren’t counted. Add yours to your target.', n)}</span>
  </button>
}

// The Food tab's running deficit: what matters on a cut is the total, not one day.
export default function DeficitCard() {
  const nav = useNavigate()
  const N = useStore(s => s.S.nutrition)
  const unit = useStore(s => s.S.unit)
  const W = deficitWindows(N, todayISO())
  if (!W.w7) return null
  const cells = [
    { k: 'w7', label: t('{0} days', 7), w: W.w7 },
    { k: 'w30', label: t('{0} days', 30), w: W.w30 },
    { k: 'phase', label: t('Since {0}', fmtDate(W.phaseFrom)), w: W.phase },
  ]
  return <div className="card">
    <button className="dcard" onClick={() => nav('/food/deficit')}>
      <h2><span>{t('Running deficit')} <span className="dim">· kcal</span></span><Icon name="chevronRight" /></h2>
      {W.w30.n ? <div className="avgs">
        {cells.map(c => <div key={c.k} className="avg">
          <div className="l">{c.label}</div>
          <div className="v">{c.w.counted ? kcalNum(c.w.deficit) : '—'}</div>
          <div className="f">{fatText(c.w.deficit, unit)}</div>
          <div className="n">{daysText(c.w)}</div>
        </div>)}
      </div> : <div className="muted small">{t('Your first day counts tomorrow, once it’s over.')}</div>}
    </button>
    <NoTdeeNote n={Math.max(W.w30.noTdee, W.phase ? W.phase.noTdee : 0)} />
  </div>
}

// Home's Nutrition card: the last 7 days in one line, once at least one of them counts.
export function DeficitLine() {
  const nav = useNavigate()
  const N = useStore(s => s.S.nutrition)
  const unit = useStore(s => s.S.unit)
  const w = deficitLast(N, 7, todayISO())
  if (!w || !w.counted) return null
  return <button className="dline" onClick={() => nav('/food/deficit')}>
    <span className="m">
      <span className="l">{t('Last 7 days')}</span>
      <span className="v">
        <b>{fmtNum(Math.abs(w.deficit))}</b> {w.deficit >= 0 ? t('kcal deficit') : t('kcal over maintenance')}
        {w.deficit > 0 && <span className="f"> · {fatText(w.deficit, unit)}</span>}
      </span>
    </span>
    <Icon name="chevronRight" />
  </button>
}
