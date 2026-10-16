import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { setLabel } from '../lib/history.js'
import { fmtNum, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { displayScale, scaleName, toScale, avgRir } from '../lib/effort.js'
import LineChart from './LineChart.jsx'
import { Segmented } from './ui.jsx'

const FOOT = {
  speed: 'Top speed per workout',
  sec: 'Longest hold per workout',
  reps: 'Most reps in a set per workout',
  weight: 'Best set weight per workout'
}

// The progress curve for one exercise (issue #8), drawn from `prog` (lib/exprogress.js) so
// the caller decides what goes into it — the workout screen adds the session in progress.
// `compact` is the workout-screen size: no list of recent sessions (the "last time" line
// already says it) and no longer explanations, because there the sets are the point.
export default function ExerciseProgress({ exId, prog, compact }) {
  const S = useStore(s => s.S)
  const [pick, setPick] = useState('top')
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const { metric, pts, best, e1, e1Best } = prog
  const unit = metric === 'speed' ? 'km/h' : metric === 'sec' ? 's' : metric === 'reps' ? t('reps') : S.unit
  const now = t('this workout')

  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const rir = pts.map(p => avgRir(p.sets))
  const showE1 = e1.length > 0
  const showEff = rir.filter(v => v != null).length >= 3
  const onE1 = showE1 && pick === 'e1rm'
  const onEff = showEff && pick === 'effort'
  const note = (...xs) => xs.filter(Boolean).join(' · ') || undefined
  const topPts = pts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: rir[i] == null ? null : 1 - Math.min(4, Math.max(0, rir[i])) / 4,
    note: note(rir[i] == null ? '' : hd + ' ' + fmtNum(toScale(kind, rir[i])), p.live && now)
  }))
  const effPts = pts.map((p, i) => (rir[i] == null ? null : { t: p.t, y: toScale(kind, rir[i]), d: p.d, note: note(p.live && now) })).filter(Boolean)
  const e1Pts = e1.map(p => ({ t: p.t, y: p.y, d: p.d, note: note(p.live && now) }))
  const opts = [{ value: 'top', label: t('Top set') }]
  if (showE1) opts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) opts.push({ value: 'effort', label: t('Effort') })
  const h = compact ? 110 : 150

  return <>
    {opts.length > 1 && <Segmented className="seg-range" value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setPick} options={opts} />}
    <div className="chart">
      {onEff
        ? <LineChart points={effPts} h={h} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
        : <LineChart points={onE1 ? e1Pts : topPts} h={h} unit={onE1 ? S.unit : unit} color="var(--blue)" />}
    </div>
    {!compact && <div style={{ marginTop: 8 }}>{pts.slice(-5).reverse().map((p, i) => <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
      <span className="muted">{fmtDate(p.d, true)}{p.live ? ' · ' + now : ''}</span><span>{p.sets.map(s => setLabel(exId, s, p.target)).join('  ')}</span></div>)}</div>}
    <div className="small dim" style={{ marginTop: 8 }}>
      {onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : t(FOOT[metric])}
      {onEff || !(onE1 ? e1Best : best > 0) ? '' : <> · {t('Best:')}{' '}<b className="accent">{fmtNum(onE1 ? e1Best.est : best)} {onE1 ? S.unit : unit}</b></>}
    </div>
    {!compact && onE1 && <div className="small dim" style={{ marginTop: 4 }}>
      {t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}
    </div>}
    {!compact && !onEff && !onE1 && showEff && <div className="small dim" style={{ marginTop: 4 }}>
      {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
    </div>}
  </>
}
