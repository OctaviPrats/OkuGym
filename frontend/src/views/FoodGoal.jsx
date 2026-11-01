import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { lastBW, lastBF } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import {
  bmrOf, tdeeOf, planDeficit, macrosFor, macroShares, suggestActivity, ageOf, toKg, fromKg, goalOn, withGoal,
  emptyNutrition, ACTIVITY, ACTIVITY_LEVELS, DEFICITS, DEFICIT_DEFAULT, DEFICIT_RANGE, P_DEFAULT, F_DEFAULT, P_RANGE, F_RANGE,
} from '../lib/nutrition.js'
import { bwSheet, bfSheet } from '../sheets.jsx'
import { manualGoalSheet } from '../foodSheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Row, Section, Segmented, Stepper, Switch } from '../components/ui.jsx'

const ACTIVITY_TEXT = {
  sedentary: ['Sedentary', 'Desk job, no training'],
  light: ['Lightly active', 'Desk job + 1–3 workouts a week'],
  moderate: ['Moderately active', '3–5 workouts a week, or on your feet all day'],
  high: ['Very active', '6–7 workouts a week, or physical work'],
}
const DEFICIT_TEXT = { 10: 'Gentle', 20: 'Moderate', 25: 'Aggressive' }
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const r10 = n => Math.round(n / 10) * 10
const monthOf = iso => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })

// The calorie-target calculator: your details → a deficit → macros. Everything it shows is
// worked out by lib/nutrition.js; this only asks and explains.
export default function FoodGoal() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = todayISO()
  const N = S.nutrition || emptyNutrition()
  const prof = N.profile || {}
  const last = goalOn(N, today)
  const unit = S.unit
  const bw = lastBW(S)
  const bfE = lastBF(S)
  const kg = bw ? toKg(bw.w, unit) : null
  const bf = bfE ? bfE.bf : null
  const targetKg = S.targetW ? toKg(S.targetW, unit) : null
  const suggested = suggestActivity(S)

  const [step, setStep] = useState(1)
  const [sex, setSex] = useState(prof.sex || (S.body === 'female' ? 'female' : 'male'))
  const [age, setAge] = useState(ageOf(prof.birthYear, today))
  const [cm, setCm] = useState(prof.heightCm || null)
  const [activity, setActivity] = useState(prof.activity || suggested)
  const [mifflin, setMifflin] = useState(prof.method === 'mifflin')
  const [pct, setPct] = useState((last && last.pct) || DEFICIT_DEFAULT)
  const [pPerKg, setP] = useState((last && last.pPerKg) || P_DEFAULT)
  const [fPerKg, setF] = useState((last && last.fPerKg) || F_DEFAULT)

  const bmr = bmrOf({ sex, kg, bf, age, cm, method: mifflin ? 'mifflin' : 'auto' })
  const tdee = bmr ? tdeeOf(bmr.kcal, activity) : null
  const plan = bmr ? planDeficit({ tdee, bmr: bmr.kcal, sex, pct, kg, targetKg, today }) : null
  const mac = plan ? macrosFor({ kcal: plan.kcal, kg, bf, sex, targetKg, pPerKg, fPerKg }) : null
  const cur = plan ? step : 1

  const leave = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/food'))
  const back = () => (cur > 1 ? setStep(cur - 1) : leave())
  const save = () => {
    update(s => {
      if (!s.nutrition) s.nutrition = emptyNutrition()
      const n = s.nutrition
      n.profile = { sex, birthYear: age ? Number(today.slice(0, 4)) - age : null, heightCm: cm || null, activity, method: mifflin ? 'mifflin' : 'auto' }
      n.goals = withGoal(n.goals, {
        mode: 'cut', method: bmr.method, bmr: Math.round(bmr.kcal), tdee: Math.round(tdee), pct,
        kcal: plan.kcal, p: mac.p, f: mac.f, c: mac.c, pPerKg, fPerKg,
      }, today)
    })
    useUI.getState().toast(t('Target saved'))
    nav('/food', { replace: true })
  }

  const head = (title, sub) => <>
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{title}</h1><div className="sub">{sub}</div></div>
    </div>
    <div className="steps3" aria-hidden="true">{[1, 2, 3].map(i => <span key={i} className={i <= cur ? 'on' : ''} />)}</div>
  </>

  /* ---------- 1 · your details ---------- */
  if (cur === 1) return <div className="narrow">
    {head(t('Your details'), t('Step {0} of {1}', 1, 3))}
    <Section footer={bmr && bmr.method === 'katch'
      ? t('With your body fat we use the Katch-McArdle formula, so age and height are optional.')
      : t('Without a body-fat reading we use the Mifflin-St Jeor formula, which needs your age and height.')}>
      <Row title={t('Sex')}>
        <Segmented className="seg-inline" value={sex} onChange={setSex}
          options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
      </Row>
      <Row title={t('Age')}>
        <NumberField className="lrow-in" decimal={false} nullable value={age} placeholder={t('Add')} onChange={setAge} aria-label={t('Age')} />
        <span className="muted unit">{t('years')}</span>
      </Row>
      <Row title={t('Height')}>
        <NumberField className="lrow-in" decimal={false} nullable value={cm} placeholder={t('Add')} onChange={setCm} aria-label={t('Height')} />
        <span className="muted unit">cm</span>
      </Row>
      <Row title={t('Body weight')} subtitle={bw ? t('Last logged · {0}', fmtDate(bw.d)) : null}
        value={bw ? fmtNum(bw.w) + ' ' + unit : t('Log')} accessory="chevron" onClick={() => bwSheet()} />
      <Row title={t('Body fat')} subtitle={bfE ? t('Last logged · {0}', fmtDate(bfE.d)) : t('Optional')}
        value={bfE ? fmtNum(bf) + '%' : t('Log')} accessory="chevron" onClick={bfSheet} />
      {bf != null && <Row title={t('Ignore my body fat')} subtitle={t('If your scale’s reading is unreliable. Needs age and height.')}>
        <Switch checked={mifflin} onChange={setMifflin} />
      </Row>}
    </Section>

    <Section title={t('Daily activity')} footer={t('Don’t add workout calories on top — they’re already counted here.')}>
      {ACTIVITY_LEVELS.map(a => <button key={a} className="lrow tap" onClick={() => setActivity(a)} aria-pressed={a === activity}>
        <span className="lrow-m">
          <span className="lrow-t row" style={{ gap: 8 }}>{t(ACTIVITY_TEXT[a][0])}
            {a === suggested && <span className="tag acc nocap">{t('Suggested by your plan')}</span>}</span>
          <span className="lrow-s">{t(ACTIVITY_TEXT[a][1])}</span>
        </span>
        {a === activity && <Icon name="check" className="lrow-k" />}
      </button>)}
    </Section>

    {!bmr && <div className="note" style={{ marginTop: -10, marginBottom: 14 }}><Icon name="info" />
      <span>{!kg ? t('Log your body weight to continue.') : t('Add your age and height, or log your body fat, to continue.')}</span></div>}
    <Button variant="primary" disabled={!bmr} onClick={() => setStep(2)}>{t('Continue')}</Button>
  </div>

  /* ---------- 2 · your deficit ---------- */
  if (cur === 2) return <div className="narrow">
    {head(t('Your deficit'), t('Step {0} of {1}', 2, 3))}
    <div className="card">
      <h2>{t('Estimated maintenance')}</h2>
      <div className="stat-v">≈ {fmtNum(r10(tdee))} <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>{t('kcal/day')}</span></div>
      <div className="muted small" style={{ marginTop: 4, lineHeight: 1.4 }}>
        {t('Basal {0} kcal × {1} ({2}). Your workouts are already in there.', fmtNum(Math.round(bmr.kcal)),
          ACTIVITY[activity].toLocaleString(dateLocale()), t(ACTIVITY_TEXT[activity][0]))}
      </div>
    </div>

    <div className="list" role="radiogroup" aria-label={t('Deficit')} style={{ marginBottom: 12 }}>
      {DEFICITS.map(p => {
        const o = planDeficit({ tdee, bmr: bmr.kcal, sex, pct: p, kg, targetKg, today })
        return <button key={p} role="radio" aria-checked={pct === p} className={'opt' + (pct === p ? ' on' : '')} onClick={() => setPct(p)}>
          <span className={'radio' + (pct === p ? ' on' : '')} />
          <span className="grow">
            <span className="row" style={{ gap: 8 }}>{t(DEFICIT_TEXT[p])}
              {p === DEFICIT_DEFAULT && <span className="tag acc nocap">{t('Recommended')}</span>}</span>
            <span className="lrow-s">−{p}&nbsp;% · {t('≈ {0} {1} a week', fmtNum(fromKg(o.rate, unit)), unit)}</span>
          </span>
          <span className="t-head">{fmtNum(o.kcal)}</span>
        </button>
      })}
    </div>
    <Section>
      <Row title={t('Fine-tune')}>
        <Stepper value={pct} step={1} decimal={false} unit="%" onChange={v => setPct(clamp(Math.round(v || 0), DEFICIT_RANGE))} />
      </Row>
    </Section>

    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="t-large accent">{fmtNum(plan.kcal)}</span><span className="muted">{t('kcal/day · your target')}</span>
      </div>
      <hr className="divider" />
      <div className="kv">
        <span>{t('Deficit')}</span><span>{t('−{0} kcal/day', fmtNum(plan.deficit))}</span>
        <span>{t('Pace')}</span><span>{t('≈ {0} {1} a week ({2} % of your weight)', fmtNum(fromKg(plan.rate, unit)), unit, fmtNum(plan.ratePct))}</span>
        {plan.eta && <><span style={{ color: 'var(--yellow)' }}>{t('Goal {0}', fmtNum(S.targetW) + ' ' + unit)}</span>
          <span>{t('≈ {0} · {1} weeks', monthOf(plan.eta), plan.weeks)}</span></>}
      </div>
    </div>
    {plan.tooFast && <div className="note warn"><Icon name="info" /><span>{t('That’s more than 1 % of your weight a week — hard to keep up, and it costs muscle.')}</span></div>}
    <div className="note" style={{ marginBottom: 16 }}><Icon name="shield" />
      <span>{plan.floored
        ? t('{0} kcal is as low as it goes: your basal rate or the safe minimum, whichever is higher.', fmtNum(plan.floor))
        : t('Never below your basal rate ({0} kcal).', fmtNum(Math.round(bmr.kcal)))}</span></div>
    <Button variant="primary" onClick={() => setStep(3)}>{t('Continue')}</Button>
  </div>

  /* ---------- 3 · your macros ---------- */
  const share = macroShares(mac)
  return <div className="narrow">
    {head(t('Your macros'), t('Step {0} of {1}', 3, 3) + ' · ' + t('{0} kcal a day', fmtNum(plan.kcal)))}
    <div className="kstack lg" aria-hidden="true" style={{ marginBottom: 14 }}>
      <span style={{ width: share.p + '%', background: 'var(--mac-p)' }} />
      <span style={{ width: share.f + '%', background: 'var(--mac-f)' }} />
      <span style={{ width: share.c + '%', background: 'var(--mac-c)' }} />
    </div>
    <Section>
      <MacroEdit label="Protein" k="p" g={mac.p} kcal={mac.p * 4} share={share.p} perKg={pPerKg} onChange={v => setP(clamp(v, P_RANGE))} />
      <MacroEdit label="Fat" k="f" g={mac.f} kcal={mac.f * 9} share={share.f} perKg={fPerKg} onChange={v => setF(clamp(v, F_RANGE))} />
      <MacroEdit label="Carbs" k="c" g={mac.c} kcal={mac.c * 4} share={share.c} />
    </Section>
    {mac.pBase !== kg && <div className="note"><Icon name="info" /><span>{t('Protein is based on your goal weight, since body fat is high.')}</span></div>}
    {mac.lowCarb && <div className="note warn"><Icon name="info" /><span>{t('Protein and fat leave very few carbs at this target — consider lowering protein a little.')}</span></div>}
    <div className="note" style={{ marginBottom: 16 }}><Icon name="lightbulb" />
      <span>{t('High protein helps keep muscle while you lose fat. Carbs get whatever is left.')}</span></div>
    <div className="muted" style={{ textAlign: 'center', marginBottom: 12 }}>
      {fmtNum(plan.kcal)} kcal · {t('P {0} g · F {1} g · C {2} g', fmtNum(mac.p), fmtNum(mac.f), fmtNum(mac.c))}
    </div>
    <Button variant="primary" onClick={save}>{t('Save target')}</Button>
    <div style={{ height: 4 }} />
    <Button variant="plain" onClick={() => manualGoalSheet(() => nav('/food', { replace: true }))}>{t('Enter my own numbers')}</Button>
  </div>
}

function MacroEdit({ label, k, g, kcal, share, perKg, onChange }) {
  return <div className="maced">
    <div className="h">
      <span className="mdot" style={{ background: `var(--mac-${k})` }} />
      <span className="grow">{t(label)}</span>
      <b>{fmtNum(g)}</b><span className="muted">g</span>
    </div>
    <div className="s">
      <span className="grow">{fmtNum(Math.round(kcal))} kcal · {share} %{perKg == null ? ' · ' + t('the rest') : ''}</span>
      {perKg != null
        ? <Stepper value={perKg} step={0.1} unit="g/kg" onChange={v => onChange(Math.round((v || 0) * 10) / 10)} />
        : <span>{t('Automatic')}</span>}
    </div>
  </div>
}
