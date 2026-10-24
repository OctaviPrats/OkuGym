// Meal estimates from a free AI provider, called straight from the device with the user's own
// API key. The local and mobile builds have no server, and this needs none.
//
// Every provider here speaks the OpenAI-style chat API (Gemini through its OpenAI compatibility
// endpoint), so one adapter covers them all: switching provider is a base URL, a key and a model
// id. Plain fetch, no SDK.
//
// The key is kept in localStorage only, never in S — S is synced, backed up and shared.

export const PROVIDERS = {
  gemini: { name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  custom: { name: 'Custom', base: '' },
}

const KEY = 'gym_ai_key'
export const getKey = () => { try { return localStorage.getItem(KEY) || '' } catch (e) { return '' } }
export const setKey = k => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY) } catch (e) { /* storage blocked */ } }

// A custom endpoint (a local Ollama) may need no key at all.
export const aiReady = N => !!(N && N.ai && N.ai.on && N.ai.model && (getKey() || N.ai.provider === 'custom'))

// kind: 'key' (rejected), 'limit' (rate limit / free quota used up), 'network', 'model'
// (no usable model), 'format' (an answer we can't read), 'timeout', 'cancelled', 'http' (anything else)
export class AiError extends Error {
  constructor(kind, status) { super(kind); this.kind = kind; this.status = status }
}

// How requests go out. In the native app CapacitorHttp (capacitor.config.json) replaces
// window.fetch with one that runs through the native bridge: that gets past CORS, but on Android
// its answer has been seen to sit undelivered until the next touch on the screen. So the
// WebView's own fetch, which Capacitor keeps as CapacitorWebFetch, goes first, and the bridge is
// only the fallback for a provider that refuses browser calls. In a browser this is plain fetch.
export async function netFetch(url, init) {
  const web = typeof window !== 'undefined' && window.CapacitorWebFetch
  if (web) {
    try { return await web(url, init) } catch (e) { if (init && init.signal && init.signal.aborted) throw e }
  }
  return fetch(url, init)
}

export const baseOf = cfg => String((cfg.provider === 'custom' ? cfg.base : PROVIDERS[cfg.provider]?.base) || '').replace(/\/+$/, '')

function headersFor(cfg, key) {
  const h = { 'Content-Type': 'application/json' }
  if (key) h.Authorization = 'Bearer ' + key
  if (cfg.provider === 'openrouter') h['X-Title'] = 'OkuGym'
  return h
}

async function call(fetchImpl, url, init) {
  let res
  try { res = await fetchImpl(url, init) } catch (e) { throw new AiError(init && init.signal && init.signal.aborted ? 'cancelled' : 'network') }
  if (res.ok) return res
  const s = res.status
  throw new AiError(s === 401 || s === 403 ? 'key' : s === 429 ? 'limit' : 'http', s)
}

/* ------------------------------------------------------------- models -- */

// Not every id a provider lists can chat (embeddings, speech, image generation…).
const NOT_CHAT = /embed|tts|audio|image|imagen|veo|live|whisper|guard|moderat|transcri|speech|aqa|robotics|computer|realtime|native/i

// Model ids come from the provider's own list rather than being hardcoded: free models get
// renamed and retired all the time. This only puts the usable ones in order of preference.
export function pickModels(provider, ids) {
  const xs = [...new Set((ids || []).map(id => String(id).replace(/^models\//, '')))].filter(id => !NOT_CHAT.test(id))
  if (provider === 'gemini') {
    const ver = id => parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]) || 0
    const pre = id => /preview|exp/i.test(id) ? 1 : 0
    const lite = id => /lite/i.test(id) ? 1 : 0
    return xs.filter(id => /^gemini-.*flash/i.test(id))
      .sort((a, b) => pre(a) - pre(b) || ver(b) - ver(a) || lite(a) - lite(b) || a.length - b.length)
  }
  if (provider === 'groq') {
    const rank = id => (/qwen/i.test(id) ? 0 : /gpt-oss/i.test(id) ? 1 : /llama/i.test(id) ? 2 : 3)
    return xs.sort((a, b) => rank(a) - rank(b))
  }
  if (provider === 'openrouter') return xs.filter(id => id.endsWith(':free'))
  return xs
}

async function listModels(cfg, key, fetchImpl) {
  const res = await call(fetchImpl, baseOf(cfg) + '/models', { headers: headersFor(cfg, key) })
  const j = await res.json().catch(() => ({}))
  return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean)
}

// Checks the key and finds a model that answers on this account (a free tier can list a
// model it has no quota for). Returns the model id to save.
export async function connect(cfg, key, fetchImpl = netFetch) {
  if (!baseOf(cfg)) throw new AiError('network')
  const ids = await listModels(cfg, key, fetchImpl)
  const candidates = cfg.model ? [cfg.model] : pickModels(cfg.provider, ids).slice(0, 4)
  if (!candidates.length) throw new AiError('model')
  let last = null
  for (const model of candidates) {
    try {
      await call(fetchImpl, baseOf(cfg) + '/chat/completions', {
        method: 'POST', headers: headersFor(cfg, key),
        // no max_tokens: some providers reject small caps, and thinking models spend them before answering
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the word ok.' }] }),
      })
      return { model, models: pickModels(cfg.provider, ids) }
    } catch (e) {
      if (e.kind === 'key' || e.kind === 'network') throw e
      last = e
    }
  }
  throw last || new AiError('model')
}

/* ----------------------------------------------------------- estimate -- */

const LANG_NAMES = {
  en: 'English', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese',
  pl: 'Polish', tr: 'Turkish', ru: 'Russian', zh: 'Chinese', ko: 'Korean', hi: 'Hindi',
}

export function systemPrompt(lang) {
  return [
    'You estimate the nutrition of food someone describes, for a calorie-tracking app.',
    'Reply with JSON only, no other text, in exactly this shape:',
    '{"items":[{"name":string,"brand":string|null,"serving":string,"grams":number|null,"kcal":number,"p":number,"f":number,"c":number,"confidence":"high"|"medium"|"low","source":"published"|"estimate"}],"assumptions":[{"label":string,"value":string}]}',
    'Rules:',
    '- One item per distinct food or drink. "serving" is the amount in words, like "1 Grande (473 ml)" or "2 slices (60 g)". kcal, p (protein, g), f (fat, g) and c (carbohydrate, g) are for that whole amount.',
    '- For chain and restaurant products use the chain\'s published nutrition information when you know it (source "published"); otherwise estimate from similar products (source "estimate").',
    '- When the description leaves out something that changes the numbers (size, type of milk, cooking oil, sauce), assume the most common option and list each assumption in "assumptions" with a short label and value.',
    '- confidence is "high" for packaged or published values, "medium" for typical recipes, "low" for vague descriptions.',
    '- Write names, servings and assumptions in ' + (LANG_NAMES[lang] || 'English') + '. Use metric units.',
    '- If the text does not describe food or drink, reply {"items":[],"assumptions":[]}.',
  ].join('\n')
}

// No temperature: Gemini 3 models are meant to run at their default, and lowering it can make them
// slower or loop. Gemini thinks before answering by default; reading a meal needs little of that,
// so it is asked for low effort — the biggest single cut in waiting time. `plain` drops every
// extra, for a model that rejects them.
export function buildEstimateRequest({ text, lang, model, provider, plain = false }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt(lang) },
      { role: 'user', content: String(text).trim() },
    ],
  }
  if (!plain) {
    body.response_format = { type: 'json_object' }
    if (provider === 'gemini') body.reasoning_effort = 'low'
  }
  return body
}

export const ESTIMATE_TIMEOUT = 75000

// `onStage` hears what is happening, for the progress shown while waiting: 'asking' (sent,
// the model is working), 'retry' (asked again without JSON mode), 'reading' (answer in). There
// is no percentage to report — the API answers all at once. `signal` cancels; after `timeoutMs`
// it gives up. Both settle straight away even if the transport ignores the abort.
export async function estimateMeal({ text, lang, cfg, key, fetchImpl = netFetch, onStage, signal, timeoutMs = ESTIMATE_TIMEOUT }) {
  const stage = s => { if (onStage) onStage(s) }
  const ctl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctl.abort() }, timeoutMs)
  const cancel = () => ctl.abort()
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', cancel) }
  const stopped = new Promise((_, reject) => ctl.signal.addEventListener('abort', () => reject(new AiError('cancelled'))))
  stopped.catch(() => {})
  const race = p => Promise.race([p, stopped])

  const url = baseOf(cfg) + '/chat/completions'
  const send = plain => race(call(fetchImpl, url, {
    method: 'POST', headers: headersFor(cfg, key), signal: ctl.signal,
    body: JSON.stringify(buildEstimateRequest({ text, lang, model: cfg.model, provider: cfg.provider, plain })),
  }))
  try {
    stage('asking')
    let res
    try { res = await send(false) } catch (e) {
      // not every model takes JSON mode or a reasoning setting; the prompt asks for JSON anyway
      if (e.kind !== 'http' || e.status !== 400) throw e
      stage('retry')
      res = await send(true)
    }
    stage('reading')
    const j = await race(res.json().catch(() => null))
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
    return parseEstimate(content)
  } catch (e) {
    if (e.kind === 'cancelled' && timedOut) throw new AiError('timeout')
    throw e
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', cancel)
  }
}

/* ------------------------------------------------------------ parsing -- */

const r1 = n => Math.round(n * 10) / 10
const str = v => (typeof v === 'string' ? v.trim() : '')
function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function normItem(x) {
  if (!x || typeof x !== 'object') return null
  const name = str(x.name).slice(0, 80)
  if (!name) return null
  const p = num(x.p ?? x.protein) ?? 0
  const f = num(x.f ?? x.fat) ?? 0
  const c = num(x.c ?? x.carbs ?? x.carbohydrates) ?? 0
  let kcal = num(x.kcal ?? x.calories)
  // a missing or zero total next to real macros is a slip; the macros say what it should be
  if (kcal == null || (kcal === 0 && p + f + c > 0)) kcal = p * 4 + f * 9 + c * 4
  if (kcal > 5000) return null
  return {
    name, brand: str(x.brand) || null, serving: str(x.serving).slice(0, 60) || null, grams: num(x.grams),
    kcal: Math.round(kcal), p: r1(p), f: r1(f), c: r1(c),
    confidence: ['high', 'medium', 'low'].includes(x.confidence) ? x.confidence : 'medium',
    source: x.source === 'published' ? 'published' : 'estimate',
    src: 'ai',
  }
}

// Reads a model's answer defensively: fenced or not, with stray prose around the JSON, with
// the usual key aliases. Throws AiError('format') when there is no JSON object to read.
export function parseEstimate(raw) {
  let s = String(raw || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b < a) throw new AiError('format')
  let obj
  try { obj = JSON.parse(s.slice(a, b + 1)) } catch (e) { throw new AiError('format') }
  const items = (Array.isArray(obj.items) ? obj.items : []).map(normItem).filter(Boolean).slice(0, 12)
  const assumptions = (Array.isArray(obj.assumptions) ? obj.assumptions : [])
    .map(x => ({ label: str(x && x.label).slice(0, 40), value: str(x && x.value).slice(0, 60) }))
    .filter(x => x.label && x.value)
    .slice(0, 6)
  return { items, assumptions }
}
