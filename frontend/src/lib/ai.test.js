import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseEstimate, pickModels, buildEstimateRequest, estimateMeal, connect, baseOf, netFetch, AiError } from './ai.js'

// A fake fetch: each call takes the next scripted reply and records what was sent.
function fakeFetch(replies) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    const r = replies.shift()
    if (r instanceof Error) throw r
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json }
  }
  fn.calls = calls
  return fn
}
const chat = content => ({ status: 200, json: { choices: [{ message: { content } }] } })
const ESTIMATE = JSON.stringify({
  items: [
    { name: 'Caffè Latte', brand: 'Starbucks', serving: '1 Grande (473 ml)', grams: 473, kcal: 150, p: 11, f: 5, c: 15, confidence: 'high', source: 'published' },
    { name: 'Egg sandwich', brand: 'Starbucks', serving: '1 ud', kcal: 380, p: 19, f: 18, c: 34, confidence: 'medium', source: 'estimate' },
  ],
  assumptions: [{ label: 'Size', value: 'Grande' }, { label: 'Milk', value: 'semi-skimmed' }],
})

describe('parseEstimate', () => {
  it('reads a well-formed answer', () => {
    const r = parseEstimate(ESTIMATE)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ name: 'Caffè Latte', brand: 'Starbucks', kcal: 150, p: 11, confidence: 'high', source: 'published', src: 'ai' })
    expect(r.assumptions).toEqual([{ label: 'Size', value: 'Grande' }, { label: 'Milk', value: 'semi-skimmed' }])
  })

  it('reads fenced JSON and JSON wrapped in prose', () => {
    expect(parseEstimate('```json\n' + ESTIMATE + '\n```').items).toHaveLength(2)
    expect(parseEstimate('Here you go: ' + ESTIMATE + ' Enjoy!').items).toHaveLength(2)
  })

  it('accepts the usual key aliases and decimal commas', () => {
    const r = parseEstimate(JSON.stringify({ items: [{ name: 'Rice', calories: '200', protein: '4,5', fat: 1, carbohydrates: 44 }] }))
    expect(r.items[0]).toMatchObject({ kcal: 200, p: 4.5, f: 1, c: 44, confidence: 'medium', source: 'estimate' })
  })

  it('derives a missing or zero total from the macros', () => {
    expect(parseEstimate('{"items":[{"name":"X","p":10,"f":10,"c":10}]}').items[0].kcal).toBe(170)
    expect(parseEstimate('{"items":[{"name":"X","kcal":0,"p":10,"f":0,"c":0}]}').items[0].kcal).toBe(40)
  })

  it('drops items without a name, negative values and absurd totals', () => {
    const r = parseEstimate(JSON.stringify({ items: [{ kcal: 100 }, { name: 'A', kcal: -5, p: 2 }, { name: 'B', kcal: 9000 }, { name: 'C', kcal: 50 }] }))
    expect(r.items.map(i => i.name)).toEqual(['A', 'C'])
    expect(r.items[0].kcal).toBe(8)       // negative total ignored, rebuilt from the 2 g of protein
  })

  it('returns no items for a non-food answer', () => {
    expect(parseEstimate('{"items":[],"assumptions":[]}')).toEqual({ items: [], assumptions: [] })
  })

  it('throws a format error when there is no JSON to read', () => {
    expect(() => parseEstimate('Sorry, I cannot help.')).toThrow(AiError)
    expect(() => parseEstimate('{not json}')).toThrow(AiError)
    expect(() => parseEstimate(null)).toThrow(AiError)
  })
})

describe('pickModels', () => {
  it('prefers stable, newer Gemini Flash models and skips non-chat ones', () => {
    const ids = ['models/gemini-2.5-flash', 'models/gemini-3-flash', 'models/gemini-3-flash-lite', 'models/gemini-3-flash-preview-0901',
      'models/gemini-3-pro', 'models/text-embedding-004', 'models/gemini-3-flash-image', 'models/gemini-3-flash-native-audio']
    expect(pickModels('gemini', ids)).toEqual(['gemini-3-flash', 'gemini-3-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview-0901'])
  })

  it('ranks open models on Groq and keeps only free ones on OpenRouter', () => {
    expect(pickModels('groq', ['llama-3.3-70b', 'whisper-large-v3', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'meta-llama/llama-guard-4']))
      .toEqual(['qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.3-70b'])
    expect(pickModels('openrouter', ['a/paid', 'b/model:free', 'c/other:free'])).toEqual(['b/model:free', 'c/other:free'])
  })
})

describe('requests', () => {
  it('asks for JSON in the UI language', () => {
    const b = buildEstimateRequest({ text: ' café con leche ', lang: 'es', model: 'm' })
    expect(b.model).toBe('m')
    expect(b.response_format).toEqual({ type: 'json_object' })
    expect(b.messages[0].content).toContain('in Spanish')
    expect(b.messages[1]).toEqual({ role: 'user', content: 'café con leche' })
  })

  it('asks Gemini to think less, leaves temperature alone, and can drop every extra', () => {
    const g = buildEstimateRequest({ text: 'x', lang: 'en', model: 'm', provider: 'gemini' })
    expect(g.reasoning_effort).toBe('low')
    expect(g.temperature).toBeUndefined()
    expect(buildEstimateRequest({ text: 'x', lang: 'en', model: 'm', provider: 'groq' }).reasoning_effort).toBeUndefined()
    const plain = buildEstimateRequest({ text: 'x', lang: 'xx', model: 'm', provider: 'gemini', plain: true })
    expect(plain.response_format).toBeUndefined()
    expect(plain.reasoning_effort).toBeUndefined()
  })

  it('builds the base URL per provider', () => {
    expect(baseOf({ provider: 'gemini' })).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    expect(baseOf({ provider: 'custom', base: 'http://localhost:11434/v1/' })).toBe('http://localhost:11434/v1')
  })
})

describe('estimateMeal', () => {
  const cfg = { provider: 'gemini', model: 'gemini-3-flash' }

  it('sends the key and returns the parsed estimate', async () => {
    const f = fakeFetch([chat(ESTIMATE)])
    const r = await estimateMeal({ text: 'latte', lang: 'en', cfg, key: 'K', fetchImpl: f })
    expect(r.items).toHaveLength(2)
    expect(f.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(f.calls[0].init.headers.Authorization).toBe('Bearer K')
  })

  it('retries without JSON mode or reasoning settings when the model rejects them', async () => {
    const f = fakeFetch([{ status: 400, json: {} }, chat(ESTIMATE)])
    const stages = []
    const r = await estimateMeal({ text: 'latte', lang: 'en', cfg, key: 'K', fetchImpl: f, onStage: s => stages.push(s) })
    expect(r.items).toHaveLength(2)
    expect(f.calls[0].body).toMatchObject({ response_format: { type: 'json_object' }, reasoning_effort: 'low' })
    expect(f.calls[1].body.response_format).toBeUndefined()
    expect(f.calls[1].body.reasoning_effort).toBeUndefined()
    expect(stages).toEqual(['asking', 'retry', 'reading'])
  })

  it('gives up after the timeout, even if the request never settles', async () => {
    const never = async () => new Promise(() => {})
    await expect(estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: never, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('can be cancelled while waiting', async () => {
    const never = async () => new Promise(() => {})
    const ctl = new AbortController()
    const p = estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: never, signal: ctl.signal })
    ctl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('names the failure: rejected key, used-up quota, no network', async () => {
    await expect(estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: fakeFetch([{ status: 401, json: {} }]) })).rejects.toMatchObject({ kind: 'key' })
    await expect(estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: fakeFetch([{ status: 429, json: {} }]) })).rejects.toMatchObject({ kind: 'limit' })
    await expect(estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: fakeFetch([new TypeError('offline')]) })).rejects.toMatchObject({ kind: 'network' })
    await expect(estimateMeal({ text: 'x', lang: 'en', cfg, key: 'K', fetchImpl: fakeFetch([{ status: 200, json: {} }]) })).rejects.toMatchObject({ kind: 'format' })
  })
})

describe('netFetch', () => {
  afterEach(() => { delete globalThis.window; vi.unstubAllGlobals() })

  it('uses the WebView’s own fetch first in the native app', async () => {
    const web = vi.fn(async () => 'web')
    const bridge = vi.fn(async () => 'bridge')
    globalThis.window = { CapacitorWebFetch: web }
    vi.stubGlobal('fetch', bridge)
    expect(await netFetch('u', {})).toBe('web')
    expect(bridge).not.toHaveBeenCalled()
  })

  it('falls back to the native bridge when the WebView call fails (e.g. CORS)', async () => {
    globalThis.window = { CapacitorWebFetch: vi.fn(async () => { throw new TypeError('Failed to fetch') }) }
    vi.stubGlobal('fetch', vi.fn(async () => 'bridge'))
    expect(await netFetch('u', {})).toBe('bridge')
  })

  it('does not retry a call that was cancelled', async () => {
    const ctl = new AbortController(); ctl.abort()
    globalThis.window = { CapacitorWebFetch: vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }) }
    const bridge = vi.fn(async () => 'bridge')
    vi.stubGlobal('fetch', bridge)
    await expect(netFetch('u', { signal: ctl.signal })).rejects.toThrow()
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('connect', () => {
  const models = ids => ({ status: 200, json: { data: ids.map(id => ({ id })) } })
  const ok = { status: 200, json: { choices: [{ message: { content: 'ok' } }] } }

  it('picks the first model that answers on this account', async () => {
    const f = fakeFetch([models(['models/gemini-3-flash', 'models/gemini-3-flash-lite']), { status: 429, json: {} }, ok])
    const r = await connect({ provider: 'gemini' }, 'K', f)
    expect(r.model).toBe('gemini-3-flash-lite')
    expect(f.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models')
    expect(f.calls[1].body.model).toBe('gemini-3-flash')
  })

  it('reports a rejected key straight away', async () => {
    await expect(connect({ provider: 'groq' }, 'bad', fakeFetch([{ status: 401, json: {} }]))).rejects.toMatchObject({ kind: 'key' })
  })

  it('reports a used-up quota when no model answers', async () => {
    const f = fakeFetch([models(['qwen/qwen3-32b']), { status: 429, json: {} }])
    await expect(connect({ provider: 'groq' }, 'K', f)).rejects.toMatchObject({ kind: 'limit' })
  })

  it('reports when the provider has no usable model', async () => {
    await expect(connect({ provider: 'openrouter' }, 'K', fakeFetch([models(['a/paid'])]))).rejects.toMatchObject({ kind: 'model' })
  })
})
