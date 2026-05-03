const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY')
    const AV_KEY = Deno.env.get('ALPHA_VANTAGE_KEY')

    if (!FINNHUB_KEY) {
      return new Response(
        JSON.stringify({ error: 'FINNHUB_API_KEY is not set in Supabase Secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const [nvdaResult, forexResult, vixResult] = await Promise.allSettled([
      fetch(`https://finnhub.io/api/v1/quote?symbol=NVDA&token=${FINNHUB_KEY}`),
      fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:USD_JPY&token=${FINNHUB_KEY}`),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketDataBot/1.0)' },
      }),
    ])

    let nvda = null, usdJpy = null, vix = null

    if (nvdaResult.status === 'fulfilled' && nvdaResult.value.ok) {
      const d = await nvdaResult.value.json()
      if (d.c && d.c !== 0) nvda = { price: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc }
    }

    if (forexResult.status === 'fulfilled' && forexResult.value.ok) {
      const d = await forexResult.value.json()
      if (d.c && d.c !== 0) usdJpy = { rate: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l, prevClose: d.pc }
    }

    if (vixResult.status === 'fulfilled' && vixResult.value.ok) {
      const d = await vixResult.value.json()
      const meta = d?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice) {
        const price = meta.regularMarketPrice
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null
        vix = { value: price, prevClose, change: prevClose !== null ? +(price - prevClose).toFixed(2) : null, changePercent: prevClose !== null ? +((((price - prevClose) / prevClose) * 100).toFixed(2)) : null }
      }
    }

    if (!nvda && AV_KEY) {
      try {
        const avRes = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=NVDA&apikey=${AV_KEY}`)
        if (avRes.ok) {
          const d = await avRes.json()
          const q = d['Global Quote']
          if (q?.['05. price']) nvda = { price: parseFloat(q['05. price']), change: parseFloat(q['09. change']), changePercent: parseFloat(q['10. change percent']), high: parseFloat(q['03. high']), low: parseFloat(q['04. low']), open: parseFloat(q['02. open']), prevClose: parseFloat(q['08. previous close']) }
        }
      } catch {}
    }

    if (!usdJpy && AV_KEY) {
      try {
        const avRes = await fetch(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=JPY&apikey=${AV_KEY}`)
        if (avRes.ok) {
          const d = await avRes.json()
          const rate = d?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate']
          if (rate) usdJpy = { rate: parseFloat(rate), change: null, changePercent: null, high: null, low: null, prevClose: null }
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({ nvda, usd_jpy: usdJpy, vix, updated_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
