import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  deficitOver, goalOn, phasesOf, startPhase, removePhase, shiftDay, emptyNutrition, KCAL_PER_KG, LB,
} from '../lib/nutrition.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { deficitWindows, kcalNum, fatText, daysText, NoTdeeNote } from '../components/DeficitCard.jsx'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Row, Section, Segmented } from '../components/ui.jsx'

const ui = () => useUI.getState()
const update = (...a) => useStore.getState().update(...a)
const mutate = fn => update(s => { if (!s.nutrition) s.nutrition = emptyNutrition(); fn(s.nutrition) })
const range = (from, to) => fmtDate(from) + ' – ' + fmtDate(to)

// The running deficit over a window, a day at a time: how it built up against what the
// target planned, which days added to it, and the diet's phases.
export default function FoodDeficit() {
  const nav = useNavigate()
  const N = useStore(s => s.S.nutrition)
  const unit = useStore(s => s.S.unit)
  const [win, setWin] = useState('w7')
  const today = todayISO()
  const W = deficitWindows(N, today)
  if (!W.w7) return <Navigate to="/food" replace />

  const leave = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/food'))
  const goal = goalOn(N, today)
  const w = W[win]
  const label = { w7: t('Last 7 days'), w30: t('Last 30 days'), phase: t('This phase, since {0}', fmtDate(W.phaseFrom)) }[win]
  const cur = W.phases[W.phases.length - 1]

  return <div className="narrow">
    <div className="hdr sm">
      <button className="iconbtn" onClick={leave} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <h1>{t('Running deficit')}</h1>
        <div className="sub">{goal && goal.tdee ? t('Against your maintenance, {0} kcal', fmtNum(goal.tdee)) : t('Against your maintenance')}</div>
      </div>
      <button className="iconbtn" onClick={() => deficitInfoSheet(W, unit)} aria-label={t('How it’s worked out')}><Icon name="info" /></button>
    </div>

    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 'w7', label: t('{0} days', 7) }, { value: 'w30', label: t('{0} days', 30) }, { value: 'phase', label: t('Phase') }]} />

    <div className="card">
      <div className="small muted">{label} · {t('up to yesterday')}</div>
      {w.n ? <>
        <div className="dtot">
          <span className="n">{w.counted ? fmtNum(Math.abs(w.deficit)) : '—'}</span>
          <span className="u">{w.deficit >= 0 ? t('kcal deficit') : t('kcal over maintenance')}</span>
        </div>
        {w.deficit > 0 && <div className="dfat">{t('{0} of fat', fatText(w.deficit, unit))}</div>}
        <hr className="divider" />
        <div className="kv">
          <span>{t('Days that count')}</span><span>{daysText(w)}</span>
          <span>{t('Planned by your target')}</span><span>{kcalNum(w.planned)} kcal</span>
        </div>
      </> : <div className="muted" style={{ marginTop: 8 }}>{t('Your first day counts tomorrow, once it’s over.')}</div>}
      <NoTdeeNote n={w.noTdee} />
    </div>

    {w.n > 1 && <>
      <div className="card">
        <h2>{t('Running total')}</h2>
        <RunningChart days={w.days} label={t('{0} kcal of deficit against {1} planned', kcalNum(w.deficit), kcalNum(w.planned))} />
        <div className="dax"><span>{fmtDate(w.from)}</span><span>{fmtDate(w.to)}</span></div>
        <div className="dleg">
          <span><i className="ln" />{t('Actual')} {kcalNum(w.deficit)}</span>
          <span><i className="ln dash" />{t('Expected')} {kcalNum(w.planned)}</span>
        </div>
      </div>
      <DayBars days={w.days} />
    </>}

    <Section title={t('Phases')} footer={t('Today counts once it’s over. A day with nothing logged, under half its target, or marked incomplete adds nothing.')}>
      {[...W.phases].reverse().map((p, i) => {
        const s = deficitOver(N, p.from, p.to, today)
        const first = p.from === W.phases[0].from
        const sub = [i === 0 ? t('Since {0}', fmtDate(p.from)) : null, daysText(s), s.deficit > 0 ? fatText(s.deficit, unit) : null].filter(Boolean).join(' · ')
        return <Row key={p.from} title={i === 0 ? t('Current phase') : range(p.from, p.to)} subtitle={sub}
          value={kcalNum(s.deficit) + ' kcal'}
          onClick={first ? undefined : () => confirmSheet({
            title: t('Join with the phase before?'),
            message: t('Its days go back into the phase before it. Nothing you logged changes.'),
            confirmText: t('Join phases'),
            onConfirm: () => mutate(n => removePhase(n, p.from)),
          })} />
      })}
      {cur.from < today && <button className="lrow tap add" onClick={() => newPhaseSheet()}>
        <Icon name="reset" /><span className="lrow-t">{t('Start a new phase')}</span>
      </button>}
    </Section>
  </div>
}

// The deficit added up day by day, against what the target planned (dashed).
function RunningChart({ days, label }) {
  const VW = 300, VH = 110
  let r = 0, p = 0
  const real = [0], plan = [0]
  for (const d of days) { r += d.deficit; p += d.planned; real.push(r); plan.push(p) }
  const hi = Math.max(1, ...real, ...plan), lo = Math.min(0, ...real)
  const x = k => ((k * VW) / days.length).toFixed(1)
  const y = v => (VH - 2 - ((v - lo) / (hi - lo)) * (VH - 4)).toFixed(1)
  const pts = a => a.map((v, k) => x(k) + ',' + y(v)).join(' ')
  return <svg className="dchart" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" role="img" aria-label={label}>
    <line className="base" x1="0" x2={VW} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
    <polygon className="area" points={`${pts(real)} ${VW},${y(0)} 0,${y(0)}`} />
    <polyline className="plan" points={pts(plan)} vectorEffect="non-scaling-stroke" />
    <polyline className="real" points={pts(real)} vectorEffect="non-scaling-stroke" />
  </svg>
}

// A bar per day around the maintenance line: up for a deficit, down (in grey, never red) for a
// day above it, and an outline for a day that doesn't count. Past nine weeks a bar per week —
// a bar per day would be thinner than a pixel.
function DayBars({ days }) {
  const weekly = days.length > 63
  const groups = []
  for (let i = 0; i < days.length; i += weekly ? 7 : 1) groups.push(days.slice(i, i + (weekly ? 7 : 1)))
  const bars = groups.map(g => ({ counts: g.some(d => d.counts && d.tdee), deficit: g.reduce((a, d) => a + d.deficit, 0) }))
  const max = Math.max(100, ...bars.map(b => Math.abs(b.deficit)))
  const px = v => Math.max(2, Math.round((Math.abs(v) / max) * 56))
  const gap = bars.length > 20 ? 2 : bars.length > 8 ? 6 : 10
  const off = bars.filter(b => !b.counts).length
  return <div className="card">
    <h2>{weekly ? t('Each week') : t('Each day')}</h2>
    <div className="dbars" role="img" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, columnGap: gap }}
      aria-label={t('Deficit of each day; {0} don’t count', off)}>
      {bars.map((b, i) => <span key={i}>
        {!b.counts ? <i className="off" style={{ top: 53, height: 7 }} />
          : b.deficit >= 0 ? <i style={{ top: 60 - px(b.deficit), height: px(b.deficit) }} />
            : <i className="over" style={{ top: 61, height: Math.min(38, px(b.deficit)) }} />}
      </span>)}
    </div>
    <div className="dleg">
      <span><i className="sq" />{t('Deficit')}</span>
      <span><i className="sq over" />{t('Over maintenance')}</span>
      <span><i className="sq off" />{t('Doesn’t count')}</span>
    </div>
  </div>
}

/* ============================ how it's worked out ============================ */

const balanceText = w => (!w || !w.complete ? '—'
  : w.balance > 0 ? t('{0} kcal under', fmtNum(w.balance))
    : w.balance < 0 ? t('{0} kcal over', fmtNum(-w.balance)) : t('On target'))

// The headline is the deficit against maintenance; the balance against the target — the
// number the day screen shows — lives here, with the reason they differ.
function DeficitInfo({ W, unit, close }) {
  const ex = [...W.w30.days].reverse().find(d => d.counts && d.tdee)
  const perUnit = unit === 'lb' ? Math.round((KCAL_PER_KG * LB) / 100) * 100 : KCAL_PER_KG
  const w7 = W.w7
  return <>
    <h3>{t('How it’s worked out')}</h3>
    <Section title={t('One day’s deficit')} footer={t('The running deficit adds up each day’s. {0} kcal is roughly 1 {1} of body fat.', fmtNum(perUnit), unit)}>
      {ex ? <>
        <Row title={t('Maintenance')} value={fmtNum(ex.tdee)} />
        <Row title={t('Eaten on {0}', fmtDate(ex.iso, true))} value={'− ' + fmtNum(ex.eaten)} />
        <Row title={t('Deficit')} value={kcalNum(ex.deficit) + ' kcal'} />
      </> : <Row title={t('Maintenance − what you ate')} />}
    </Section>
    <Section title={t('Against your target')}
      footer={w7.complete && w7.balance < 0 && w7.deficit > 0
        ? t('Going over your target isn’t leaving your deficit: these 7 days you ate {0} kcal more than your target and are still {1} kcal under maintenance.', fmtNum(-w7.balance), fmtNum(w7.deficit))
        : t('Your target already includes the deficit you chose: eating to it keeps you under maintenance.')}>
      <Row title={t('{0} days', 7)} value={balanceText(W.w7)} />
      <Row title={t('{0} days', 30)} value={balanceText(W.w30)} />
      <Row title={t('Phase')} value={balanceText(W.phase)} />
    </Section>
    <h4 className="sec">{t('Which days count')}</h4>
    <div className="card dinfo">
      <span>{t('Today counts once it’s over.')}</span>
      <span>{t('A day with nothing logged, under half its target, or marked incomplete adds nothing — it isn’t read as a day without eating.')}</span>
      <span className="muted">{t('Your maintenance comes from a formula and can be 10–15 % off for you. If your weight trend falls slower than this suggests, your real maintenance is lower.')}</span>
    </div>
    <Button variant="primary" onClick={close}>{t('Got it')}</Button>
    <div style={{ height: 8 }} />
  </>
}
const deficitInfoSheet = (W, unit) => ui().openSheet(close => <DeficitInfo W={W} unit={unit} close={close} />)

/* ============================ a new phase ============================ */

// Starts the running total again from a day the user picks. The phase before is kept in the
// history, and the toast offers to undo it.
function NewPhase({ close }) {
  const N = useStore(s => s.S.nutrition)
  const unit = useStore(s => s.S.unit)
  const today = todayISO()
  const cur = phasesOf(N, today).at(-1)
  const min = shiftDay(cur.from, 1)
  const [other, setOther] = useState(false)
  const [date, setDate] = useState(shiftDay(today, -1) >= min ? shiftDay(today, -1) : today)
  const from = other && date >= min && date <= today ? date : today
  const kept = deficitOver(N, cur.from, shiftDay(from, -1), today)
  const save = () => {
    let ok = false
    mutate(n => { ok = startPhase(n, from, today) })
    close()
    if (ok) ui().toast(t('New phase from {0}', fmtDate(from)), { label: t('Undo'), run: () => mutate(n => removePhase(n, from)) })
  }
  return <>
    <h3>{t('Start a new phase')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('The running total starts again from the day you choose. The current phase is kept in your history — nothing is deleted.')}</div>
    <Section title={t('Kept')}>
      <Row title={kept.n ? range(cur.from, kept.to) : fmtDate(cur.from)} subtitle={[daysText(kept), kept.deficit > 0 ? fatText(kept.deficit, unit) : null].filter(Boolean).join(' · ')}
        value={kcalNum(kept.deficit) + ' kcal'} />
    </Section>
    <Section title={t('The new phase starts')} footer={t('For when you’re back from holidays, after a diet break or when you start another stretch. Changing your target doesn’t start a new phase.')}>
      <Row title={t('Today, {0}', fmtDate(today, true))} accessory={other ? 'none' : 'check'} onClick={() => setOther(false)} />
      <Row title={t('Another day')} accessory={other ? 'check' : 'none'} onClick={() => setOther(true)} />
      {other && <Row title={t('From')}>
        <input type="date" className="dinput" value={date} min={min} max={today} aria-label={t('From')}
          onChange={e => setDate(e.target.value)} />
      </Row>}
    </Section>
    <Button variant="primary" onClick={save}>{t('Start phase')}</Button>
    <div style={{ height: 8 }} />
  </>
}
const newPhaseSheet = () => ui().openSheet(close => <NewPhase close={close} />)
