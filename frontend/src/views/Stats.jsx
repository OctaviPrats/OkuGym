import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, lastBF, streakWeeks, effortOf } from '../lib/history.js'
import { fmtNum, todayISO, weekKey } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet, bfSheet, goalSheet, bfGoalSheet, calendarSheet, workoutDetailSheet, WorkoutRow, bwDeltaColor, bfDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import BodyAverages from '../components/BodyAverages.jsx'
import ExerciseProgress from '../components/ExerciseProgress.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { exerciseProgress } from '../lib/exprogress.js'
import {
  hasEffort, displayScale, scaleName, toScale, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR
} from '../lib/effort.js'
import { Button, Segmented, SelectRow } from '../components/ui.jsx'

// Which muscles the training in a window actually hit — and, the point of the card,
// which ones it keeps missing. Shading is relative within the window (lib/muscles.js).
function MuscleBalance({ S }) {
  const [win, setWin] = useState(7)
  const [hard, setHard] = useState(false)
  const [sel, setSel] = useState(null)
  const now = Date.now()
  const inWin = S.workouts.filter(w =>
    win === 0 ? true
      : win === 7 ? weekKey(w.d) === weekKey(todayISO())
        : (w.start || new Date(w.d).getTime()) > now - win * 86400000)
  // Counting only the sets taken near failure turns the map from "where did the volume go"
  // into "where did the stimulus go" — a muscle can lead on sets and still never be trained
  // hard. Offered only when the window holds ratings at all, since with none the hard map
  // would just be empty and read as "you trained nothing".
  const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
  const on = hard && rated
  const load = loadOfWorkouts(inWin, on ? isHardSet : null)
  const { worked, missed } = rankOf(load)
  const top = worked.slice(0, 4)
  const max = worked.length ? load[worked[0]] : 0
  const sets = m => Math.round((load[m] || 0) * 10) / 10

  return <div className="card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Muscle balance')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
      {rated && <Button size="sm" icon="flame" style={on ? { color: 'var(--yellow)' } : undefined}
        onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
    </div>
    <Segmented className="seg-range" value={win} onChange={v => { setWin(v); setSel(null) }}
      options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
    {inWin.length ? <>
      <BodyMap className="tappable" load={load} body={S.body} selected={sel}
        onMuscle={m => setSel(s => (s === m ? null : m))} />
      <BodyMapLegend />
      {sel && <div className="mrow" style={{ borderTop: 'var(--hair) solid var(--sep)', marginTop: 4, paddingTop: 10 }}>
        <span className="nm"><b>{t(MUSCLE_NAME[sel])}</b></span>
        <span className="v">{sets(sel) ? t('{0} sets', sets(sel)) : on ? t('no hard sets') : t('not trained')}</span>
      </div>}
      {!sel && top.map(m => <div key={m} className="mrow">
        <span className="nm">{t(MUSCLE_NAME[m])}</span>
        <span className="bar"><i style={{ width: Math.round(load[m] / max * 100) + '%', background: on ? 'var(--yellow)' : undefined }} /></span>
        <span className="v">{t('{0} sets', sets(m))}</span>
      </div>)}
      {missed.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{on ? t('No hard sets in this period') : t('Not trained in this period')}</h4>
        <div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div>
      </>}
      {!missed.length && worked.length > 0 &&
        <div className="muted small" style={{ marginTop: 10 }}>{on
          ? t('Every muscle group got at least one hard set in this period.')
          : t('Every muscle group got some work in this period.')}</div>}
    </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
  </div>
}

// How hard the training was — the half of the picture a volume chart cannot show. Everything
// is computed in RIR (lib/effort.js) and converted to whichever scale this profile reads.
// Every number carries how much of the training it speaks for: rating is optional and off by
// default, so a partly rated history is the normal case, and an average without its
// denominator would quietly speak for sets that were never rated.
function EffortCard({ S }) {
  const [win, setWin] = useState(90)
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const maxBin = Math.max(1, ...hist.map(b => b.n))
  // The week's set count rides along in the tooltip, because the pair is the reading:
  // volume up with effort up is fatigue piling up, volume up with effort flat is adaptation.
  const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
  // Bins run hardest-first in both scales: RIR 0 and RPE 10 are the same set.
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))

  return <div className="card">
    <h2>{t('Effort')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('how close to failure')}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum.rated === 0 ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="stat-v">{sum.avg == null ? '—' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd}</div>
          <div className="small dim">{t('average effort')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-v" style={{ color: 'var(--yellow)' }}>{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="small dim">{t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR)))}</div>
        </div>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {effortOf(S) === 'none' && <div className="small" style={{ color: 'var(--yellow)', marginTop: 4 }}>
        {t('Effort per set is switched off — turn it on in Settings to keep rating.')}
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec" style={{ marginTop: 12 }}>{t('Where the sets land')}</h4>
      {hist.map(b => <div key={b.rir} className="mrow">
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i style={{ width: Math.round(b.n / maxBin * 100) + '%', background: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '—'}</span>
      </div>)}
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('Most working sets belong close to failure without living there — half at the floor and half at the top average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

// Stats = the analytics hub: all charts, progress and history live here.
export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState(90)
  const [exId, setExId] = useState(null)
  const now = Date.now()
  const anyEffort = hasEffort(S)

  const bwPts = S.bodyweight.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
  const bodyfat = S.bodyComp || []
  const bfPts = bodyfat.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.v, d: b.d }))
  const bf30 = bodyfat.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bfDelta30 = bf30.length > 1 ? bf30[bf30.length - 1].v - bf30[0].v : null
  const monthW = S.workouts.filter(w => w.d.slice(0, 7) === todayISO().slice(0, 7)).length

  const exHist = [...new Set(S.workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => EXIDX[id]).sort((a, b) => EXIDX[a].n < EXIDX[b].n ? -1 : 1)
  const curEx = exId && exHist.includes(exId) ? exId : exHist[0] || null
  const prog = curEx ? exerciseProgress(S, curEx) : null

  return <>
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">{t('Progress & history')}</div></div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button></div>

    <div className="tiles">
      <div className="tile"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v">{S.workouts.length}</div></div>
      <div className="tile"><div className="l"><Icon name="calendar" />{t('This month')}</div><div className="v">{monthW}</div></div>
      <div className="tile"><div className="l"><Icon name="flame" />{t('Week streak')}</div><div className="v">{streakWeeks(S)}</div></div>
      <div className="tile"><div className="l"><Icon name="scale" />{t('Weight 30d')}</div><div className="v" style={{ fontSize: 22, color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0) }}>{bwDelta30 === null ? '—' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}</div></div>
      <div className="tile"><div className="l"><Icon name="target" />{t('Body fat 30d')}</div><div className="v" style={{ fontSize: 22, color: bfDelta30 === null ? 'inherit' : bfDeltaColor(bfDelta30, (lastBF(S) || {}).bf || 0) }}>{bfDelta30 === null ? '—' : (bfDelta30 > 0 ? '+' : '') + fmtNum(bfDelta30) + '%'}</div></div>
    </div>

    <div className="card">
      <h2>{t('Activity — last 12 months')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('by time trained')}</span></h2>
      <Heatmap S={S} onDay={iso => { const ws = S.workouts.filter(w => w.d === iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
    </div>

    {S.workouts.length > 0 && <MuscleBalance S={S} />}
    {anyEffort && <EffortCard S={S} />}

    <div className="cols">
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bwPts} h={160} unit={S.unit} goal={S.targetW} /></div>
        {S.bodyweight.length > 0 && <BodyAverages log={S.bodyweight} field="w" suffix={' ' + S.unit} />}
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('Body fat')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" icon="target" style={S.targetBF ? { color: 'var(--yellow)' } : undefined} onClick={bfGoalSheet}>{S.targetBF ? fmtNum(S.targetBF) + '%' : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={bfSheet}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range" value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="chart"><LineChart points={bfPts} h={160} unit="%" goal={S.targetBF} /></div>
        {bodyfat.length > 0 && <BodyAverages log={bodyfat} field="v" suffix="%" />}
      </div>

      <div className="card">
        <h2>{t('Exercise progress')}</h2>
        {exHist.length ? <>
          <div className="sect-b" style={{ marginBottom: 10 }}>
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(id => ({ value: id, label: EXIDX[id].n }))} />
          </div>
          <ExerciseProgress exId={curEx} prog={prog} />
        </> : <div className="muted small">{t('Finish your first workout to see progress curves here.')}</div>}
      </div>
    </div>

    {S.workouts.length > 0 && <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Recent workouts')}</h4>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {S.workouts.length}</Button>
      </div>
      <div className="list">{[...S.workouts].reverse().slice(0, 6).map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </>}
  </>
}
