// Food logging sheets: adding to a meal (describe it for an AI estimate, quick add, repeat the
// last one, my foods), reviewing an estimate, editing a serving, and connecting a free AI provider.
import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { fmtNum, fmtDate, todayISO } from './lib/format.js'
import { t, getLang } from './lib/i18n.js'
import {
  emptyNutrition, goalOn, withGoal, totals, dayLog, logFoods, quickEntry, lastMeal, repeatMeal,
  recentFoods, macroShares, SLOTS, SLOT_NAMES,
} from './lib/nutrition.js'
import { PROVIDERS, aiReady, getKey, setKey, connect, availableModels, estimateMeal } from './lib/ai.js'
import Icon from './components/Icon.jsx'
import { Button, Check, NumberField, Row, Section, Segmented, SearchField, SelectRow, Stepper, TextField } from './components/ui.jsx'

const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const update = (...a) => useStore.getState().update(...a)
// Every write goes through here, so the first one creates the nutrition block.
const mutate = fn => update(s => { if (!s.nutrition) s.nutrition = emptyNutrition(); fn(s.nutrition) })
const useN = () => useStore(s => s.S.nutrition) || emptyNutrition()
const r1 = n => Math.round(n * 10) / 10

export const slotName = slot => t(SLOT_NAMES[slot])

// "1 Grande (473 ml)", "2 × 1 slice (30 g)" — the amount, as the food describes its serving.
export function servingText(qty, serving) {
  if (!serving) return qty === 1 ? '' : '× ' + fmtNum(qty)
  return qty === 1 ? serving : fmtNum(qty) + ' × ' + serving
}
export const entrySub = e => [e.brand, servingText(e.qty, e.serving) || (e.src === 'quick' ? t('Quick add') : '')].filter(Boolean).join(' · ')

export function aiErrorText(e) {
  switch (e && e.kind) {
    case 'key': return t('The provider rejected the key. Check it and try again.')
    case 'limit': return t('Free quota used up for now — try again later, or use quick add.')
    case 'network': return t('Couldn’t reach the AI provider. Check your connection.')
    case 'model': return t('No usable model found on this account.')
    case 'format': return t('Couldn’t read the AI’s answer — try again, or describe it differently.')
    case 'busy': return e.status
      ? t('{0} is overloaded right now (error {1}). Try again in a few minutes, or use quick add.', providerName(e.provider), e.status)
      : t('{0} isn’t answering right now. Try again in a few minutes, or use quick add.', providerName(e.provider))
    case 'timeout': return e.stage === 'asking' || e.stage === 'retry' || e.stage === 'switch'
      ? t('No answer from {0} after {1} s. Check your connection and try again.', providerName(e.provider), e.secs)
      : t('{0} was still working after {1} s. Try again, or pick a faster model in Settings → Food.', providerName(e.provider), e.secs)
    default: return t('The AI provider returned an error ({0}).', (e && e.status) || '?')
  }
}

const providerName = p => (PROVIDERS[p] && p !== 'custom' ? PROVIDERS[p].name : t('Custom'))

// Runs an estimate with its progress: `prog` is null when idle, else the stage estimateMeal
// last reported ({ stage, items, model }). Leaving the sheet cancels a request still on its way.
// A cancel is not an error; errors carry the provider (and a timeout its seconds) for their
// message. When the saved model was overloaded and another one answered, that one is kept, so
// the next estimate doesn't wait on the busy one again.
function useEstimate(cfg) {
  const [prog, setProg] = useState(null)
  const ctl = useRef(null)
  useEffect(() => () => { if (ctl.current) ctl.current.abort() }, [])
  const run = async text => {
    ctl.current = new AbortController()
    setProg({ stage: 'asking', items: 0 })
    const t0 = Date.now()
    try {
      const res = await estimateMeal({ text, lang: getLang(), cfg, key: getKey(), signal: ctl.current.signal,
        onStage: (stage, info) => setProg({ stage, items: info.items || 0, model: info.model }) })
      if (res.model && res.model !== cfg.model) {
        mutate(n => { if (n.ai) n.ai.model = res.model })
        toast(t('Now using {0} — {1} was overloaded.', res.model, cfg.model))
      }
      return res
    } catch (e) {
      e.provider = cfg.provider
      if (e.kind === 'timeout') e.secs = Math.round((Date.now() - t0) / 1000)
      throw e
    } finally { ctl.current = null; setProg(null) }
  }
  return { prog, busy: prog != null, run, cancel: () => { if (ctl.current) ctl.current.abort() } }
}

// How far along each stage is, for the bar. Thinking is where a slow free model spends its time.
const STAGE_AT = { asking: 0.12, retry: 0.12, switch: 0.12, thinking: 0.35, writing: 0.6, reading: 1 }

function stageText({ stage, items, model }, provider) {
  const name = providerName(provider)
  switch (stage) {
    case 'retry': return t('Asking {0} again…', name)
    case 'switch': return t('{0} is busy · trying {1}…', name, model)
    case 'thinking': return t('{0} is thinking…', name)
    case 'writing': return items === 1 ? t('Writing the estimate · 1 food…') : items > 1 ? t('Writing the estimate · {0} foods…', items) : t('Writing the estimate…')
    case 'reading': return t('Reading the answer…')
    default: return t('Asking {0}…', name)
  }
}

// While an estimate is on its way: what's happening, for how long, and a way out. The answer
// streams in, so the stage is real: sent, the model thinking, the foods being written. (The
// ticking clock also keeps the screen repainting while nothing else moves.)
function AiProgress({ prog, provider, onCancel }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => { const id = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(id) }, [])
  const at = Math.min(0.92, (STAGE_AT[prog.stage] || 0.12) + (prog.stage === 'writing' ? prog.items * 0.08 : 0))
  return <div className="aiwait">
    <div className="row between">
      <span role="status">{stageText(prog, provider)}</span>
      <span className="muted" aria-hidden="true">{secs} s</span>
    </div>
    <div className="kbar live" aria-hidden="true"><span style={{ width: at * 100 + '%' }} /></div>
    {secs >= 20 && prog.stage !== 'writing' && <div className="muted small">{t('Free models can be slow at busy times — still working on it.')}</div>}
    <div className="act"><Button size="sm" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button></div>
  </div>
}

const MACRO_LABEL = { kcal: 'Calories', p: 'Protein', f: 'Fat', c: 'Carbs' }
const CONF = {
  high: { label: 'High confidence', cls: 'ok' },
  medium: { label: 'Medium confidence', cls: 'warn' },
  low: { label: 'Low confidence', cls: 'warn' },
}

// The three macros of an amount, as a split bar with the grams under it.
function MacroSplit({ p, f, c }) {
  const s = macroShares({ p, f, c })
  return <>
    <div className="kstack" aria-hidden="true">
      <span style={{ width: s.p + '%', background: 'var(--mac-p)' }} />
      <span style={{ width: s.f + '%', background: 'var(--mac-f)' }} />
      <span style={{ width: s.c + '%', background: 'var(--mac-c)' }} />
    </div>
    <div className="mgrid" style={{ marginTop: 10 }}>
      {[['p', p], ['f', f], ['c', c]].map(([k, v]) => <div key={k}>
        <div className="l">{t(MACRO_LABEL[k])}</div><div className="v">{fmtNum(Math.round(v))} g</div>
      </div>)}
    </div>
  </>
}

/* ============================ add to a meal ============================ */

function AddFood({ slot, iso, close }) {
  const N = useN()
  const [text, setText] = useState('')
  const [tab, setTab] = useState('recent')
  const [q, setQ] = useState('')
  const ready = aiReady(N)
  const meal = lastMeal(N, slot, iso)
  const est = useEstimate(N.ai)

  const estimate = async () => {
    const txt = text.trim()
    if (!txt || est.busy) return
    try {
      const res = await est.run(txt)
      if (!res.items.length) toast(t('That doesn’t read as food — try describing it differently.'))
      else estimateSheet({ res, text: txt, slot, iso, done: close })
    } catch (e) { if (e.kind !== 'cancelled') toast(aiErrorText(e)) }
  }
  const ql = q.trim().toLowerCase()
  const list = tab === 'recent' ? recentFoods(N, slot, iso)
    : tab === 'fav' ? N.foods.filter(f => f.fav)
    : [...N.foods].sort((a, b) => a.name.localeCompare(b.name))
  const shown = ql ? list.filter(f => (f.name + ' ' + (f.brand || '')).toLowerCase().includes(ql)) : list
  const addOne = f => { mutate(n => logFoods(n, [{ ...f, qty: 1 }], slot, iso)); toast(t('Added to {0}', slotName(slot))) }
  const repeat = () => { mutate(n => repeatMeal(n, meal, slot, iso)); close(); toast(t('Added to {0}', slotName(slot))) }

  return <>
    <h3>{t('Add to {0}', slotName(slot))}</h3>
    {ready ? <>
      <div className="describe">
        <label htmlFor="describe">{t('Describe what you ate')}</label>
        <textarea id="describe" rows={2} value={text} maxLength={400} readOnly={est.busy} onChange={e => setText(e.target.value)}
          placeholder={t('e.g. a large latte and an egg sandwich from Starbucks')} />
        {est.busy ? <AiProgress prog={est.prog} provider={N.ai.provider} onCancel={est.cancel} /> : (
          <div className="act">
            <Button variant="primary" size="sm" icon="sparkles" disabled={!text.trim()} onClick={estimate}>{t('Get estimate')}</Button>
          </div>
        )}
      </div>
      <p className="sect-f" style={{ marginBottom: 16 }}>{t('AI suggests the calories and macros. You check them before anything is saved.')}</p>
    </> : (
      <Section>
        <Row icon="sparkles" iconTint="var(--purple)" title={t('Describe it — AI does the numbers')}
          subtitle={t('Free, with your own key. Set it up once.')} accessory="chevron" onClick={() => aiConnectSheet()} />
      </Section>
    )}
    <Section>
      <Row icon="bolt" iconTint="var(--orange)" title={t('Quick add')} subtitle={t('Just the calories, when you know them')}
        accessory="chevron" onClick={() => quickAddSheet(slot, iso, close)} />
      {meal && <Row icon="history" iconTint="var(--acc)" title={t('Repeat from {0}', fmtDate(meal.date, true))}
        subtitle={meal.entries.map(e => e.name).join(', ') + ' · ' + fmtNum(totals(meal.entries).kcal) + ' kcal'}
        accessory="chevron" onClick={repeat} />}
    </Section>
    {N.foods.length > 0 && <>
      <Segmented value={tab} onChange={v => { setTab(v); setQ('') }}
        options={[{ value: 'recent', label: t('Recent') }, { value: 'fav', label: t('Favourites') }, { value: 'mine', label: t('My foods') }]} />
      {tab === 'mine' && <div style={{ marginTop: 10 }}>
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search my foods')} />
      </div>}
      <div className="sect-b" style={{ marginTop: 10 }}>
        {shown.length ? shown.map(f => <div key={f.id} className="lrow">
          <button className="lrow-m" style={{ textAlign: 'left' }} onClick={() => foodSheet({ food: f, slot, iso, done: close })}>
            <span className="lrow-t">{f.name}</span>
            <span className="lrow-s">{[f.brand, f.serving, fmtNum(f.kcal) + ' kcal'].filter(Boolean).join(' · ')}</span>
          </button>
          <button className="addc" aria-label={t('Add {0}', f.name)} onClick={() => addOne(f)}><Icon name="plus" /></button>
        </div>) : <div className="lrow"><span className="lrow-s">{tab === 'fav' ? t('Star a food to keep it here.') : t('Nothing here yet.')}</span></div>}
      </div>
    </>}
    <div style={{ height: 8 }} />
  </>
}
export const addFoodSheet = (slot, iso = todayISO()) => ui().openSheet(close => <AddFood slot={slot} iso={iso} close={close} />)

/* ============================ the AI's estimate ============================ */

const asItems = items => items.map(i => ({ ...i, qty: 1, on: true }))

function Estimate({ res, text, slot, iso, done, close }) {
  const N = useN()
  const [items, setItems] = useState(asItems(res.items))
  const [assumptions, setAssumptions] = useState(res.assumptions)
  const [ask, setAsk] = useState(text)
  const est = useEstimate(N.ai)
  const busy = est.busy
  const chosen = items.filter(i => i.on)
  const sum = totals(chosen.map(i => ({ kcal: i.kcal * i.qty, p: i.p * i.qty, f: i.f * i.qty, c: i.c * i.qty })))
  const goal = goalOn(N, iso)
  const left = goal ? goal.kcal - totals(dayLog(N, iso)).kcal - sum.kcal : null
  const setItem = (i, patch) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  // A changed assumption goes back to the model as a correction, so every number that
  // depends on it moves together (a smaller coffee is less milk is less of everything).
  const redo = async correction => {
    const txt = ask + '\n' + correction
    try {
      const r = await est.run(txt)
      if (r.items.length) { setItems(asItems(r.items)); setAssumptions(r.assumptions); setAsk(txt) }
    } catch (e) { if (e.kind !== 'cancelled') toast(aiErrorText(e)) }
  }
  const add = () => {
    mutate(n => logFoods(n, chosen, slot, iso))
    close(); if (done) done()
    toast(t('Added to {0}', slotName(slot)))
  }

  return <>
    <h3>{t('Estimate')}</h3>
    <div className="quote">
      <Icon name="sparkles" className="accent" />
      <span style={{ flex: 1 }}>«{text}»</span>
      <button className="accent" onClick={close}>{t('Edit')}</button>
    </div>
    <div className="list">
      {items.map((it, i) => <div key={i} className={'est' + (it.on ? '' : ' off')}>
        <div className="top">
          <Check checked={it.on} onChange={v => setItem(i, { on: v })} size={26} />
          <button className="grow" style={{ textAlign: 'left' }}
            onClick={() => foodSheet({ food: it, qty: it.qty, draft: true, onSave: (vals, qty) => setItem(i, { ...vals, qty }) })}>
            <div className="tt">{it.name}</div>
            <div className="ss">{[it.brand, servingText(it.qty, it.serving)].filter(Boolean).join(' · ')}</div>
          </button>
          <div className="kc"><b>{fmtNum(Math.round(it.kcal * it.qty))}</b><i>kcal</i></div>
        </div>
        <div className="mac">
          {['p', 'f', 'c'].map(k => <span key={k}><i className="dot" style={{ background: `var(--mac-${k})` }} />{t(MACRO_LABEL[k])} {fmtNum(Math.round(it[k] * it.qty))} g</span>)}
        </div>
        <div className="meta">
          <span className={'tag nocap ' + CONF[it.confidence].cls}>{t(CONF[it.confidence].label)}</span>
          <span>{it.source === 'published' ? t('Published nutrition info') : t('Estimated from similar foods')}</span>
        </div>
      </div>)}
    </div>
    {assumptions.length > 0 && <>
      <h4 className="sec">{t('Assumptions · tap to change')}</h4>
      <div className="chips wrap">
        {assumptions.map((a, i) => <button key={i} className="chip nocap" disabled={busy}
          onClick={() => valueSheet({ title: a.label, value: a.value, onSave: v => { if (v && v !== a.value) redo(a.label + ': ' + v) } })}>
          <span className="muted">{a.label}:</span> {a.value} <Icon name="chevronDown" />
        </button>)}
      </div>
    </>}
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="t-head">{t('Total')}</span>
        <span><span className="stat-v" style={{ fontSize: 20 }}>{fmtNum(sum.kcal)}</span> <span className="muted small">kcal</span></span>
      </div>
      <div className="row between muted small" style={{ marginTop: 4 }}>
        <span>{t('P {0} g · F {1} g · C {2} g', fmtNum(Math.round(sum.p)), fmtNum(Math.round(sum.f)), fmtNum(Math.round(sum.c)))}</span>
        {left != null && <span>{left >= 0 ? t('{0} kcal left after this', fmtNum(left)) : t('{0} kcal over after this', fmtNum(-left))}</span>}
      </div>
    </div>
    {busy && <div className="card"><AiProgress prog={est.prog} provider={N.ai.provider} onCancel={est.cancel} /></div>}
    <Button variant="primary" disabled={!chosen.length || busy} onClick={add}>
      {t(chosen.length === 1 ? 'Add {0} item to {1}' : 'Add {0} items to {1}', chosen.length, slotName(slot))}
    </Button>
    <p className="sect-f" style={{ textAlign: 'center' }}>{t('Saved to My foods, so next time it’s one tap. AI estimate: check the values — you can change them.')}</p>
  </>
}
export const estimateSheet = opts => ui().openSheet(close => <Estimate {...opts} close={close} />)

function ValueSheet({ title, value, onSave, close }) {
  const [v, setV] = useState(value)
  return <>
    <h3>{title}</h3>
    <TextField value={v} onChange={e => setV(e.target.value)} maxLength={60} autoFocus
      onKeyDown={e => { if (e.key === 'Enter') { close(); onSave(v.trim()) } }} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => { close(); onSave(v.trim()) }}>{t('Recalculate')}</Button>
    <div style={{ height: 8 }} />
  </>
}
const valueSheet = opts => ui().openSheet(close => <ValueSheet {...opts} close={close} />)

/* ============================ one food, by the serving ============================ */

// Three uses: adding a food from My foods, editing a logged entry, and adjusting an item of an
// AI estimate before it's saved (`draft` — nothing is written, `onSave` gets the result).
// Values are edited per serving; what gets logged is them times the number of servings.
function FoodEditor({ food, entry, iso, slot: slot0, qty: qty0 = 1, draft, onSave, done, close }) {
  const N = useN()
  const src = entry || food
  const per = entry && entry.qty > 0
    ? { kcal: entry.kcal / entry.qty, p: entry.p / entry.qty, f: entry.f / entry.qty, c: entry.c / entry.qty }
    : food
  const [qty, setQty] = useState(entry ? entry.qty : qty0)
  const [slot, setSlot] = useState(entry ? entry.slot : slot0)
  const [vals, setVals] = useState({ kcal: Math.round(per.kcal), p: r1(per.p), f: r1(per.f), c: r1(per.c) })
  const [editing, setEditing] = useState(false)
  const stored = N.foods.find(f => f.id === (entry ? entry.foodId : food.id))
  const q = qty || 0

  const save = () => {
    if (draft) { onSave(vals, q); close(); return }
    if (entry) {
      mutate(n => {
        const e = (n.log[iso] || []).find(x => x.id === entry.id)
        if (!e) return
        Object.assign(e, { qty: q, slot, kcal: Math.round(vals.kcal * q), p: r1(vals.p * q), f: r1(vals.f * q), c: r1(vals.c * q) })
        // corrected numbers carry over to the food for next time — never to other days
        const f = editing && n.foods.find(x => x.id === e.foodId)
        if (f) Object.assign(f, { kcal: Math.round(vals.kcal), p: r1(vals.p), f: r1(vals.f), c: r1(vals.c) })
      })
      close(); toast(t('Saved'))
      return
    }
    mutate(n => logFoods(n, [{ ...food, ...vals, qty: q }], slot, iso))
    close(); if (done) done()
    toast(t('Added to {0}', slotName(slot)))
  }
  const remove = () => {
    mutate(n => {
      n.log[iso] = (n.log[iso] || []).filter(x => x.id !== entry.id)
      if (!n.log[iso].length) delete n.log[iso]
    })
    close(); toast(t('Removed'))
  }
  const toggleFav = () => mutate(n => { const f = n.foods.find(x => x.id === stored.id); if (f) f.fav = !f.fav })

  return <>
    <div className="row between" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
      <h3 style={{ margin: 0 }}>{src.name}</h3>
      {stored && !draft && <button className="iconbtn" onClick={toggleFav} style={stored.fav ? { color: 'var(--yellow)' } : undefined}
        aria-label={stored.fav ? t('Remove from favourites') : t('Add to favourites')}><Icon name={stored.fav ? 'starFill' : 'star'} /></button>}
    </div>
    <div className="muted small" style={{ marginBottom: 14 }}>{[src.brand, src.serving].filter(Boolean).join(' · ') || t('1 serving')}</div>
    <div className="card">
      <div className="row" style={{ gap: 6, alignItems: 'baseline', marginBottom: 10 }}>
        <span className="big">{fmtNum(Math.round(vals.kcal * q))}</span><span className="muted">kcal</span>
      </div>
      <MacroSplit p={vals.p * q} f={vals.f * q} c={vals.c * q} />
    </div>
    <Section>
      <Row title={t('Servings')}><Stepper value={qty} step={0.5} onChange={v => setQty(Math.max(0, v))} /></Row>
      {!draft && <SelectRow title={t('Meal')} value={slot} onChange={setSlot}
        options={SLOTS.map(s => ({ value: s, label: slotName(s) }))} />}
    </Section>
    {editing ? (
      <Section title={t('Values per serving')}>
        {['kcal', 'p', 'f', 'c'].map(k => <Row key={k} title={t(MACRO_LABEL[k])}>
          <NumberField className="lrow-in" value={vals[k]} onChange={v => setVals(x => ({ ...x, [k]: v }))} />
          <span className="muted" style={{ width: 30 }}>{k === 'kcal' ? 'kcal' : 'g'}</span>
        </Row>)}
      </Section>
    ) : <Button size="sm" icon="pencil" onClick={() => setEditing(true)} style={{ marginBottom: 16 }}>{t('Edit values')}</Button>}
    {src.src === 'ai' && <div className="note" style={{ marginTop: -6, marginBottom: 14 }}><Icon name="info" /><span>{t('AI estimate — check the values, you can change them.')}</span></div>}
    <Button variant="primary" disabled={!(q > 0)} onClick={save}>{entry || draft ? t('Save') : t('Add to {0}', slotName(slot))}</Button>
    {entry && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
    <div style={{ height: 8 }} />
  </>
}
export const foodSheet = opts => ui().openSheet(close => <FoodEditor {...opts} close={close} />)
export const entrySheet = (iso, entry) => foodSheet({ entry, iso })

/* ============================ quick add ============================ */

function QuickAdd({ slot, iso, done, close }) {
  const [name, setName] = useState('')
  const [v, setV] = useState({ kcal: null, p: null, f: null, c: null })
  const save = () => {
    if (!(v.kcal > 0)) { toast(t('Enter the calories')); return }
    mutate(n => {
      if (!n.log[iso]) n.log[iso] = []
      n.log[iso].push(quickEntry({ name: name.trim() || t('Quick add'), ...v }, slot))
    })
    close(); if (done) done()
    toast(t('Added to {0}', slotName(slot)))
  }
  return <>
    <h3>{t('Quick add')}</h3>
    <TextField placeholder={t('Name (optional)')} value={name} maxLength={60} onChange={e => setName(e.target.value)} />
    <div style={{ height: 14 }} />
    <Section footer={t('Protein, fat and carbs are optional.')}>
      {['kcal', 'p', 'f', 'c'].map(k => <Row key={k} title={t(MACRO_LABEL[k])}>
        <NumberField className="lrow-in" nullable value={v[k]} placeholder={k === 'kcal' ? '0' : '—'} onChange={x => setV(o => ({ ...o, [k]: x }))} />
        <span className="muted" style={{ width: 30 }}>{k === 'kcal' ? 'kcal' : 'g'}</span>
      </Row>)}
    </Section>
    <Button variant="primary" onClick={save}>{t('Add to {0}', slotName(slot))}</Button>
    <div style={{ height: 8 }} />
  </>
}
export const quickAddSheet = (slot, iso, done) => ui().openSheet(close => <QuickAdd slot={slot} iso={iso} done={done} close={close} />)

/* ============================ own numbers ============================ */

function ManualGoal({ onSaved, close }) {
  const S = useStore(s => s.S)
  const g = goalOn(S.nutrition, todayISO())
  const [v, setV] = useState({ kcal: g ? g.kcal : null, p: g ? g.p : null, f: g ? g.f : null, c: g ? g.c : null })
  const autoC = v.kcal > 0 && v.p != null && v.f != null ? Math.max(0, Math.round((v.kcal - v.p * 4 - v.f * 9) / 4)) : null
  const save = () => {
    if (!(v.kcal > 0) || v.p == null || v.f == null) { toast(t('Enter calories, protein and fat')); return }
    const c = v.c != null ? v.c : autoC
    mutate(n => { n.goals = withGoal(n.goals, { mode: 'cut', method: 'manual', kcal: Math.round(v.kcal), p: Math.round(v.p), f: Math.round(v.f), c: Math.round(c) }, todayISO()) })
    close(); toast(t('Target saved')); if (onSaved) onSaved()
  }
  return <>
    <h3>{t('Your own numbers')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('From a nutritionist, another app, or your own maths. Carbs fill in by themselves if you leave them empty.')}</div>
    <Section footer={v.kcal > 0 && v.kcal < 1200 ? t('That’s very low for a diet without supervision.') : null}>
      {['kcal', 'p', 'f', 'c'].map(k => <Row key={k} title={t(MACRO_LABEL[k])}>
        <NumberField className="lrow-in" nullable decimal={false} value={v[k]}
          placeholder={k === 'c' && autoC != null ? String(autoC) : '—'} onChange={x => setV(o => ({ ...o, [k]: x }))} />
        <span className="muted" style={{ width: 30 }}>{k === 'kcal' ? 'kcal' : 'g'}</span>
      </Row>)}
    </Section>
    <Button variant="primary" onClick={save}>{t('Save target')}</Button>
    <div style={{ height: 8 }} />
  </>
}
export const manualGoalSheet = onSaved => ui().openSheet(close => <ManualGoal onSaved={onSaved} close={close} />)

/* ============================ connect a free AI provider ============================ */

const PROVIDER_INFO = {
  gemini: { tag: 'Recommended', sub: 'Free, no card · knows chain-restaurant menus', site: 'Google AI Studio' },
  groq: { tag: 'Open source', sub: 'Free · open models (Qwen, Llama) · very fast', site: 'GroqCloud' },
  openrouter: { sub: 'Free up to 50 a day · many open models', site: 'OpenRouter' },
  custom: { sub: 'Any OpenAI-compatible API, or Ollama on your computer' },
}

function AiConnect({ close }) {
  const N = useN()
  const cur = N.ai || {}
  const [provider, setProvider] = useState(PROVIDERS[cur.provider] ? cur.provider : 'gemini')
  const [base, setBase] = useState(cur.base || 'http://localhost:11434/v1')
  const [key, setKeyV] = useState(getKey())
  const [busy, setBusy] = useState(false)
  const connected = aiReady(N)
  const canPaste = !!(navigator.clipboard && navigator.clipboard.readText)
  const info = PROVIDER_INFO[provider]
  // The other models this key can use, to switch to a faster one without connecting again.
  const [models, setModels] = useState(null)
  useEffect(() => {
    if (!connected) return
    let live = true
    availableModels({ provider: cur.provider, base: cur.base }, getKey())
      .then(ms => { if (live) setModels(ms.slice(0, 6)) }).catch(() => {})
    return () => { live = false }
  }, [connected, cur.provider, cur.base])
  const choices = models && cur.model ? (models.includes(cur.model) ? models : [cur.model, ...models]) : []

  const test = async () => {
    const k = key.trim()
    setBusy(true)
    try {
      const { model } = await connect({ provider, base }, k)
      setKey(k)
      mutate(n => { n.ai = { on: true, provider, model, base: provider === 'custom' ? base : null } })
      close(); toast(t('Connected · {0}', model))
    } catch (e) { e.provider = provider; toast(aiErrorText(e)) }
    setBusy(false)
  }
  const disconnect = () => { setKey(''); mutate(n => { n.ai = null }); close(); toast(t('AI disconnected')) }
  const paste = async () => { try { setKeyV((await navigator.clipboard.readText()).trim()) } catch (e) { /* permission denied */ } }

  return <>
    <h3>{t('Connect free AI')}</h3>
    <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.45 }}>
      {t('With your own free key. It’s only used to estimate meals, called straight from this device — no OkuGym server involved.')}
    </div>
    <Section title={t('Provider')}>
      {Object.keys(PROVIDERS).map(p => <button key={p} className="lrow tap" onClick={() => setProvider(p)}>
        <span className="lrow-m">
          <span className="lrow-t row" style={{ gap: 8 }}>{p === 'custom' ? t('Custom') : PROVIDERS[p].name}
            {PROVIDER_INFO[p].tag && <span className={'tag nocap ' + (p === 'gemini' ? 'acc' : 'ok')}>{t(PROVIDER_INFO[p].tag)}</span>}</span>
          <span className="lrow-s">{t(PROVIDER_INFO[p].sub)}</span>
        </span>
        {p === provider && <Icon name="check" className="lrow-k" />}
      </button>)}
    </Section>
    {provider === 'custom' ? <>
      <TextField value={base} onChange={e => setBase(e.target.value)} placeholder="http://localhost:11434/v1" inputMode="url" />
      <p className="sect-f" style={{ marginBottom: 16 }}>{t('Base URL of the API. For Ollama, start it with OLLAMA_ORIGINS=* so the app may call it.')}</p>
    </> : (
      <div className="card">
        <div className="t-head" style={{ marginBottom: 6, fontSize: 15 }}>{t('Get your key (2 minutes, no card)')}</div>
        <ol className="steps-ol">
          <li>{t('Open {0} and sign in.', info.site)}</li>
          <li>{t('Create an API key.')}</li>
          <li>{t('Copy it and paste it below.')}</li>
        </ol>
        <Button size="sm" variant="tinted" icon="link" style={{ marginTop: 10 }}
          onClick={() => window.open(PROVIDERS[provider].keyUrl, '_blank', 'noopener')}>{t('Open {0}', info.site)}</Button>
      </div>
    )}
    <label className="sect-t" htmlFor="aikey">{t('API key')}</label>
    <div className="keyf">
      <input id="aikey" className="field" type="password" autoComplete="off" spellCheck={false} value={key}
        onChange={e => setKeyV(e.target.value)} placeholder={provider === 'custom' ? t('Optional') : ''} />
      {canPaste && <Button size="sm" onClick={paste}>{t('Paste')}</Button>}
    </div>
    <div className="note" style={{ marginBottom: 14 }}>
      <Icon name="lock" />
      <span>{t('The key stays on this device: it isn’t synced or included in backups. Only the meal description is sent — never your weight, history or name.')}
        {provider === 'gemini' && ' ' + t('On the free plan Google may use what you send to improve its products.')}</span>
    </div>
    <Button variant="primary" disabled={busy || (!key.trim() && provider !== 'custom')} onClick={test}>
      {busy ? t('Checking…') : t('Test and save')}
    </Button>
    {connected && <>
      {choices.length > 1 && <><div style={{ height: 20 }} /><Section title={t('Model')} footer={t('Lite models answer faster; the others know more products.')}>
        {choices.map(id => <button key={id} className="lrow tap" onClick={() => mutate(n => { n.ai.model = id })}>
          <span className="lrow-m"><span className="lrow-t row" style={{ gap: 8 }}>{id}
            {/lite/i.test(id) && <span className="tag nocap ok">{t('Faster')}</span>}</span></span>
          {id === cur.model && <Icon name="check" className="lrow-k" />}
        </button>)}
      </Section></>}
      <p className="sect-f" style={{ textAlign: 'center' }}>{t('Connected: {0} · {1}', PROVIDERS[cur.provider] && cur.provider !== 'custom' ? PROVIDERS[cur.provider].name : t('Custom'), cur.model)}</p>
      <Button variant="ghost" className="dim" onClick={disconnect}>{t('Disconnect')}</Button>
    </>}
    <div style={{ height: 8 }} />
  </>
}
export const aiConnectSheet = () => ui().openSheet(close => <AiConnect close={close} />)
