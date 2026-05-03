// Stok Market Data Edge Function
// Deploy: supabase functions deploy market-data

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY") ?? "";
const AV_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? "";
const JQUANTS_KEY = Deno.env.get("JQUANTS_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint") ?? "";
  const symbol = url.searchParams.get("symbol") ?? "";

  try {
    let data: unknown;

    switch (endpoint) {

      // ── 米国株 クォート（リアルタイム） ──
      case "us_quote": {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── 米国株 企業情報 ──
      case "us_profile": {
        const r = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── 米国株 キャンドルデータ（チャート用）──
      case "us_candles": {
        const resolution = url.searchParams.get("resolution") ?? "D";
        const from = url.searchParams.get("from") ?? Math.floor(Date.now()/1000 - 86400*30).toString();
        const to = url.searchParams.get("to") ?? Math.floor(Date.now()/1000).toString();
        const r = await fetch(
          `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── 為替レート（USD/JPY等）──
      case "forex": {
        const fromC = url.searchParams.get("from") ?? "USD";
        const toC = url.searchParams.get("to") ?? "JPY";
        const r = await fetch(
          `https://finnhub.io/api/v1/forex/rates?base=${fromC}&token=${FINNHUB_KEY}`
        );
        const json = await r.json() as { quote?: Record<string, number> };
        data = {
          rate: json?.quote?.[toC] ?? null,
          from: fromC,
          to: toC,
          timestamp: Date.now(),
        };
        break;
      }

      // ── マーケットニュース ──
      case "news": {
        const category = url.searchParams.get("category") ?? "general";
        const r = await fetch(
          `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_KEY}`
        );
        const articles = await r.json() as Array<{
          datetime: number; headline: string; summary: string; url: string; source: string;
        }>;
        // 最新10件のみ返す
        data = Array.isArray(articles) ? articles.slice(0, 10) : [];
        break;
      }

      // ── 企業ニュース（個別株）──
      case "company_news": {
        const from = url.searchParams.get("from") ?? new Date(Date.now() - 7*86400000).toISOString().split("T")[0];
        const to = url.searchParams.get("to") ?? new Date().toISOString().split("T")[0];
        const r = await fetch(
          `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
        );
        const articles = await r.json() as Array<unknown>;
        data = Array.isArray(articles) ? articles.slice(0, 8) : [];
        break;
      }

      // ── 推薦トレンド（Buy/Sell/Hold比率）──
      case "recommendation": {
        const r = await fetch(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_KEY}`
        );
        const arr = await r.json() as Array<unknown>;
        data = Array.isArray(arr) ? arr.slice(0, 3) : [];
        break;
      }

      // ── 決算サプライズ履歴 ──
      case "earnings": {
        const r = await fetch(
          `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&limit=4&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── テクニカル指標（RSI等）- Alpha Vantage ──
      case "rsi": {
        const interval = url.searchParams.get("interval") ?? "daily";
        const r = await fetch(
          `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=${interval}&time_period=14&series_type=close&apikey=${AV_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── 日本株 株価（J-Quants）── 
      case "jp_quote": {
        // J-Quants V2: 日足データ
        const r = await fetch(
          `https://api.jquants.com/v1/prices/daily_quotes?code=${symbol}`,
          {
            headers: {
              "Authorization": `Bearer ${JQUANTS_KEY}`,
            },
          }
        );
        const json = await r.json() as { daily_quotes?: unknown[] };
        // 最新データを返す
        const quotes = json?.daily_quotes ?? [];
        data = Array.isArray(quotes) ? quotes.slice(-5) : quotes;
        break;
      }

      // ── 日本株 財務情報（J-Quants）──
      case "jp_financial": {
        const r = await fetch(
          `https://api.jquants.com/v1/fins/statements?code=${symbol}`,
          {
            headers: {
              "Authorization": `Bearer ${JQUANTS_KEY}`,
            },
          }
        );
        const json = await r.json() as { statements?: unknown[] };
        const stmts = json?.statements ?? [];
        data = Array.isArray(stmts) ? stmts.slice(-4) : stmts;
        break;
      }

      // ── セクター別パフォーマンス（Finnhub）──
      case "sector_perf": {
        const r = await fetch(
          `https://finnhub.io/api/v1/us-sector-performance?token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── VIX（恐怖指数）──
      case "vix": {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=VIX&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      // ── 暗号資産 ──
      case "crypto": {
        const exchange = url.searchParams.get("exchange") ?? "BINANCE";
        const r = await fetch(
          `https://finnhub.io/api/v1/crypto/candle?symbol=${exchange}:${symbol}USDT&resolution=D&from=${Math.floor(Date.now()/1000-86400*30)}&to=${Math.floor(Date.now()/1000)}&token=${FINNHUB_KEY}`
        );
        data = await r.json();
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ ok: true, data, timestamp: Date.now() }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60", // 1分キャッシュ
        },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
