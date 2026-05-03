# STOCK — 投資インテリジェンス

自分だけの投資インテリジェンスアプリ。セクターヒートマップ・個別株AI分析・投資信託スクリーナー・チャート分析・アノマリーカレンダーをひとつに。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JS（PWA対応） |
| バックエンド | Supabase Edge Functions（Deno） |
| データAPI | Finnhub（米国株・為替・ニュース）/ Alpha Vantage（テクニカル）/ J-Quants（日本株） |
| DB/キャッシュ | Supabase PostgreSQL |
| デプロイ | GitHub Actions → Supabase |

## セットアップ手順

### 1. 必要なAPIキーを取得

| API | 取得先 | 用途 |
|---|---|---|
| Finnhub | https://finnhub.io/ | 米国株リアルタイム・ニュース・為替 |
| Alpha Vantage | https://www.alphavantage.co/ | テクニカル指標（RSI等） |
| J-Quants | https://jpx-jquants.com/ | 日本株データ（JPX公式） |

### 2. Supabase Secretsに登録

Supabaseダッシュボード → Edge Functions → Secrets に以下を追加：

```
FINNHUB_API_KEY=your_key_here
ALPHA_VANTAGE_KEY=your_key_here
JQUANTS_API_KEY=your_key_here
```

### 3. GitHub Secretsに登録

GitHubリポジトリ → Settings → Secrets and variables → Actions に以下を追加：

```
SUPABASE_PROJECT_REF=your_project_ref  # SupabaseのProject ID（URLのhttps://supabase.com/dashboard/project/XXXXXX のXXXXXX部分）
SUPABASE_ACCESS_TOKEN=your_access_token  # https://supabase.com/dashboard/account/tokens で発行
FINNHUB_API_KEY=your_key_here
ALPHA_VANTAGE_KEY=your_key_here
JQUANTS_API_KEY=your_key_here
```

### 4. GitHubにpush → 自動デプロイ

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/stock-app.git
git push -u origin main
```

mainにpushするたびにGitHub ActionsがSupabase Edge Functionを自動デプロイします。

### 5. フロントエンドのSupabase URLを設定

`index.html` 内の以下を自分のSupabase URLに変更：

```javascript
const SUPABASE_URL = 'https://あなたのプロジェクトID.supabase.co';
const SUPABASE_ANON_KEY = 'あなたのanon_key';
```

## Edge Function API エンドポイント

```
GET /functions/v1/market-data?endpoint=us_quote&symbol=NVDA
GET /functions/v1/market-data?endpoint=forex&from=USD&to=JPY
GET /functions/v1/market-data?endpoint=news&category=general
GET /functions/v1/market-data?endpoint=jp_quote&symbol=8035
GET /functions/v1/market-data?endpoint=us_candles&symbol=AAPL&resolution=D
GET /functions/v1/market-data?endpoint=rsi&symbol=NVDA&interval=daily
GET /functions/v1/market-data?endpoint=vix
GET /functions/v1/market-data?endpoint=sector_perf
GET /functions/v1/market-data?endpoint=recommendation&symbol=TSLA
GET /functions/v1/market-data?endpoint=earnings&symbol=NVDA
GET /functions/v1/market-data?endpoint=jp_financial&symbol=8035
GET /functions/v1/market-data?endpoint=company_news&symbol=AAPL
```

## ファイル構成

```
stock-app/
├── index.html                          # メインアプリ（PWA対応）
├── manifest.json                       # PWAマニフェスト
├── sw.js                               # Service Worker
├── icon-192.svg / icon-512.svg         # アプリアイコン
├── supabase/
│   ├── config.toml                     # Supabase設定
│   └── functions/
│       └── market-data/
│           └── index.ts                # Edge Function本体
└── .github/
    └── workflows/
        └── deploy.yml                  # 自動デプロイ設定
```

## データフロー

```
スマホ/PC（index.html）
    ↓ fetch
Supabase Edge Function（market-data）
    ↓ APIキーを使って
Finnhub API  →  米国株・為替・ニュース
Alpha Vantage → テクニカル指標
J-Quants API  → 日本株データ
    ↓ レスポンス
index.html に表示（リアルタイム更新）
```

## 注意事項

- APIキーは絶対にコードに直書きしない（.envやSupabase Secretsで管理）
- J-Quants無料プランは12週間遅延。リアルタイムにはLightプラン（¥2,000/月）が必要
- Finnhub無料プランは60リクエスト/分まで
- Alpha Vantage無料プランは25リクエスト/日まで
