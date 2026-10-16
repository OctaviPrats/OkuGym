import { useUI } from '../store/useUI.js'
import { modeOf, isBw, repStep, EFFORT, stepEffort, capEffort } from '../lib/history.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Check, NumberField } from './ui.jsx'

// The set table of one exercise — header plus one row per set (reps: weight×reps · time: a
// held duration · cardio: duration+speed). Shared by the workout screen and the editor for a
// finished workout (issue #9), so a set is corrected with the same controls it was logged with.
// `effort` is the scale the third column walks ('rir' | 'rpe' | 'none'); `onStartTimed` adds
// the work-timer button that a live timed set is started with.
export default function SetRows({ entry, unit, effort, onField, onToggle, onStartTimed }) {
  const working = useUI(s => s.work)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // stepper instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', unit) : t('Weight ({0})', unit) }
  // The reps column is the total in every mode, unilateral included — the stepper walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, hd: t('Speed (km/h)') }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third stepper to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const eff = EFFORT[effort]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: effort, dec: true, opt: true, hd: t(eff.hd) } : null
  const go = timed && onStartTimed
  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  const bump = (s, i, col, dir) => {
    if (col.eff) return onField(i, col.f, stepEffort(col.eff, s[col.f], dir))
    onField(i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  // Uses the shared stepper markup so a set row picks up the same control styling
  // as every other +/- field in the app.
  const cell = (s, i, col, cls) => (
    <div className={'stp ' + cls}>
      <button aria-label="Decrease" onClick={() => bump(s, i, col, -1)}><Icon name="minus" /></button>
      {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
      <span className="val"><NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
        onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} /></span>
      <button aria-label="Increase" onClick={() => bump(s, i, col, 1)}><Icon name="plus" /></button>
    </div>
  )
  return <>
    {/* the header carries the same eff3 sizing as the rows, or the labels drift off their columns */}
    <div className={'sethead' + (col3 ? ' eff3' : '')}><span className="n-sp" /><span className="w-sp">{col1.hd}</span>{col2 && <span className="r-sp">{col2.hd}</span>}{col3 && <span className="eff-sp">{col3.hd}</span>}{go && <span className="ck-sp" />}<span className="ck-sp" /></div>
    {entry.sets.map((s, i) => <div key={i} className={'setrow' + (s.done ? ' done' : '') + (col3 ? ' eff3' : '')}>
      <div className="n">{i + 1}</div>
      {cell(s, i, col1, 'w')}
      {col2 && cell(s, i, col2, 'r')}
      {col3 && cell(s, i, col3, 'eff')}
      {/* A timed set is started, not typed: the timer counts the hold down and checks the
          set off itself. The checkbox stays for anyone who timed it on their own watch. */}
      {go && <button className="setgo" aria-label={t('Start set')} disabled={s.done || !!working}
        onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
      <Check checked={s.done} onChange={() => onToggle(i)} />
    </div>)}
  </>
}
