import { describe, it, expect } from 'vitest'
import {
  bmrOf, tdeeOf, kcalFloor, planDeficit, macrosFor, macroShares, suggestActivity, ageOf, toKg,
  goalOn, withGoal, totals, entryOf, saveFood, logFoods, quickEntry, lastMeal, repeatMeal,
  recentFoods, emptyNutrition, slotLog, slotAt,
} from './nutrition.js'

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
