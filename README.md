# WalletShield AI

WalletShield AI is an AI-powered crypto wallet security and recovery assistant built for WaveHack. It helps users understand whether a wallet is safe, which approvals are dangerous, whether an unknown token is suspicious, and what to do after a risky signature or possible wallet drain.

It is designed to feel like a Web3 version of a security checkup: calm, readable, fast, and useful during the exact moment when a crypto user is worried something went wrong.

## What Problem It Solves

Crypto users often connect wallets to dApps, approve contracts, receive scam tokens, sign unfamiliar messages, or click fake airdrops. When something goes wrong, most tools show raw contract addresses and technical blockchain data without telling the user what happened or what to do next.

WalletShield AI turns that panic into a guided workflow:

```txt
Connect or paste wallet
-> scan wallet and approvals
-> explain the risk in plain English
-> revoke dangerous permissions
-> probe unknown tokens
-> follow recovery steps
-> scan again
```

The app never asks for seed phrases or private keys.

## Core Features

- **Wallet Security Scanner:** scans an EVM wallet for native balance, transaction count, address reputation, active approvals, and risk signals.
- **Wallet Health Score:** calculates an overall score from approval safety, scam exposure, wallet hygiene, SoSoValue market/threat context, and SoDEX trading-surface context, then returns the public formula with every scan.
- **Data Confidence:** marks scans as high, medium, or low confidence when RPC, GoPlus, SoSoValue, or SoDEX sources fail instead of treating missing data as clean.
- **Approval Manager:** lists ERC-20, ERC-721, and ERC-1155 approvals and highlights unlimited or suspicious permissions.
- **Safer Revoke Flow:** connected users can submit revoke transactions directly from the browser wallet after an `eth_call` simulation and gas estimate.
- **Scam Token Detector:** checks token contracts for honeypot traits, proxy status, source verification, taxes, CEX/DEX listing signals, and holder count.
- **AI Threat Explanation:** uses OpenAI to translate security findings into plain English.
- **Recovery Center:** gives a step-by-step incident plan for suspicious approvals, drains, and exposed wallets.
- **Threat Intelligence:** uses SoSoValue BTC/ETH snapshots, SSI index snapshots, live news, and scam-campaign searches to explain broader risk conditions.
- **Wave 3 Protection Radar:** adds SoSoValue macro calendar context, source-confidence warnings, and a browser-local multi-wallet watchlist that rescans user-supplied addresses through the real scan API.
- **SoDEX Context:** reads public SoDEX spot/perps market data and account API-key surface without asking for trading private keys or placing orders.
- **Live Watch And History:** allows repeat scans during a session and stores recent scan history locally in the browser.
- **China-Ready Runtime Configuration:** uses local packaged fonts, configurable OpenAI/SoSoValue/RPC endpoints, and configurable SoSoValue news language instead of relying on Google-hosted assets.

## How It Works

1. The user connects MetaMask/Rabby or pastes an EVM wallet address.
2. The frontend sends the address and chain ID to `POST /api/scan`.
3. The backend reads native balance and transaction count through JSON-RPC.
4. GoPlus Security APIs check address reputation and token/NFT approvals.
5. SoSoValue APIs provide BTC/ETH market context, SSI index context, macro calendar context, live news, and scam-campaign searches when `SOSOVALUE_API_KEY` is configured.
6. SoDEX public REST APIs provide read-only spot/perps execution context and scanned-wallet API-key surface checks.
7. WalletShield scores the wallet and returns the exact weighted formula, macro/market deductions, data-confidence warnings, and validation notes.
8. OpenAI Responses API generates a concise plain-English explanation when `OPENAI_API_KEY` is configured. The assistant receives a redacted scan digest, not the full raw report.
9. The UI shows the score, formula, top risks, approvals, simulated revoke actions, SoSoValue signals, macro events, SoDEX signals, Wave 3 radar/watchlist, token probe, assistant, history, forensics timeline, and recovery steps.

## Supported Chains

- Ethereum
- BNB Smart Chain
- Polygon
- Arbitrum One
- Base

Approval scanning currently uses GoPlus-supported EVM chains, including Base. When any approval feed is unavailable or degraded, WalletShield marks coverage clearly and scores approval safety conservatively.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- GoPlus Security APIs
- SoSoValue OpenAPI
- SoSoValue Indexes (SSI)
- SoSoValue Macro Calendar
- SoDEX public REST APIs
- OpenAI Responses API
- Browser EIP-1193 wallet provider
- Vercel deployment

## API Routes

### `POST /api/scan`

Scans a wallet and returns:

- wallet score
- category scores
- public score formula, weights, deductions, and validation notes
- native balance
- transaction count
- risky approvals
- address reputation flags
- SoSoValue market/news/SSI/campaign/macro signals
- SoDEX read-only market and account-key signals
- wallet-drain forensics timeline
- AI or local explanation
- recovery plan
- integration status

### `POST /api/token-risk`

Checks a token contract and returns:

- token name and symbol
- token risk score
- severity
- risk labels
- open-source/listing/tax/holder facts

### `POST /api/assistant`

Answers wallet safety questions using the latest scan report when available. It uses OpenAI if configured and a local fallback when not configured.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
SOSOVALUE_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
NEXT_PUBLIC_ENABLE_ANALYTICS=false

ETHEREUM_RPC_URL=
BSC_RPC_URL=
POLYGON_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=

ALLOW_PUBLIC_RPC_FALLBACKS=false
ETHEREUM_PUBLIC_RPC_FALLBACK_URL=
BSC_PUBLIC_RPC_FALLBACK_URL=
POLYGON_PUBLIC_RPC_FALLBACK_URL=
ARBITRUM_PUBLIC_RPC_FALLBACK_URL=
BASE_PUBLIC_RPC_FALLBACK_URL=

GOPLUS_BASE_URL=https://api.gopluslabs.io/api
SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
SOSOVALUE_NEWS_LANGUAGE=en
SOSOVALUE_TIMEOUT_MS=12000
SOSOVALUE_MAX_CALLS_PER_MINUTE=16
SOSOVALUE_INDEX_TICKERS=
SOSOVALUE_CAMPAIGN_KEYWORDS=
SODEX_REST_BASE_URL=https://mainnet-gw.sodex.dev/api/v1
SODEX_SPOT_ENDPOINT=
SODEX_PERPS_ENDPOINT=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT=false
```

For a full production deployment, configure `SOSOVALUE_API_KEY`, `OPENAI_API_KEY`, all primary RPC URLs, and provider endpoint URLs in the hosting environment. `OPENAI_MODEL` defaults to `gpt-5-mini` and can be changed without a code deploy. `OPENAI_BASE_URL` is configurable for region-specific OpenAI-compatible gateways. Public RPC fallbacks are now opt-in and environment-owned through `ALLOW_PUBLIC_RPC_FALLBACKS=true` plus the `*_PUBLIC_RPC_FALLBACK_URL` values; keep this disabled for production unless you explicitly accept public RPC reliability and privacy tradeoffs. Vercel Analytics is opt-in through `NEXT_PUBLIC_ENABLE_ANALYTICS=true`. The app never stores private keys or SoDEX signing secrets.

SoSoValue production notes:

- Official base URL: `https://openapi.sosovalue.com/openapi/v1`
- Authentication header: `x-soso-api-key`
- Documented quota: 100,000 requests/month and 20 requests/minute per API key
- WalletShield defaults `SOSOVALUE_MAX_CALLS_PER_MINUTE=16` to stay below the documented minute limit, keeps a cold scan to roughly 10 SoSoValue calls by default, and uses short server-side caches for repeated scans.
- Serverless production should configure `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` or Vercel KV `KV_REST_API_URL` / `KV_REST_API_TOKEN` for shared quota protection across instances. Set `WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT=true` if deployment must fail closed when the shared store is unavailable.
- `SOSOVALUE_NEWS_LANGUAGE` supports the documented SoSoValue news languages. Use `zh` for Simplified Chinese or `tc` for Traditional Chinese.
- `SOSOVALUE_INDEX_TICKERS` and `SOSOVALUE_CAMPAIGN_KEYWORDS` optionally pin the SSI indexes and scam narrative searches without code changes.

For Vercel, add the same variables in Project Settings -> Environment Variables before production deployment. Keep real values out of Git, README files, screenshots, issue comments, and demo recordings.

## Vercel Deployment

The project is designed for Vercel with the Next.js preset.

```bash
corepack pnpm build
vercel deploy --prod
```

`vercel.json` pins the pnpm install/build commands and sets longer API function durations for provider-heavy scan routes:

- `/api/scan`: 30 seconds
- `/api/token-risk`: 15 seconds
- `/api/assistant`: 15 seconds

Recommended production variables:

- `SOSOVALUE_API_KEY`
- `SOSOVALUE_NEWS_LANGUAGE`
- `SOSOVALUE_MAX_CALLS_PER_MINUTE`
- `SOSOVALUE_INDEX_TICKERS`
- `SOSOVALUE_CAMPAIGN_KEYWORDS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `GOPLUS_BASE_URL`
- `NEXT_PUBLIC_ENABLE_ANALYTICS`
- `ETHEREUM_RPC_URL`, `BSC_RPC_URL`, `POLYGON_RPC_URL`, `ARBITRUM_RPC_URL`, `BASE_RPC_URL`
- `SODEX_REST_BASE_URL`, `SODEX_SPOT_ENDPOINT`, `SODEX_PERPS_ENDPOINT`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or Vercel KV REST equivalents
- `WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT=true` for fail-closed production quota enforcement

After changing any Vercel environment variable, redeploy production so the serverless routes receive the new values.

## China-Ready Deployment Notes

The app has been adjusted so the frontend does not depend on Google-hosted fonts. It uses the local `geist` package fonts and system monospace fallbacks.

For China-facing deployment:

- Set `SOSOVALUE_NEWS_LANGUAGE=zh` for Simplified Chinese SoSoValue news content.
- Use region-accessible RPC endpoints for `ETHEREUM_RPC_URL`, `BSC_RPC_URL`, `POLYGON_RPC_URL`, `ARBITRUM_RPC_URL`, and `BASE_RPC_URL`.
- Set `GOPLUS_BASE_URL`, `SOSOVALUE_BASE_URL`, and SoDEX endpoint overrides if the deployment region needs approved regional gateways or mirrors.
- Set `OPENAI_BASE_URL` if your production environment reaches OpenAI through an approved regional gateway.
- Keep `NEXT_PUBLIC_ENABLE_ANALYTICS=false` unless Vercel Analytics is intentionally allowed for the deployment region.
- Configure shared Redis/KV rate limiting before high-traffic demos; in-memory fallback is local-process only.
- Verify SoSoValue, OpenAI, RPC, GoPlus, and SoDEX reachability from the hosting region before launch; WalletShield degrades safely when sources fail, but full functionality requires live upstream access.

## Local Development

```bash
corepack pnpm install
corepack pnpm dev
```

Open:

```txt
http://localhost:3000
```

Production check:

```bash
corepack pnpm verify
corepack pnpm exec next start -p 3100
```

## Demo Flow

1. Open WalletShield AI.
2. Connect a wallet or paste a wallet address.
3. Run **Scan Wallet**.
4. Show the security score and AI explanation.
5. Show **Score Formula** so reviewers can see the weighted methodology.
6. Open **Approval Manager** and show risky/unlimited approvals plus `eth_call` simulation and gas-estimate gating before revoke submission.
7. Open **Intel** and show SoSoValue campaign watch, SSI/market signals, macro events, SoDEX read-only context, and forensics timeline.
8. Open **Radar**, add a public wallet address to the local watchlist, and run **Scan All** to show real rescans.
9. Use **Token Probe** with a known token contract or suspicious airdrop token.
10. Ask the AI assistant: “Why is this approval risky?”
11. End in **Recovery Center** to show what the user should do next.

## WaveHack Roadmap

### Wave 1 - MVP Security Assistant

- Working wallet scanner.
- Live approval analysis.
- Wallet health score.
- Token risk probe.
- SoSoValue market/news context.
- OpenAI explanation assistant.
- Recovery checklist.
- Vercel deployment.

### Wave 2 - Functional Security Platform

Implemented for Wave 2:

- **Transparent score methodology:** every scan returns the weighted formula, category contributions, deductions, and false-positive/false-negative notes.
- **Deeper wallet-drain forensics:** risky approval timestamps, address-reputation hits, and SoSoValue campaign matches are turned into a review timeline.
- **Better drainer-pattern detection:** SoSoValue news search now watches wallet-drainer, phishing, fake-airdrop, and honeypot narratives, then shows them as contextual campaign intelligence and timeline evidence instead of treating global news as proof of wallet compromise.
- **SoSoValue made central:** BTC/ETH snapshots, SSI index snapshots, live news, and campaign search results now affect market/threat context instead of appearing as decorative copy.
- **SoDEX integration:** WalletShield calls SoDEX public spot/perps REST data and account API-key reads as read-only execution context. It does not request trading private keys or submit orders.
- **Persistent scan history:** recent scans are stored locally in the browser with a clear control and short expiry.
- **Real-time monitoring:** Live Watch re-runs scans during the session and keeps the latest report visible.
- **Safer revoke UX:** revokes run `eth_call` simulation and gas estimation before opening the wallet confirmation.
- **Production setup:** secrets stay in ignored env files, endpoint URLs are configurable, OpenAI model selection is environment-driven, unsupported chains fail clearly, API routes validate and rate-limit requests, and server errors avoid exposing raw upstream details.

### Wave 3 - Proactive Web Protection

Implemented for Wave 3:

- **Protection Radar:** new dashboard surface that combines source confidence, SoSoValue campaign matches, and SoSoValue macro calendar events.
- **SoSoValue macro calendar:** `GET /macro/events` is used as real context for volatility-driven phishing, fake liquidation messages, and panic-signing risk.
- **Macro-aware scoring:** near-window macro events add transparent market-context deductions without pretending they are wallet-specific compromise evidence.
- **Browser-local multi-wallet watchlist:** users add their own public wallet addresses, then rescan all watched wallets through `POST /api/scan`; no sample wallets or fake alerts are preloaded.
- **Rate-limit-aware SoSoValue client:** server-side SoSoValue calls normalize response wrappers, cache repeated reads, limit default cold-scan fanout, and use a conservative quota guard under the documented 20 requests/minute limit. Vercel/serverless deployments can use Upstash Redis or Vercel KV for shared quota enforcement across instances.
- **China-ready frontend runtime:** Google-hosted font dependencies were removed; OpenAI, GoPlus, SoSoValue, SoDEX, SoSoValue language, SoSoValue timeout, SoSoValue campaign/index tuning, and RPC URLs are environment-configurable.
- **Production hardening pass:** RPC public fallbacks are opt-in via environment, malformed RPC quantities degrade safely, assistant fallback source labels are accurate, browser storage failures do not break successful scans, unsupported wallet chains get clear UI warnings, API responses include request IDs, and focused Vitest coverage protects critical helpers/routes.
- **Reduced-motion and mobile polish:** root Framer Motion config honors reduced-motion preferences, dashboard inputs have visible focus rings, app colors use OKLCH tokens, broad `transition-all` usage was replaced with explicit transitions, and the global layout clips accidental horizontal overflow.

Remaining future infrastructure:

- Browser extension for pre-signature warnings.
- Cross-device/team wallet monitoring with authenticated accounts.
- Community threat reports and moderation workflow.
- Telegram/email/push notification channels.
- AI phishing-site detector for URLs before signing.
- Developer API for wallets and dApps to embed WalletShield checks.

## SoSoValue, SoSoValue Indexes, And SoDEX Fit

WalletShield uses SoSoValue as the market intelligence layer. Fast market moves and macro-event windows often increase phishing, scam-airdrop, fake liquidation, and panic-signing attempts. The scanner uses SoSoValue currency snapshots, SSI index snapshots, macro calendar events, live news, and keyword campaign search so wallet risk is evaluated against active market and scam narratives.

The project aligns with SoDEX and ValueChain by acting as a protective layer before users trade. WalletShield uses read-only SoDEX public market data and account API-key surface checks, while avoiding signed trading writes because those require EIP-712 signatures and private signing-key custody.

## Security Notes

- Secrets are read only from environment variables.
- `.env.local` and deployment env files are ignored and excluded from Vercel upload.
- WalletShield never asks for seed phrases or private keys.
- Assistant questions are checked locally for seed phrases, private keys, recovery phrases, and API secrets before any OpenAI request is made.
- API routes validate JSON bodies, cap body size, add no-store response headers, include request IDs, and apply per-client plus route-level caps.
- Rate limiting uses Upstash Redis or Vercel KV when configured, with local in-memory fallback for development/demo.
- SoSoValue calls use shared quota enforcement when configured and short-lived caches to respect the documented 20 requests/minute API-key limit.
- Production RPC reads require environment-provided primary RPC URLs unless public fallback mode is explicitly enabled and fallback URLs are provided.
- Assistant prompts use only a redacted scan digest with shortened addresses before calling OpenAI.
- OpenAI model and base URL selection are environment-driven; the code default is a replaceable low-latency model for demo reliability.
- Revoke actions are simulated with `eth_call`, gas-estimated, and then wallet-confirmed.
- Local scan history is stored in the browser only and expires after seven days.
- The Wave 3 protection watchlist is stored in the browser only and expires after thirty days.
- SoDEX is read-only in WalletShield; no order placement, no trading private-key entry, and no signed SoDEX write requests.
- Scores are security guidance, not financial advice.
- Scores can produce false positives or false negatives. The UI shows model-limit notes and data-confidence warnings with each scan.
- If a wallet is actively compromised, use a clean device, stop signing, and move valuable assets to a fresh wallet before continuing.

## Verification Status

Latest local audit for this final pass:

- Full verification script: passing with `corepack pnpm verify`
- TypeScript check: passing with `corepack pnpm lint`
- Unit/API helper tests: passing with `corepack pnpm test:run` (`6` test files, `16` tests)
- Dependency audit: no known vulnerabilities with `corepack pnpm audit --audit-level moderate`
- Production build: passing with `corepack pnpm build`
- Build warning from Next/Turbopack workspace-root inference: resolved
- Google-hosted font dependency: removed from production app code
- Homepage/API HTTP smoke test: passing (`/` returned 200 with WalletShield/Radar content; invalid scan returned 400; assistant safety guard returned 200; valid USDC token-risk probe returned 200)
- Positive wallet scan smoke test: passing (`/api/scan` returned 200 for a public Ethereum burn address with score, approvals, live GoPlus, partial SoSoValue, live SoDEX, live OpenAI, and safe RPC degradation when primary RPC env/fallback env are not configured)
- Wallet scan API: typechecked with score formula, SoSoValue/SSI/news/campaign/macro fields, SoDEX signals, and forensics fields
- Token risk API: typechecked and regression-tested for the UI `contractAddress` request contract plus invalid-payload rejection
- Assistant API: typechecked with OpenAI/local fallback behavior and configurable `OPENAI_BASE_URL`
- User-facing server failures remain sanitized so upstream implementation details are not exposed
- Production config tests verify that public RPC fallback URLs must be environment-provided and opt-in.

## References

- SoSoValue API docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoSoValue rate-limit docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc/rate-limit
- SoSoValue Index docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc/3.-sosovalue-index/index
- SoSoValue Macro docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc/8.-macro/macro
- SoSoValue Macro Events docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc/8.-macro/events
- SoDEX documentation: https://sodex.com/documentation
- OpenAI text generation docs: https://developers.openai.com/api/docs/guides/text
- GoPlus Security docs: https://docs.gopluslabs.io/docs/getting-started
