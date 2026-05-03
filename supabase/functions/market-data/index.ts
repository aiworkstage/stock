const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const ok  = (d: unknown) => new Response(JSON.stringify(d), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (m: string, s = 500) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const YH = 'https://query1.finance.yahoo.com'
const YH2 = 'https://query2.finance.yahoo.com'
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MarketBot/1.0)' }

// Yahoo Finance — single quote (works for JP + US stocks)
async function yhQuote(sym: string) {
  for (const base of [YH, YH2]) {
    try {
      const r = await fetch(`${base}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`, { headers: UA })
      if (!r.ok) continue
      const d = await r.json()
      const meta = d?.chart?.result?.[0]?.meta
      if (!meta?.regularMarketPrice) continue
      const price = meta.regularMarketPrice
      const prev  = meta.chartPreviousClose ?? meta.previousClose ?? null
      return {
        price,
        change:        prev != null ? +(price - prev).toFixed(3)                    : null,
        changePercent: prev != null ? +((price - prev) / prev * 100).toFixed(2)     : null,
        high:    meta.regularMarketDayHigh  ?? null,
        low:     meta.regularMarketDayLow   ?? null,
        open:    meta.regularMarketOpen     ?? null,
        prevClose: prev,
        volume:  meta.regularMarketVolume   ?? null,
        currency: meta.currency             ?? null,
      }
    } catch { /* try next */ }
  }
  return null
}

// Yahoo Finance — OHLCV candles
async function yhCandles(sym: string, interval: string, range: string) {
  for (const base of [YH, YH2]) {
    try {
      const url = `${base}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`
      const r = await fetch(url, { headers: UA })
      if (!r.ok) continue
      const d = await r.json()
      const res = d?.chart?.result?.[0]
      if (!res?.timestamp?.length) continue
      const q = res.indicators?.quote?.[0] ?? {}
      // Filter out null candles
      const ts: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [], v: number[] = []
      for (let i = 0; i < res.timestamp.length; i++) {
        if (c[i] == null && q.close?.[i] == null) continue
        if (!q.close?.[i]) continue
        ts.push(res.timestamp[i])
        o.push(q.open?.[i]   ?? q.close[i])
        h.push(q.high?.[i]   ?? q.close[i])
        l.push(q.low?.[i]    ?? q.close[i])
        c.push(q.close[i])
        v.push(q.volume?.[i] ?? 0)
      }
      if (!c.length) continue
      return { t: ts, o, h, l, c, v }
    } catch { /* try next */ }
  }
  return null
}

// Finnhub — news only (still useful, free for news)
async function fhNews(sym: string, key: string) {
  try {
    const to   = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${key}`)
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d.slice(0, 6).map((n: any) => ({
      headline: n.headline, summary: n.summary, url: n.url,
      datetime: n.datetime, source: n.source,
    })) : []
  } catch { return [] }
}

// ボロ株デフォルトウォッチリスト
const BORO_DEFAULT = [
  { code: '9424', name: '日本通信',         sym: '9424.T' },
  { code: '2160', name: 'ジーエヌアイ',     sym: '2160.T' },
  { code: '3825', name: 'レミックスポイント', sym: '3825.T' },
  { code: '4344', name: 'ソースネクスト',   sym: '4344.T' },
  { code: '2370', name: 'メディネット',     sym: '2370.T' },
  { code: '9603', name: 'エイチ・アイ・エス', sym: '9603.T' },
  { code: '3765', name: 'ガンホー',         sym: '3765.T' },
  { code: '4477', name: 'BASE',            sym: '4477.T' },
  { code: '6050', name: 'イー・ガーディアン', sym: '6050.T' },
  { code: '3778', name: 'さくらインターネット', sym: '3778.T' },
  { code: '7177', name: 'GMOフィナンシャルHD', sym: '7177.T' },
  { code: '1431', name: 'Lib Work',        sym: '1431.T' },
  { code: '4765', name: 'SBIグローバルAMC', sym: '4765.T' },
  { code: '6558', name: 'クックビズ',       sym: '6558.T' },
  { code: '7672', name: 'ウチヤマHD',       sym: '7672.T' },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action') || 'market-data'
  const KEY    = Deno.env.get('FINNHUB_API_KEY') || ''
  const AV     = Deno.env.get('ALPHA_VANTAGE_KEY') || ''

  try {
    // ─── quote ────────────────────────────────────────────────
    if (action === 'quote') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const quote = await yhQuote(sym)
      return ok({ quote, symbol: sym, updated_at: new Date().toISOString() })
    }

    // ─── candles ──────────────────────────────────────────────
    if (action === 'candles') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const res = url.searchParams.get('resolution') || 'D'
      // Yahoo Finance interval/range mapping
      const map: Record<string, [string, string]> = {
        '1': ['1m',  '1d'],
        '5': ['5m',  '5d'],
        'D': ['1d',  '1y'],
        'W': ['1wk', '3y'],
        'M': ['1mo', '5y'],
      }
      const [interval, range] = map[res] ?? ['1d', '1y']
      const candles = await yhCandles(sym, interval, range)
      return ok({ candles, symbol: sym, resolution: res, updated_at: new Date().toISOString() })
    }

    // ─── news ─────────────────────────────────────────────────
    if (action === 'news') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const news = KEY ? await fhNews(sym, KEY) : []
      return ok({ news, symbol: sym })
    }

    // ─── boro-screen ──────────────────────────────────────────
    if (action === 'boro-screen') {
      const extra = url.searchParams.get('codes') || ''
      const list = [...BORO_DEFAULT]
      extra.split(',').filter(Boolean).forEach(c => {
        const code = c.trim()
        if (code && !list.find(s => s.code === code))
          list.push({ code, name: code, sym: `${code}.T` })
      })
      // Batch in groups of 5 to avoid overwhelming Yahoo
      const results: any[] = []
      for (let i = 0; i < list.length; i += 5) {
        const batch = list.slice(i, i + 5)
        const settled = await Promise.allSettled(
          batch.map(s => yhQuote(s.sym).then(q => ({ ...s, quote: q })))
        )
        settled.forEach(r => {
          if (r.status === 'fulfilled' && r.value.quote) results.push(r.value)
        })
      }
      return ok({ stocks: results, updated_at: new Date().toISOString() })
    }

    // ─── market-data (default) ────────────────────────────────
    const [nvdaRes, fxRes, vixRes] = await Promise.allSettled([
      yhQuote('NVDA'),
      yhQuote('USDJPY=X'),
      yhQuote('^VIX'),
    ])

    const nvda   = nvdaRes.status === 'fulfilled' ? nvdaRes.value   : null
    const usdJpy = fxRes.status   === 'fulfilled' ? fxRes.value     : null
    const vixQ   = vixRes.status  === 'fulfilled' ? vixRes.value    : null
    const vix    = vixQ ? { value: vixQ.price, prevClose: vixQ.prevClose, change: vixQ.change, changePercent: vixQ.changePercent } : null

    // Rename usdJpy.price → usdJpy.rate for backward compatibility
    const usdJpyOut = usdJpy ? { rate: usdJpy.price, change: usdJpy.change, changePercent: usdJpy.changePercent, high: usdJpy.high, low: usdJpy.low } : null

    // Alpha Vantage fallback only if Yahoo fails for NVDA
    let nvdaOut = nvda
    if (!nvdaOut && AV) {
      try {
        const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=NVDA&apikey=${AV}`)
        if (r.ok) {
          const d = await r.json()
          const q = d['Global Quote']
          if (q?.['05. price']) nvdaOut = { price: +q['05. price'], change: +q['09. change'], changePercent: +q['10. change percent'], high: +q['03. high'], low: +q['04. low'], open: +q['02. open'], prevClose: +q['08. previous close'], volume: null, currency: 'USD' }
        }
      } catch { /* silent */ }
    }

    return ok({ nvda: nvdaOut, usd_jpy: usdJpyOut, vix, updated_at: new Date().toISOString() })

  } catch (e) {
    return fail((e as Error).message)
  }
})
