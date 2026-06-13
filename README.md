# Stock Analyzer

India and US stock research scanner using current news and live quote snapshots.

## What it does

- Uses Zerodha live NSE quotes only for Indian stocks.
- Scans manually entered symbols like `TCS`, `RELIANCE`, or `INFY`.
- If no symbols are entered, scans Zerodha holdings and open positions.
- Produces a practical signal card with entry, stop-loss, target, exit rule, confidence, and trend/volume/risk scores.
- Labels agent ideas as `Intraday`, `Swing`, `Long Term`, `F&O`, or `No Trade`, with the intended holding period and visible reason.
- Reads publicly accessible article bodies when available, falls back to substantive RSS/Finnhub summaries, and labels headline-only evidence.
- Prevents headline-only sentiment from producing an actionable recommendation.
- Avoids hardcoded stocks, hardcoded news, invented credibility scores, and Alpha Vantage quota limits.

## Zerodha setup

Add these values in `.env`:

```bash
KITE_API_KEY=your_key
KITE_API_SECRET=your_secret
KITE_ACCESS_TOKEN=optional_daily_access_token
FINNHUB_API_KEY=optional_us_market_key
```

You can also connect through the Zerodha login route in the app if the API key and secret are present.

Zerodha access tokens expire at 6:00 AM India time on the next day. The app
validates the session against the profile API, clears expired cookies, and asks
you to reconnect instead of continuing with stale credentials.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy to AWS Amplify Hosting

The app is pinned to Next.js 15 because AWS Amplify Hosting currently supports
server-rendered Next.js applications through Next.js 15.

1. Push this repository and the `develop` branch to GitHub.
2. In the AWS Amplify console, choose **Create new app**, connect GitHub, select
   `Kittu2435/Stock-Analyzer`, and select the `develop` branch.
3. Keep the detected SSR build settings. The committed `amplify.yml` runs
   `npm ci`, creates the server runtime environment file, and runs the production
   build.
4. Add these environment variables in the Amplify app settings:

```bash
APP_URL=https://develop.example-id.amplifyapp.com
KITE_API_KEY=your_key
KITE_API_SECRET=your_secret
FINNHUB_API_KEY=your_key
```

Do not add `KITE_ACCESS_TOKEN` in cloud configuration. It expires daily and the
browser login flow stores the current token in a secure HTTP-only cookie.

5. Deploy and copy the final HTTPS domain, for example:

```text
https://develop.example-id.amplifyapp.com
```

6. In the Zerodha Kite Connect developer console, set the registered redirect
URL to:

```text
https://develop.example-id.amplifyapp.com/api/brokers/zerodha/callback
```

The protocol, domain, path, and deployment environment must match exactly.
Preview deployment domains should not be used as the permanent Zerodha callback.
`APP_URL` must contain the same Amplify domain without the callback path.

7. Open the production site and select `Connect Zerodha`.

The selected news market refreshes automatically every five minutes while the
app is open and visible. US trend responses are cached at the cloud edge for
five minutes to reduce Finnhub usage. A truly always-running background monitor
requires a scheduler and persistent database; serverless functions alone do not
retain monitoring state between runs.

## Notes

The India agent uses current RSS feeds from LiveMint, Economic Times, and Moneycontrol, then validates matched NSE stocks with Zerodha history and live quotes.

News publications do not receive manually invented credibility numbers. Picks are ordered using visible evidence: independent source count, article freshness, live quote decision, and quote confidence.

Article text extraction prefers publisher-provided structured `articleBody`
metadata and then semantic article paragraphs. It does not bypass paywalls or
publisher access controls. Full article text remains server-side; the UI shows
the extraction depth, analyzed word count, short source summary, and matched
financial evidence.

The US agent combines Finnhub market news with current company-specific stories from Moneycontrol Market Reports, CNBC Finance, and MarketWatch. RSS stories are mapped conservatively with the official SEC company ticker directory, and Finnhub validates matched symbols with current quote snapshots. It remains unavailable until `FINNHUB_API_KEY` is configured.

For India picks, the agent classifies recent headlines as positive, negative, mixed, or neutral by matching explicit financial events such as earnings beats/misses, order wins/cancellations, guidance changes, approvals, defaults, investigations, dividends, and debt reduction. The UI displays the matched evidence and positive/negative/neutral headline counts.

The India agent also requests roughly 120 calendar days of Zerodha daily candles and evaluates 20-session return, 60-session return, SMA20, SMA50, and 60-session maximum drawdown.

`Consider` requires positive sentiment, bullish history, and an actionable current quote. Negative news can only produce `Watch` when history remains bullish and the quote is not an avoid signal; otherwise it produces `Avoid`. Missing historical data cannot produce `Consider`.

Entry plans show both a pullback zone and breakout trigger, along with stop-loss, two targets, a no-chase level, and confirmation conditions. They are derived from the current quote snapshot and session OHLC, not historical backtesting.

This is a scanner, not an auto-trading bot. India F&O output is allowed only when Zerodha's current NFO instrument list confirms eligibility and sentiment, historical trend, quote confidence, and risk checks agree. US options eligibility is not inferred.
