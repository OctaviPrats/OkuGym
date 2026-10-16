// One exercise's history read back as a curve (issue #8). Stats, the exercise sheet and the
// workout screen all draw from this, so the three can never disagree about what "progress"
// means for a lift.
import { modeOf, isBw } from './history.js'
import { bestSetOf } from './onerm.js'

// What the curve measures, decided by how the exercise was logged most recently: top weight,
// most reps (bodyweight with nothing added), longest hold or top speed. Sets logged another
// way lack the field and score 0, so a switched exercise drops its old points instead of
// mixing seconds into a weight chart.
export function progressMetric(entry) {
  const cfg = { ...(entry.target || {}), id: entry.id }
  const mode = modeOf(cfg)
  if (mode === 'cardio') return 'speed'
  if (mode === 'time') return 'sec'
  return isBw(cfg) && !(entry.sets || []).some(s => s.w > 0) ? 'reps' : 'weight'
}

const score = (metric, s) =>
  metric === 'speed' ? s.speed || 0
    : metric === 'sec' ? s.sec || 0
      // a belted set is progress on a different curve — "+20 × 8" is not 8 push-ups
      : metric === 'reps' ? (s.w > 0 ? 0 : s.r || 0)
        : s.w || 0

/**
 * Every session of one exercise as chart points, oldest first.
 *
 * `live` is an optional `{ d, start, entry }` for a session still in progress: the workout
 * screen passes it so today's sets land on the curve next to everything before them as they
 * are checked off. Its points carry `live: true`.
 *
 * Returns `{ metric, pts, best, e1, e1Best }` — `pts` keep each session's finished sets and
 * target (for the list under the chart and the effort marks), `e1` is the estimated-1RM
 * series, which only reps sets with a load produce.
 */
export function exerciseProgress(S, exId, live) {
  const sessions = []
  ;(S.workouts || []).forEach(w => {
    const entry = w.entries.find(e => e.id === exId)
    if (entry) sessions.push({ t: w.start, d: w.d, entry })
  })
  if (live && live.entry) sessions.push({ t: live.start, d: live.d, entry: live.entry, live: true })

  const latest = sessions[sessions.length - 1]
  const metric = progressMetric(latest ? latest.entry : { id: exId })
  const pts = [], e1 = []
  let best = 0, e1Best = null
  sessions.forEach(({ t, d, entry, live: now }) => {
    const sets = entry.sets.filter(s => s.done)
    // topW is the working weight confirmed after the exercise — a weight, and only a weight
    const y = Math.max(0, ...sets.map(s => score(metric, s)), metric === 'weight' ? entry.topW || 0 : 0)
    if (y > 0) {
      pts.push({ t, d, y, sets, target: entry.target || null, live: !!now })
      if (y > best) best = y
    }
    const b = bestSetOf(entry)
    if (b) {
      e1.push({ t, d, y: b.est, w: b.w, r: b.r, live: !!now })
      if (!e1Best || b.est > e1Best.est) e1Best = { est: b.est, w: b.w, r: b.r, d }
    }
  })
  return { metric, pts, best, e1, e1Best }
}

/** Is there anything logged before the live session to compare it against? */
export const hasHistory = prog => prog.pts.some(p => !p.live) || prog.e1.some(p => !p.live)
