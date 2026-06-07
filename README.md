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
- **SoDEX Context:** reads public SoDEX spot/perps market data and account API-key surface without asking for trading private keys or placing orders.
- **Live Watch And History:** allows repeat scans during a session and stores recent scan history locally in the browser.

## How It Works

1. The user connects MetaMask/Rabby or pastes an EVM wallet address.
2. The frontend sends the address and chain ID to `POST /api/scan`.
3. The backend reads native balance and transaction count through JSON-RPC.
4. GoPlus Security APIs check address reputation and token/NFT approvals.
5. SoSoValue APIs provide BTC/ETH market context, SSI index context, live news, and scam-campaign searches when `SOSOVALUE_API_KEY` is configured.
6. SoDEX public REST APIs provide read-only spot/perps execution context and scanned-wallet API-key surface checks.
7. WalletShield scores the wallet and returns the exact weighted formula, deductions, and validation notes.
8. OpenAI Responses API generates a concise plain-English explanation when `OPENAI_API_KEY` is configured. The assistant receives a redacted scan digest, not the full raw report.
9. The UI shows the score, formula, top risks, approvals, simulated revoke actions, SoSoValue signals, SoDEX signals, token probe, assistant, history, forensics timeline, and recovery steps.

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
- SoSoValue market/news/SSI/campaign signals
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
NEXT_PUBLIC_ENABLE_ANALYTICS=false

ETHEREUM_RPC_URL=
BSC_RPC_URL=
POLYGON_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=

SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
SODEX_REST_BASE_URL=https://mainnet-gw.sodex.dev/api/v1
SODEX_SPOT_ENDPOINT=
SODEX_PERPS_ENDPOINT=
```

Only `SOSOVALUE_API_KEY` and `OPENAI_API_KEY` are required for the full demo. `OPENAI_MODEL` defaults to `gpt-5-mini` and can be changed from the environment without a code deploy. RPC and endpoint variables are optional because the app includes public fallback RPC and SoDEX endpoints. Vercel Analytics is opt-in through `NEXT_PUBLIC_ENABLE_ANALYTICS=true`. The app never stores private keys or SoDEX signing secrets.

For Vercel, add the same variables in Project Settings -> Environment Variables before production deployment. Keep real values out of Git, README files, screenshots, issue comments, and demo recordings.

## Vercel Deployment

The project is designed for Vercel with the Next.js preset.

```bash
corepack pnpm build
vercel deploy --prod
```

Recommended production variables:

- `SOSOVALUE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `NEXT_PUBLIC_ENABLE_ANALYTICS`
- optional RPC overrides for higher reliability
- optional SoDEX endpoint overrides if the public gateway changes

After changing any Vercel environment variable, redeploy production so the serverless routes receive the new values.

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
corepack pnpm lint
corepack pnpm audit --audit-level moderate
corepack pnpm build
corepack pnpm exec next start -p 3100
```

## Demo Flow

1. Open WalletShield AI.
2. Connect a wallet or paste a wallet address.
3. Run **Scan Wallet**.
4. Show the security score and AI explanation.
5. Show **Score Formula** so reviewers can see the weighted methodology.
6. Open **Approval Manager** and show risky/unlimited approvals plus `eth_call` simulation and gas-estimate gating before revoke submission.
7. Open **Intel** and show SoSoValue campaign watch, SSI/market signals, SoDEX read-only context, and forensics timeline.
8. Use **Token Probe** with a known token contract or suspicious airdrop token.
9. Ask the AI assistant: “Why is this approval risky?”
10. End in **Recovery Center** to show what the user should do next.

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

### Wave 3 - Full Wallet Protection Network

- Browser extension for pre-signature warnings.
- Wallet reputation engine.
- Community threat reports.
- Telegram/email/push alerts.
- AI phishing-site detector.
- Team and family wallet monitoring.
- Developer API for wallets and dApps to embed WalletShield checks.

## SoSoValue, SoSoValue Indexes, And SoDEX Fit

WalletShield uses SoSoValue as the market intelligence layer. Fast market moves often increase phishing, scam-airdrop, and panic-signing attempts. The Wave 2 scanner uses SoSoValue currency snapshots, SSI index snapshots, live news, and keyword campaign search so wallet risk is evaluated against active market and scam narratives.

The project aligns with SoDEX and ValueChain by acting as a protective layer before users trade. WalletShield uses read-only SoDEX public market data and account API-key surface checks, while avoiding signed trading writes because those require EIP-712 signatures and private signing-key custody.

## Security Notes

- Secrets are read only from environment variables.
- `.env.local` and deployment env files are ignored and excluded from Vercel upload.
- WalletShield never asks for seed phrases or private keys.
- Assistant questions are checked locally for seed phrases, private keys, recovery phrases, and API secrets before any OpenAI request is made.
- API routes validate JSON bodies, cap body size, add no-store response headers, and apply a lightweight per-client rate limit.
- API routes also include route-level global caps to reduce accidental quota burn during public demos.
- Assistant prompts use only a redacted scan digest with shortened addresses before calling OpenAI.
- OpenAI model selection is environment-driven; the code default is a replaceable low-latency model for demo reliability.
- Revoke actions are simulated with `eth_call`, gas-estimated, and then wallet-confirmed.
- Local scan history is stored in the browser only and expires after seven days.
- SoDEX is read-only in WalletShield; no order placement, no trading private-key entry, and no signed SoDEX write requests.
- Scores are security guidance, not financial advice.
- Scores can produce false positives or false negatives. The UI shows model-limit notes and data-confidence warnings with each scan.
- If a wallet is actively compromised, use a clean device, stop signing, and move valuable assets to a fresh wallet before continuing.

## Verification Status

Latest local audit completed:

- TypeScript check: passing
- Production build: passing
- Dependency audit: no known vulnerabilities
- Homepage HTTP smoke test: passing
- Wallet scan API: working with score formula, SoSoValue/SSI signals, SoSoValue campaign matches, SoDEX signals, and forensics fields
- Token risk API: working for valid tokens, invalid-address validation, and unsupported-chain validation
- Assistant API: working with OpenAI/local fallback behavior
- User-facing server failures are sanitized so upstream implementation details are not exposed

## References

- SoSoValue API docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoSoValue Indexes docs: https://sosovalue.gitbook.io/sosovalue-indices
- SoDEX documentation: https://sodex.com/documentation
- OpenAI text generation docs: https://developers.openai.com/api/docs/guides/text
- GoPlus Security docs: https://docs.gopluslabs.io/docs/getting-started
