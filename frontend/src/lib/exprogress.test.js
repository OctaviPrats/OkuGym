import { describe, it, expect } from 'vitest'
import { exerciseProgress, progressMetric, hasHistory } from './exprogress.js'
import { EXDB } from './exercises.js'

const CARDIO = EXDB.find(e => e.bp === 'cardio').id
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const BW = EXDB.find(e => e.eq === 'body weight').id

const wo = (d, start, entry) => ({ d, start, entries: [entry] })
const set = (o, done = true) => ({ ...o, done })

describe('progressMetric', () => {
  it('reads each mode in its own terms', () => {
    expect(progressMetric({ id: LIFT, sets: [] })).toBe('weight')
    expect(progressMetric({ id: CARDIO, sets: [] })).toBe('speed')
    expect(progressMetric({ id: LIFT, target: { mode: 'time' }, sets: [] })).toBe('sec')
  })

  it('tracks reps for bodyweight work, and weight once a belt is involved', () => {
    expect(progressMetric({ id: BW, sets: [set({ w: 0, r: 12 })] })).toBe('reps')
    expect(progressMetric({ id: BW, sets: [set({ w: 10, r: 8 })] })).toBe('weight')
    // a config that says bodyweight wins over the catalogue, in both directions
    expect(progressMetric({ id: LIFT, target: { bodyweight: true }, sets: [set({ r: 20 })] })).toBe('reps')
    expect(progressMetric({ id: BW, target: { bodyweight: false }, sets: [set({ w: 0, r: 12 })] })).toBe('weight')
  })

  it('copes with an entry that has no sets at all', () => {
    expect(progressMetric({ id: LIFT })).toBe('weight')
  })
})

describe('exerciseProgress', () => {
  const S = {
    workouts: [
      wo('2026-09-01', 1, { id: LIFT, sets: [set({ w: 60, r: 8 }), set({ w: 62.5, r: 6 }), set({ w: 100, r: 1 }, false)] }),
      wo('2026-09-03', 2, { id: CARDIO, sets: [set({ min: 20, speed: 9 })] }),
      wo('2026-09-05', 3, { id: LIFT, topW: 65, sets: [set({ w: 62.5, r: 8 })] })
    ]
  }

  it('draws one point per session from finished sets only', () => {
    const p = exerciseProgress(S, LIFT)
    expect(p.metric).toBe('weight')
    expect(p.pts.map(x => [x.d, x.y])).toEqual([['2026-09-01', 62.5], ['2026-09-05', 65]])
    expect(p.best).toBe(65)
    // the unchecked 100×1 never happened, so it is not in the list under the chart either
    expect(p.pts[0].sets).toHaveLength(2)
  })

  it('counts the confirmed working weight on a weight curve', () => {
    expect(exerciseProgress(S, LIFT).pts[1].y).toBe(65)
  })

  it('carries the estimated 1RM series and where its best came from', () => {
    const p = exerciseProgress(S, LIFT)
    expect(p.e1.map(x => x.y)).toEqual([76, 79.2])
    expect(p.e1Best).toEqual({ est: 79.2, w: 62.5, r: 8, d: '2026-09-05' })
  })

  it('appends the session in progress, marked, as soon as a set is checked', () => {
    const entry = { id: LIFT, sets: [set({ w: 70, r: 5 }), set({ w: 70, r: 5 }, false)] }
    const p = exerciseProgress(S, LIFT, { d: '2026-09-08', start: 4, entry })
    expect(p.pts.at(-1)).toMatchObject({ d: '2026-09-08', y: 70, live: true })
    expect(p.pts.slice(0, -1).every(x => !x.live)).toBe(true)
    expect(p.best).toBe(70)
    expect(p.e1.at(-1)).toMatchObject({ y: 81.7, live: true })
  })

  it('leaves the live session off the curve until something is logged', () => {
    const entry = { id: LIFT, sets: [set({ w: 70, r: 5 }, false)] }
    const p = exerciseProgress(S, LIFT, { d: '2026-09-08', start: 4, entry })
    expect(p.pts).toHaveLength(2)
    expect(p.e1).toHaveLength(2)
  })

  it('tracks reps for unloaded bodyweight work instead of drawing nothing', () => {
    const St = { workouts: [
      wo('2026-09-01', 1, { id: BW, sets: [set({ w: 0, r: 10 }), set({ w: 0, r: 12 })] }),
      wo('2026-09-03', 2, { id: BW, sets: [set({ w: 0, r: 14 })] })
    ] }
    const p = exerciseProgress(St, BW)
    expect(p.metric).toBe('reps')
    expect(p.pts.map(x => x.y)).toEqual([12, 14])
    expect(p.e1).toEqual([])
  })

  it('keeps belted sets off a reps curve', () => {
    const St = { workouts: [
      wo('2026-09-01', 1, { id: BW, sets: [set({ w: 20, r: 8 })] }),
      wo('2026-09-03', 2, { id: BW, sets: [set({ w: 0, r: 15 })] })
    ] }
    expect(exerciseProgress(St, BW).pts.map(x => x.y)).toEqual([15])
  })

  it('drops sessions logged in another mode rather than mixing units', () => {
    const St = { workouts: [
      wo('2026-09-01', 1, { id: LIFT, sets: [set({ w: 40, r: 10 })] }),
      wo('2026-09-03', 2, { id: LIFT, target: { mode: 'time' }, sets: [set({ sec: 45, w: 0 })] })
    ] }
    const p = exerciseProgress(St, LIFT)
    expect(p.metric).toBe('sec')
    expect(p.pts.map(x => x.y)).toEqual([45])
  })

  it('is empty, not broken, for an exercise never logged', () => {
    const p = exerciseProgress({ workouts: [] }, LIFT)
    expect(p).toEqual({ metric: 'weight', pts: [], best: 0, e1: [], e1Best: null })
    expect(hasHistory(p)).toBe(false)
  })
})

describe('hasHistory', () => {
  it('does not count the live session as something to compare against', () => {
    const entry = { id: LIFT, sets: [set({ w: 70, r: 5 })] }
    expect(hasHistory(exerciseProgress({ workouts: [] }, LIFT, { d: '2026-09-08', start: 4, entry }))).toBe(false)
  })

  it('counts any past point', () => {
    const S = { workouts: [wo('2026-09-01', 1, { id: LIFT, sets: [set({ w: 60, r: 5 })] })] }
    expect(hasHistory(exerciseProgress(S, LIFT))).toBe(true)
  })
})
