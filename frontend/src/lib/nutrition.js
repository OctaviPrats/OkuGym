// Nutrition: the numbers behind a daily calorie target, and reading a food log back.
//
// Pure helpers over `S.nutrition` (no store, no DOM), because these decide how much someone
// eats and are easy to get subtly wrong — everything here has tests beside it. The shape:
//   profile  { sex, birthYear, heightCm, activity, method }   what the calculator asked
//   goals    [{ from, mode, method, bmr, tdee, pct, kcal, p, f, c, pPerKg, fPerKg }]
//            history, oldest first: a past day is judged by the goal it was logged under
//   foods    [{ id, name, brand, serving, kcal, p, f, c, src, fav, uses, last }]
//            "my foods" — values are for ONE serving
//   log      { 'YYYY-MM-DD': [{ id, t, slot, foodId, name, brand, serving, qty, kcal, p, f, c, src }] }
//            each entry carries its own copy of the values, so editing a food later never
//            rewrites a day that was already eaten (the same rule as logged sets)
//   ai       { on, provider, model, base }   the API key is NOT kept here, see ai.js
import { isoOf, uid } from './format.js'

export const KCAL_PER_KG = 7700          // energy in a kilo of body fat — the usual rule of thumb
export const LB = 0.45359237

// Multipliers on the basal rate. Training is already inside them, which is why workout
// calories are never added on top of the target: that would count them twice.
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }
export const ACTIVITY_LEVELS = Object.keys(ACTIVITY)

export const DEFICITS = [10, 20, 25]      // gentle / moderate / aggressive, as % of maintenance
export const DEFICIT_DEFAULT = 20
export const DEFICIT_RANGE = [5, 30]
export const P_DEFAULT = 2.0              // g of protein per kg
export const F_DEFAULT = 0.8              // g of fat per kg
export const P_RANGE = [1.6, 2.6]
export const F_RANGE = [0.6, 1.2]
const MIN_CARBS = 50
// Above this a body-fat reading inflates "per kg of body weight" protein with fat mass
const HIGH_BF = { male: 25, female: 32 }

export const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner']
export const SLOT_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' }
// The meal a quick "add" from Home most likely means, by the hour.
export const slotAt = hour => (hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 19 ? 'snack' : 'dinner')

export const emptyNutrition = () => ({ profile: {}, goals: [], foods: [], log: {}, ai: null })

export const toKg = (w, unit) => (unit === 'lb' ? w * LB : w)
export const fromKg = (kg, unit) => (unit === 'lb' ? kg / LB : kg)
const r1 = n => Math.round(n * 10) / 10
const r10 = n => Math.round(n / 10) * 10

// Planned training days per week → activity level, as a starting suggestion the user can change.
// Days pointing at a routine that no longer exists don't count.
export function suggestActivity(S) {
  const ids = new Set((S.routines || []).map(r => r.id))
  const n = Object.values(S.week || {}).filter(id => id && ids.has(id)).length
  return n === 0 ? 'sedentary' : n <= 3 ? 'light' : n <= 5 ? 'moderate' : 'high'
}

export const ageOf = (birthYear, today) => (birthYear ? Number(today.slice(0, 4)) - birthYear : null)

// Basal metabolic rate. Katch-McArdle when body fat is known — it needs nothing else and is
// driven by lean mass — Mifflin-St Jeor otherwise. `method: 'mifflin'` forces Mifflin even with
// a body-fat reading, for anyone whose bioimpedance scale is several points off.
// null when neither formula has what it needs.
export function bmrOf({ sex, kg, bf, age, cm, method = 'auto' }) {
  if (!(kg > 0)) return null
  if (method !== 'mifflin' && bf > 0 && bf < 70) {
    const lean = kg * (1 - bf / 100)
    return { kcal: 370 + 21.6 * lean, method: 'katch', lean }
  }
  if (age > 0 && cm > 0) {
    return { kcal: 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5), method: 'mifflin' }
  }
  return null
}

export const tdeeOf = (bmr, activity) => bmr * (ACTIVITY[activity] || ACTIVITY.light)

// Never below the basal rate, nor below the usual minimums for an unsupervised diet.
export const kcalFloor = (bmr, sex) => Math.ceil(Math.max(bmr, sex === 'female' ? 1200 : 1500) / 10) * 10

// The daily target for a deficit of `pct` % of maintenance, and what it means for the scale.
// The target is rounded to 10 kcal; the floor wins over the percentage and says so (`floored`).
// `weeks`/`eta` only exist when there is a goal weight below the current one.
export function planDeficit({ tdee, bmr, sex, pct, kg, targetKg, today }) {
  const floor = kcalFloor(bmr, sex)
  let kcal = r10(tdee * (1 - pct / 100))
  const floored = kcal < floor
  if (floored) kcal = floor
  const deficit = Math.max(0, tdee - kcal)
  const rate = (deficit * 7) / KCAL_PER_KG             // kg per week
  const ratePct = kg > 0 ? (rate / kg) * 100 : 0
  let weeks = null, eta = null
  if (targetKg > 0 && targetKg < kg && rate > 0) {
    const days = Math.round(((kg - targetKg) / rate) * 7)
    weeks = Math.ceil(days / 7)
    const d = new Date(today + 'T12:00:00')
    d.setDate(d.getDate() + days)
    eta = isoOf(d)
  }
  return { kcal, deficit: Math.round(deficit), rate, ratePct, floored, floor, tooFast: ratePct > 1, weeks, eta }
}

// Protein and fat by body weight; carbohydrate takes whatever energy is left.
// With a high body-fat reading and a lower goal weight, protein is based on the goal weight.
// Fat never drops under 0.6 g/kg nor 20 % of the energy; if protein + fat leave less than
// 50 g of carbs, fat comes down towards that floor first (`lowCarb` if even that isn't enough).
export function macrosFor({ kcal, kg, bf, sex, targetKg, pPerKg = P_DEFAULT, fPerKg = F_DEFAULT }) {
  const highBf = bf > (HIGH_BF[sex] || HIGH_BF.male)
  const pBase = highBf && targetKg > 0 && targetKg < kg ? targetKg : kg
  const p = Math.round(pBase * pPerKg)
  const fMin = Math.ceil(Math.max(kg * F_RANGE[0], (kcal * 0.2) / 9))
  let f = Math.max(Math.round(kg * fPerKg), fMin)
  let c = Math.round((kcal - p * 4 - f * 9) / 4)
  let lowCarb = false
  if (c < MIN_CARBS) {
    f = Math.max(fMin, Math.floor((kcal - p * 4 - MIN_CARBS * 4) / 9))
    c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4))
    lowCarb = c < MIN_CARBS
  }
  return { p, f, c, pBase, lowCarb }
}

// Share of the energy each macro brings, in whole percent.
export function macroShares({ p, f, c }) {
  const kp = p * 4, kf = f * 9, kc = c * 4
  const sum = kp + kf + kc || 1
  return { p: Math.round((kp / sum) * 100), f: Math.round((kf / sum) * 100), c: Math.round((kc / sum) * 100) }
}

/* ---------------------------------------------------------------- goals -- */

// The goal a given day is judged by: the latest one that had started by then. Days logged
// before the first goal fall back to it rather than to nothing.
export function goalOn(N, iso) {
  const gs = (N && N.goals) || []
  if (!gs.length) return null
  let g = gs[0]
  for (const x of gs) if (x.from <= iso) g = x
  return g
}

// A new goal starts today and replaces one already set today; older goals keep the days they covered.
export function withGoal(goals, goal, today) {
  return [...(goals || []).filter(g => g.from !== today), { ...goal, from: today }]
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/* ------------------------------------------------------------ the log -- */

export function totals(entries) {
  const s = { kcal: 0, p: 0, f: 0, c: 0 }
  for (const e of entries || []) { s.kcal += e.kcal || 0; s.p += e.p || 0; s.f += e.f || 0; s.c += e.c || 0 }
  return { kcal: Math.round(s.kcal), p: r1(s.p), f: r1(s.f), c: r1(s.c) }
}

export const dayLog = (N, iso) => ((N && N.log && N.log[iso]) || [])
export const slotLog = (N, iso, slot) => dayLog(N, iso).filter(e => e.slot === slot)

// A log entry for `qty` servings of a food — values copied, not referenced.
export function entryOf(food, qty, slot, t = Date.now()) {
  return {
    id: uid(), t, slot, foodId: food.id || null,
    name: food.name, brand: food.brand || null, serving: food.serving || null,
    qty, kcal: Math.round((food.kcal || 0) * qty),
    p: r1((food.p || 0) * qty), f: r1((food.f || 0) * qty), c: r1((food.c || 0) * qty),
    src: food.src || 'user',
  }
}

// Same name, brand and serving → same food (case and spacing ignored).
const foodKey = f => [f.name, f.brand, f.serving].map(x => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|')

// Adds a food to "my foods", or refreshes the one it matches, and counts the use. Mutates N.
// Returns the stored food.
export function saveFood(N, food, today) {
  const k = foodKey(food)
  let f = N.foods.find(x => x.id === food.id) || N.foods.find(x => foodKey(x) === k)
  const vals = {
    name: String(food.name || '').trim(), brand: food.brand || null, serving: food.serving || null,
    kcal: Math.round(food.kcal || 0), p: r1(food.p || 0), f: r1(food.f || 0), c: r1(food.c || 0),
  }
  if (f) Object.assign(f, vals)
  else { f = { id: uid(), ...vals, src: food.src || 'user', fav: false, uses: 0, last: null }; N.foods.push(f) }
  f.uses = (f.uses || 0) + 1
  f.last = today
  return f
}

// Logs foods (each `{ ...food, qty }`) into a slot of a day, saving each to "my foods". Mutates N.
export function logFoods(N, items, slot, iso, now = Date.now()) {
  if (!N.log[iso]) N.log[iso] = []
  for (const it of items) {
    const f = saveFood(N, it, iso)
    N.log[iso].push(entryOf(f, it.qty || 1, slot, now))
  }
}

// One-off numbers ("the label says 250 kcal"): logged, not added to "my foods".
export function quickEntry({ name, kcal, p, f, c }, slot, t = Date.now()) {
  return entryOf({ name, kcal: kcal || 0, p: p || 0, f: f || 0, c: c || 0, src: 'quick' }, 1, slot, t)
}

// The last meal in this slot before `before` (e.g. yesterday's breakfast), for "repeat".
export function lastMeal(N, slot, before) {
  const days = Object.keys((N && N.log) || {}).filter(d => d < before).sort().reverse()
  for (const d of days) {
    const es = N.log[d].filter(e => e.slot === slot)
    if (es.length) return { date: d, entries: es }
  }
  return null
}
// Copies a meal found by lastMeal into a slot of `iso`, as new entries. Mutates N.
export function repeatMeal(N, meal, slot, iso, now = Date.now()) {
  if (!N.log[iso]) N.log[iso] = []
  for (const e of meal.entries) {
    N.log[iso].push({ ...e, id: uid(), t: now, slot })
    const f = N.foods.find(x => x.id === e.foodId)
    if (f) { f.uses = (f.uses || 0) + 1; f.last = iso }
  }
}

// Foods for the add sheet: those eaten most often in this slot over the last 30 days first,
// then the rest by how recently they were used.
export function recentFoods(N, slot, today, limit = 12) {
  const from = new Date(today + 'T12:00:00')
  from.setDate(from.getDate() - 29)
  const lo = isoOf(from)
  const score = new Map()
  for (const [d, es] of Object.entries((N && N.log) || {})) {
    if (d < lo || d > today) continue
    for (const e of es) if (e.foodId && e.slot === slot) score.set(e.foodId, (score.get(e.foodId) || 0) + 1)
  }
  return [...((N && N.foods) || [])]
    .filter(f => f.last)
    .sort((a, b) => (score.get(b.id) || 0) - (score.get(a.id) || 0) || String(b.last).localeCompare(String(a.last)))
    .slice(0, limit)
}
