const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } })

const fail = (msg: string, status = 500) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function fhQuote(sym: string, key: string) {
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`)
  if (!r.ok) return null
  const d = await r.json()
  if (!d.c || d.c === 0) return null
  return { price: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc }
}

async function fhCandles(sym: string, res: string, from: number, to: number, key: string) {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${res}&from=${from}&to=${to}&token=${key}`
  const r = await fetch(url)
  if (!r.ok) return null
  const d = await r.json()
  if (d.s !== 'ok' || !d.c?.length) return null
  return { c: d.c, h: d.h, l: d.l, o: d.o, t: d.t, v: d.v }
}

async function fhNews(sym: string, key: string) {
  const toDate = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const r = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${fromDate}&to=${toDate}&token=${key}`
  )
  if (!r.ok) return []
  const d = await r.json()
  return Array.isArray(d)
    ? d.slice(0, 6).map((n: any) => ({
        headline: n.headline,
        summary: n.summary,
        url: n.url,
        datetime: n.datetime,
        source: n.source,
        image: n.image || null,
      }))
    : []
}

// ボロ株デフォルトウォッチリスト（低位株・材料株として知られる銘柄）
const BORO_DEFAULT = [
  { code: '9424', name: '日本通信', sym: '9424.T' },
  { code: '2160', name: 'ジーエヌアイグループ', sym: '2160.T' },
  { code: '3825', name: 'レミックスポイント', sym: '3825.T' },
  { code: '4344', name: 'ソースネクスト', sym: '4344.T' },
  { code: '2370', name: 'メディネット', sym: '2370.T' },
  { code: '9603', name: 'エイチ・アイ・エス', sym: '9603.T' },
  { code: '3765', name: 'ガンホー・オンライン', sym: '3765.T' },
  { code: '4765', name: 'SBIグローバルAMC', sym: '4765.T' },
  { code: '4477', name: 'BASE', sym: '4477.T' },
  { code: '6050', name: 'イー・ガーディアン', sym: '6050.T' },
  { code: '3778', name: 'さくらインターネット', sym: '3778.T' },
  { code: '7177', name: 'GMOフィナンシャルHD', sym: '7177.T' },
  { code: '3543', name: 'コメダHD', sym: '3543.T' },
  { code: '1431', name: 'Lib Work', sym: '1431.T' },
  { code: '6558', name: 'クックビズ', sym: '6558.T' },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'market-data'
  const KEY = Deno.env.get('FINNHUB_API_KEY') || ''
  const AV = Deno.env.get('ALPHA_VANTAGE_KEY') || ''

  if (!KEY) return fail('FINNHUB_API_KEY not set')

  try {
    // ─── /quote ───────────────────────────────────────────────
    if (action === 'quote') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const quote = await fhQuote(sym, KEY)
      return ok({ quote, symbol: sym, updated_at: new Date().toISOString() })
    }

    // ─── /candles ─────────────────────────────────────────────
    if (action === 'candles') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const res = url.searchParams.get('resolution') || 'D'
      const now = Math.floor(Date.now() / 1000)
      const spans: Record<string, number> = {
        '1':  86400,
        '5':  86400 * 5,
        'D':  86400 * 365,
        'W':  86400 * 365 * 3,
        'M':  86400 * 365 * 5,
      }
      const span = spans[res] ?? 86400 * 365
      const candles = await fhCandles(sym, res, now - span, now, KEY)
      return ok({ candles, symbol: sym, resolution: res, updated_at: new Date().toISOString() })
    }

    // ─── /news ────────────────────────────────────────────────
    if (action === 'news') {
      const sym = url.searchParams.get('symbol') || 'NVDA'
      const news = await fhNews(sym, KEY)
      return ok({ news, symbol: sym })
    }

    // ─── /boro-screen ─────────────────────────────────────────
    if (action === 'boro-screen') {
      const extra = url.searchParams.get('codes') || ''
      const list = [...BORO_DEFAULT]
      extra.split(',').filter(Boolean).forEach(c => {
        const code = c.trim()
        if (code && !list.find(s => s.code === code)) {
          list.push({ code, name: code, sym: `${code}.T` })
        }
      })

      const results = await Promise.allSettled(
        list.map(s => fhQuote(s.sym, KEY).then(q => ({ ...s, quote: q })))
      )
      const stocks = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .filter(s => s.quote !== null)

      return ok({ stocks, updated_at: new Date().toISOString() })
    }

    // ─── market-data (default) ────────────────────────────────
    const [nvdaRes, fxRes, vixRes] = await Promise.allSettled([
      fetch(`https://finnhub.io/api/v1/quote?symbol=NVDA&token=${KEY}`),
      fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:USD_JPY&token=${KEY}`),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
    ])

    let nvda = null, usdJpy = null, vix = null

    if (nvdaRes.status === 'fulfilled' && nvdaRes.value.ok) {
      const d = await nvdaRes.value.json()
      if (d.c && d.c !== 0)
        nvda = { price: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc }
    }
    if (fxRes.status === 'fulfilled' && fxRes.value.ok) {
      const d = await fxRes.value.json()
      if (d.c && d.c !== 0)
        usdJpy = { rate: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l }
    }
    if (vixRes.status === 'fulfilled' && vixRes.value.ok) {
      const d = await vixRes.value.json()
      const meta = d?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice) {
        const price = meta.regularMarketPrice
        const prev = meta.chartPreviousClose ?? null
        vix = {
          value: price, prevClose: prev,
          change: prev ? +(price - prev).toFixed(2) : null,
          changePercent: prev ? +((price - prev) / prev * 100).toFixed(2) : null,
        }
      }
    }

    // Alpha Vantage fallbacks
    if (!nvda && AV) {
      try {
        const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=NVDA&apikey=${AV}`)
        if (r.ok) {
          const d = await r.json()
          const q = d['Global Quote']
          if (q?.['05. price'])
            nvda = { price: +q['05. price'], change: +q['09. change'], changePercent: +q['10. change percent'],
              high: +q['03. high'], low: +q['04. low'], open: +q['02. open'], prevClose: +q['08. previous close'] }
        }
      } catch { /* silent */ }
    }
    if (!usdJpy && AV) {
      try {
        const r = await fetch(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=JPY&apikey=${AV}`)
        if (r.ok) {
          const d = await r.json()
          const rate = d?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate']
          if (rate) usdJpy = { rate: +rate, change: null, changePercent: null, high: null, low: null }
        }
      } catch { /* silent */ }
    }

    return ok({ nvda, usd_jpy: usdJpy, vix, updated_at: new Date().toISOString() })

  } catch (e) {
    return fail((e as Error).message)
  }
})
