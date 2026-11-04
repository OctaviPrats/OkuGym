import { describe, it, expect } from 'vitest'
import {
  bmrOf, tdeeOf, kcalFloor, planDeficit, macrosFor, macroShares, suggestActivity, ageOf, toKg,
  goalOn, withGoal, totals, entryOf, saveFood, logFoods, quickEntry, lastMeal, repeatMeal,
  recentFoods, emptyNutrition, slotLog, slotAt, deficitOn, deficitOver, deficitLast, phasesOf, startPhase,
  removePhase, setIncomplete, fatOf, KCAL_PER_KG,
} from './nutrition.js'
import { isoOf } from './format.js'

describe('bmrOf', () => {
  it('uses Katch-McArdle when body fat is known', () => {
    const b = bmrOf({ sex: 'male', kg: 80, bf: 22 })
    expect(b.method).toBe('katch')
    expect(b.lean).toBeCloseTo(62.4, 5)
    expect(b.kcal).toBeCloseTo(370 + 21.6 * 62.4, 5)   // 1717.84
  })

  it('needs neither age nor height with body fat', () => {
    expect(bmrOf({ kg: 71.8, bf: 24.2 }).kcal).toBeCloseTo(1545.57, 2)
  })

  it('falls back to Mifflin-St Jeor without body fat, by sex', () => {
    const m = bmrOf({ sex: 'male', kg: 80, age: 30, cm: 180 })
    expect(m.method).toBe('mifflin')
    expect(m.kcal).toBe(800 + 1125 - 150 + 5)
    expect(bmrOf({ sex: 'female', kg: 60, age: 30, cm: 165 }).kcal).toBe(600 + 1031.25 - 150 - 161)
  })

  it('can be forced to Mifflin even with a body-fat reading', () => {
    expect(bmrOf({ sex: 'male', kg: 80, bf: 22, age: 30, cm: 180, method: 'mifflin' }).method).toBe('mifflin')
  })

  it('returns null when neither formula has what it needs', () => {
    expect(bmrOf({ sex: 'male', kg: 80 })).toBeNull()
    expect(bmrOf({ sex: 'male', kg: 80, bf: 22, method: 'mifflin' })).toBeNull()
    expect(bmrOf({ sex: 'male', kg: 0, bf: 22 })).toBeNull()
    expect(bmrOf({ sex: 'male', kg: 80, bf: 90 })).toBeNull()
  })
})

describe('activity', () => {
  it('multiplies the basal rate by the level', () => {
    expect(tdeeOf(1000, 'sedentary')).toBe(1200)
    expect(tdeeOf(1000, 'light')).toBe(1375)
    expect(tdeeOf(1000, 'high')).toBe(1725)
    expect(tdeeOf(1000, 'nonsense')).toBe(1375)
  })

  it('suggests a level from the planned training days that still have a routine', () => {
    const routines = [{ id: 'a' }, { id: 'b' }]
    expect(suggestActivity({ routines, week: {} })).toBe('sedentary')
    expect(suggestActivity({ routines, week: { 1: 'a', 3: 'b', 5: 'a' } })).toBe('light')
    expect(suggestActivity({ routines, week: { 1: 'a', 2: 'a', 3: 'b', 4: 'a' } })).toBe('moderate')
    expect(suggestActivity({ routines, week: { 0: 'a', 1: 'a', 2: 'a', 3: 'a', 4: 'a', 5: 'a' } })).toBe('high')
    expect(suggestActivity({ routines, week: { 1: 'gone', 3: null } })).toBe('sedentary')
  })
})

describe('planDeficit', () => {
  const base = { bmr: 1717.84, sex: 'male', kg: 80, today: '2026-10-24' }

  it('matches the PRD example: 80 kg, 22 %, light activity, −20 %', () => {
    const tdee = tdeeOf(1717.84, 'light')                // 2362.0
    const p = planDeficit({ ...base, tdee, pct: 20 })
    expect(p.kcal).toBe(1890)
    expect(p.deficit).toBe(472)
    expect(p.rate).toBeCloseTo(0.429, 3)
    expect(p.floored).toBe(false)
    expect(p.tooFast).toBe(false)
  })

  it('estimates weeks and a date to a lower goal weight', () => {
    const p = planDeficit({ tdee: 2125.75, bmr: 1545.5, sex: 'male', pct: 20, kg: 71.8, targetKg: 65, today: '2026-10-24' })
    expect(p.kcal).toBe(1700)
    expect(p.weeks).toBe(18)
    expect(p.eta).toBe('2027-02-24')
  })

  it('has no date without a goal below the current weight', () => {
    expect(planDeficit({ ...base, tdee: 2362, pct: 20 }).eta).toBeNull()
    expect(planDeficit({ ...base, tdee: 2362, pct: 20, targetKg: 85 }).weeks).toBeNull()
  })

  it('never goes under the basal rate or the minimum, and says so', () => {
    const p = planDeficit({ tdee: 1900, bmr: 1550, sex: 'male', pct: 30, kg: 70, today: '2026-10-24' })
    expect(p.kcal).toBe(1550)
    expect(p.floored).toBe(true)
    expect(kcalFloor(1100, 'female')).toBe(1200)
    expect(kcalFloor(1100, 'male')).toBe(1500)
    expect(kcalFloor(1546.2, 'male')).toBe(1550)
  })

  it('flags a pace above 1 % of body weight per week', () => {
    expect(planDeficit({ tdee: 3200, bmr: 1500, sex: 'male', pct: 30, kg: 60, today: '2026-10-24' }).tooFast).toBe(true)
  })
})

describe('macrosFor', () => {
  it('splits the PRD example: P 160 · F 64 · C 169', () => {
    expect(macrosFor({ kcal: 1890, kg: 80, bf: 22, sex: 'male' })).toMatchObject({ p: 160, f: 64, c: 169, lowCarb: false })
  })

  it('uses the goal weight for protein when body fat is high', () => {
    const m = macrosFor({ kcal: 2000, kg: 100, bf: 32, sex: 'male', targetKg: 85 })
    expect(m.pBase).toBe(85)
    expect(m.p).toBe(170)
    // the same reading is not high for a woman
    expect(macrosFor({ kcal: 2000, kg: 100, bf: 30, sex: 'female', targetKg: 85 }).pBase).toBe(100)
  })

  it('keeps fat at 20 % of energy or 0.6 g/kg at least', () => {
    expect(macrosFor({ kcal: 3000, kg: 60, fPerKg: 0.6 }).f).toBe(67)        // 20 % of 3000 kcal
    expect(macrosFor({ kcal: 1500, kg: 100, fPerKg: 0.1 }).f).toBe(60)       // 0.6 g/kg
  })

  it('brings fat down before carbs drop under 50 g', () => {
    // 234 g protein + 108 g fat would leave no carbs at all at 1800 kcal
    const m = macrosFor({ kcal: 1800, kg: 90, pPerKg: 2.6, fPerKg: 1.2 })
    expect(m).toMatchObject({ p: 234, f: 73, c: 52, lowCarb: false })
  })

  it('reports when even that is not enough', () => {
    expect(macrosFor({ kcal: 1200, kg: 110, pPerKg: 2.6 }).lowCarb).toBe(true)
  })

  it('shares add up to about 100 %', () => {
    const s = macroShares({ p: 144, f: 57, c: 153 })
    expect(s).toEqual({ p: 34, f: 30, c: 36 })
  })
})

describe('helpers', () => {
  it('guesses the meal from the hour', () => {
    expect([7, 10, 11, 15, 16, 18, 19, 23].map(slotAt))
      .toEqual(['breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'snack', 'dinner', 'dinner'])
  })

  it('converts pounds and computes age', () => {
    expect(toKg(100, 'kg')).toBe(100)
    expect(toKg(100, 'lb')).toBeCloseTo(45.36, 2)
    expect(ageOf(1990, '2026-10-24')).toBe(36)
    expect(ageOf(null, '2026-10-24')).toBeNull()
  })
})

describe('goals', () => {
  it('judges each day by the goal that had started by then', () => {
    const N = { goals: [{ from: '2026-10-01', kcal: 2000 }, { from: '2026-10-20', kcal: 1800 }] }
    expect(goalOn(N, '2026-10-24').kcal).toBe(1800)
    expect(goalOn(N, '2026-10-20').kcal).toBe(1800)
    expect(goalOn(N, '2026-10-19').kcal).toBe(2000)
    expect(goalOn(N, '2026-09-01').kcal).toBe(2000)
    expect(goalOn({ goals: [] }, '2026-10-24')).toBeNull()
    expect(goalOn(null, '2026-10-24')).toBeNull()
  })

  it('starts a new goal today and replaces one already set today', () => {
    let gs = withGoal([], { kcal: 2000 }, '2026-10-01')
    gs = withGoal(gs, { kcal: 1800 }, '2026-10-24')
    gs = withGoal(gs, { kcal: 1700 }, '2026-10-24')
    expect(gs.map(g => [g.from, g.kcal])).toEqual([['2026-10-01', 2000], ['2026-10-24', 1700]])
  })
})

describe('the log', () => {
  const latte = { name: 'Caffè Latte', brand: 'Starbucks', serving: '1 Grande', kcal: 150, p: 11, f: 5, c: 15, src: 'ai' }

  it('totals a day', () => {
    expect(totals([{ kcal: 150, p: 11, f: 5, c: 15 }, { kcal: 380.4, p: 19.04, f: 18, c: 34 }]))
      .toEqual({ kcal: 530, p: 30, f: 23, c: 49 })
    expect(totals([])).toEqual({ kcal: 0, p: 0, f: 0, c: 0 })
  })

  it('copies values into an entry, scaled by quantity', () => {
    const e = entryOf(latte, 2, 'breakfast', 1)
    expect(e).toMatchObject({ name: 'Caffè Latte', qty: 2, kcal: 300, p: 22, f: 10, c: 30, slot: 'breakfast', t: 1 })
    expect(entryOf(latte, 0.5, 'snack').kcal).toBe(75)
  })

  it('saves a food once and refreshes it when it comes back', () => {
    const N = emptyNutrition()
    const a = saveFood(N, latte, '2026-10-23')
    const b = saveFood(N, { ...latte, name: ' caffè  latte ', kcal: 160 }, '2026-10-24')
    expect(N.foods).toHaveLength(1)
    expect(b.id).toBe(a.id)
    expect(b).toMatchObject({ kcal: 160, uses: 2, last: '2026-10-24' })
    saveFood(N, { ...latte, serving: '1 Venti' }, '2026-10-24')
    expect(N.foods).toHaveLength(2)
  })

  it('logs foods into a slot and keeps past entries when a food changes later', () => {
    const N = emptyNutrition()
    logFoods(N, [{ ...latte, qty: 1 }, { name: 'Egg sandwich', kcal: 380, p: 19, f: 18, c: 34, qty: 1 }], 'breakfast', '2026-10-24')
    expect(slotLog(N, '2026-10-24', 'breakfast')).toHaveLength(2)
    expect(totals(N.log['2026-10-24']).kcal).toBe(530)
    N.foods[0].kcal = 999
    expect(N.log['2026-10-24'][0].kcal).toBe(150)
  })

  it('logs quick numbers without adding a food', () => {
    const e = quickEntry({ name: 'Bar', kcal: 250, p: 20 }, 'snack')
    expect(e).toMatchObject({ kcal: 250, p: 20, f: 0, c: 0, foodId: null, src: 'quick' })
  })

  it('finds and repeats the last earlier meal in a slot', () => {
    const N = emptyNutrition()
    logFoods(N, [{ ...latte, qty: 1 }], 'breakfast', '2026-10-21')
    logFoods(N, [{ name: 'Yogurt', kcal: 150, p: 8, f: 10, c: 6, qty: 1 }], 'breakfast', '2026-10-23')
    logFoods(N, [{ name: 'Rice', kcal: 400, p: 8, f: 2, c: 88, qty: 1 }], 'lunch', '2026-10-23')
    const m = lastMeal(N, 'breakfast', '2026-10-24')
    expect(m.date).toBe('2026-10-23')
    expect(m.entries.map(e => e.name)).toEqual(['Yogurt'])
    expect(lastMeal(N, 'dinner', '2026-10-24')).toBeNull()
    expect(lastMeal(N, 'breakfast', '2026-10-21')).toBeNull()

    repeatMeal(N, m, 'breakfast', '2026-10-24')
    const today = slotLog(N, '2026-10-24', 'breakfast')
    expect(today).toHaveLength(1)
    expect(today[0].id).not.toBe(m.entries[0].id)
    expect(N.foods.find(f => f.name === 'Yogurt').uses).toBe(2)
  })

  it('lists recent foods, the ones eaten in this slot first', () => {
    const N = emptyNutrition()
    logFoods(N, [{ name: 'Rice', kcal: 400, p: 8, f: 2, c: 88, qty: 1 }], 'lunch', '2026-10-24')
    logFoods(N, [{ name: 'Yogurt', kcal: 150, p: 8, f: 10, c: 6, qty: 1 }], 'breakfast', '2026-10-20')
    logFoods(N, [{ name: 'Yogurt', kcal: 150, p: 8, f: 10, c: 6, qty: 1 }], 'breakfast', '2026-10-21')
    expect(recentFoods(N, 'breakfast', '2026-10-24').map(f => f.name)).toEqual(['Yogurt', 'Rice'])
    expect(recentFoods(N, 'lunch', '2026-10-24').map(f => f.name)).toEqual(['Rice', 'Yogurt'])
    expect(recentFoods(N, 'lunch', '2026-10-24', 1)).toHaveLength(1)
  })
})

describe('the running deficit', () => {
  // The design canvas's month: maintenance 2130, target 1700, holidays from 23 to 29 Nov with
  // little logged, a new phase on 30 Nov and only breakfast logged on 6 Dec. Today is 10 Dec.
  const today = '2026-12-10'
  const eaten = [
    1720, 1650, 1590, null, 1780, 1690, 1640, 1810, 1700, 1580, null, 1730, 1660, 1900, 1620, 1690, 1750, // 24 Oct – 9 Nov
    1680, 1610, 1740, 1690, 2050, 1660,              // 10 – 15 Nov
    1690, 1820, 1650, 1740, 1980, 1710, null,        // 16 – 22 Nov
    2450, null, null, 2600, null, null, null,        // 23 – 29 Nov
    1690, 1640, 1710, 1720, 1980, 2290, 640, 1660, 1690, 1610, // 30 Nov – 9 Dec
  ]
  const make = () => {
    const N = emptyNutrition()
    N.goals = [{ from: '2026-10-24', mode: 'cut', method: 'katch', tdee: 2130, kcal: 1700, p: 144, f: 57, c: 153 }]
    eaten.forEach((kcal, i) => {
      const d = new Date('2026-10-24T12:00:00'); d.setDate(d.getDate() + i)
      const iso = isoOf(d)
      if (kcal != null) N.log[iso] = [{ id: 'e' + i, slot: 'lunch', kcal, p: 0, f: 0, c: 0 }]
    })
    // today, half eaten: never counts
    N.log[today] = [{ id: 'now', slot: 'breakfast', kcal: 530, p: 0, f: 0, c: 0 }]
    N.phases = [{ from: '2026-11-30' }]
    return N
  }

  it('adds up the last 7 days, leaving out the half-logged day', () => {
    const w = deficitLast(make(), 7, today)
    expect([w.from, w.to, w.n]).toEqual(['2026-12-03', '2026-12-09', 7])
    expect(w.counted).toBe(6)
    expect(w.deficit).toBe(1830)
    expect(w.planned).toBe(2580)
    expect(w.balance).toBe(-750)      // 750 over the target, and still 1830 under maintenance
  })

  it('adds up the last 30 days, leaving out days with nothing logged', () => {
    const w = deficitLast(make(), 30, today)
    expect([w.from, w.n, w.counted]).toEqual(['2026-11-10', 30, 23])
    expect(w.deficit).toBe(6930)
    expect(w.planned).toBe(9890)
  })

  it('counts a day over maintenance against the total', () => {
    const d = deficitOn(make(), '2026-11-26', today)
    expect(d.counts).toBe(true)
    expect(d.deficit).toBe(-470)
  })

  it('never counts today, nor reaches before the first goal', () => {
    const N = make()
    expect(deficitOn(N, today, today).counts).toBe(false)
    const w = deficitOver(N, '2026-10-01', '2026-12-31', today)
    expect([w.from, w.to]).toEqual(['2026-10-24', '2026-12-09'])
    expect(deficitLast(emptyNutrition(), 7, today)).toBeNull()
  })

  it('leaves out a day marked incomplete, and brings it back', () => {
    const N = make()
    setIncomplete(N, '2026-12-08', true)
    const w = deficitLast(N, 7, today)
    expect(w.counted).toBe(5)
    expect(w.deficit).toBe(1830 - 440)
    setIncomplete(N, '2026-12-08', false)
    expect(deficitLast(N, 7, today).deficit).toBe(1830)
    expect(N.incomplete).toBeUndefined()
  })

  it('judges each day by its own goal, and recalculating does not start a phase', () => {
    const N = make()
    N.goals.push({ from: '2026-12-07', mode: 'cut', method: 'katch', tdee: 2100, kcal: 1650, p: 140, f: 55, c: 150 })
    const w = deficitLast(N, 7, today)
    expect(w.deficit).toBe(1830 - 3 * 30)          // 7–9 Dec measured against 2100
    expect(w.planned).toBe(3 * 430 + 3 * 450)
    expect(phasesOf(N, today).length).toBe(2)
  })

  it('leaves out days whose manual goal has no maintenance, and says how many', () => {
    const N = make()
    N.goals = [{ from: '2026-10-24', mode: 'cut', method: 'manual', kcal: 1700, p: 144, f: 57, c: 153 }]
    const w = deficitLast(N, 7, today)
    expect([w.counted, w.deficit, w.noTdee, w.complete]).toEqual([0, 0, 6, 6])
    expect(w.balance).toBe(-750)
  })

  it('splits the diet into phases, the current one ending yesterday', () => {
    const N = make()
    expect(phasesOf(N, today)).toEqual([
      { from: '2026-10-24', to: '2026-11-29' },
      { from: '2026-11-30', to: '2026-12-09' },
    ])
    const [past, cur] = phasesOf(N, today).map(p => deficitOver(N, p.from, p.to, today))
    expect([past.deficit, past.counted, past.n]).toEqual([10190, 29, 37])
    expect([cur.deficit, cur.counted, cur.n]).toEqual([3180, 9, 10])
    expect(phasesOf(emptyNutrition(), today)).toEqual([])
  })

  it('has one phase from the first goal when none was started', () => {
    const N = make()
    delete N.phases
    expect(phasesOf(N, today)).toEqual([{ from: '2026-10-24', to: '2026-12-09' }])
  })

  it('starts a phase only after the current one began, and no later than today', () => {
    const N = make()
    expect(startPhase(N, '2026-11-30', today)).toBe(false)
    expect(startPhase(N, '2026-11-20', today)).toBe(false)
    expect(startPhase(N, '2026-12-11', today)).toBe(false)
    expect(startPhase(N, today, today)).toBe(true)
    const ps = phasesOf(N, today)
    expect(ps[2]).toEqual({ from: today, to: '2026-12-09' })   // nothing counted yet
    expect(deficitOver(N, ps[2].from, ps[2].to, today).n).toBe(0)
    expect(ps[1].to).toBe('2026-12-09')
  })

  it('merges a phase back into the one before, without touching the log', () => {
    const N = make()
    const logBefore = JSON.stringify(N.log)
    removePhase(N, '2026-11-30')
    expect(phasesOf(N, today)).toEqual([{ from: '2026-10-24', to: '2026-12-09' }])
    expect(N.phases).toBeUndefined()
    expect(JSON.stringify(N.log)).toBe(logBefore)
  })

  it('turns a deficit into fat, in kg or lb', () => {
    expect(fatOf(KCAL_PER_KG, 'kg')).toBe(1)
    expect(fatOf(1830, 'kg')).toBeCloseTo(0.238, 3)
    expect(fatOf(KCAL_PER_KG, 'lb')).toBeCloseTo(2.2046, 3)
  })
})
