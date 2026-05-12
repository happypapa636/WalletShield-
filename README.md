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
- **Wallet Health Score:** calculates an overall score from approval safety, scam exposure, wallet hygiene, and market context.
- **Approval Manager:** lists ERC-20, ERC-721, and ERC-1155 approvals and highlights unlimited or suspicious permissions.
- **Revoke Flow:** connected users can submit revoke transactions directly from the browser wallet.
- **Scam Token Detector:** checks token contracts for honeypot traits, proxy status, source verification, taxes, CEX/DEX listing signals, and holder count.
- **AI Threat Explanation:** uses OpenAI to translate security findings into plain English.
- **Recovery Center:** gives a step-by-step incident plan for suspicious approvals, drains, and exposed wallets.
- **Threat Intelligence:** uses SoSoValue market snapshots and news context to explain broader risk conditions.
- **Live Watch:** allows repeat scans during a session so users can keep an eye on changes.

## How It Works

1. The user connects MetaMask/Rabby or pastes an EVM wallet address.
2. The frontend sends the address and chain ID to `POST /api/scan`.
3. The backend reads native balance and transaction count through JSON-RPC.
4. GoPlus Security APIs check address reputation and token/NFT approvals.
5. SoSoValue APIs provide BTC/ETH market context and live crypto news when `SOSOVALUE_API_KEY` is configured.
6. WalletShield scores the wallet and creates prioritized risk items.
7. OpenAI Responses API generates a concise plain-English explanation when `OPENAI_API_KEY` is configured.
8. The UI shows the score, top risks, approvals, revoke actions, SoSoValue signals, token probe, assistant, and recovery steps.

## Supported Chains

- Ethereum
- BNB Smart Chain
- Polygon
- Arbitrum One
- Base

Approval scanning currently uses GoPlus-supported chains. Base is included for wallet/RPC scanning and roadmap readiness.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- GoPlus Security APIs
- SoSoValue OpenAPI
- OpenAI Responses API
- Browser EIP-1193 wallet provider
- Vercel deployment

## API Routes

### `POST /api/scan`

Scans a wallet and returns:

- wallet score
- category scores
- native balance
- transaction count
- risky approvals
- address reputation flags
- SoSoValue market/news signals
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
OPENAI_MODEL=gpt-5.5

ETHEREUM_RPC_URL=
BSC_RPC_URL=
POLYGON_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=
```

Only `SOSOVALUE_API_KEY` and `OPENAI_API_KEY` are required for the full demo. RPC variables are optional because the app includes public fallback RPC endpoints.

For Vercel, add the same variables in Project Settings -> Environment Variables before production deployment.

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
5. Open **Approval Manager** and show risky/unlimited approvals.
6. Use **Token Probe** with a known token contract or suspicious airdrop token.
7. Ask the AI assistant: “Why is this approval risky?”
8. End in **Recovery Center** to show what the user should do next.

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

- Deeper transaction forensics for wallet-drain timelines.
- Better drainer-pattern detection.
- More chains and richer approval support.
- Persistent scan history.
- Real-time monitoring jobs.
- Safer revoke UX with transaction simulation.
- Threat database for phishing dApps, scam contracts, and malicious token campaigns.

### Wave 3 - Full Wallet Protection Network

- Browser extension for pre-signature warnings.
- Wallet reputation engine.
- Community threat reports.
- Telegram/email/push alerts.
- AI phishing-site detector.
- Team and family wallet monitoring.
- Developer API for wallets and dApps to embed WalletShield checks.

## SoSoValue And SoDEX Fit

WalletShield uses SoSoValue as the market intelligence layer. Fast market moves often increase phishing, scam-airdrop, and panic-signing attempts. SoSoValue context helps WalletShield explain when risk is not only wallet-specific but also market-driven.

The project also aligns with SoDEX and ValueChain because secure self-custody and safer decentralized trading need a protective layer around users. WalletShield can become that layer as Wave 2 and Wave 3 add deeper monitoring and pre-signature protection.

## Security Notes

- Secrets are read only from environment variables.
- `.env.local` is ignored and excluded from Vercel upload.
- WalletShield never asks for seed phrases or private keys.
- Revoke actions are wallet-confirmed transactions.
- Scores are security guidance, not financial advice.
- If a wallet is actively compromised, use a clean device, stop signing, and move valuable assets to a fresh wallet before continuing.

## Verification Status

Latest local audit completed:

- TypeScript check: passing
- Production build: passing
- Dependency audit: no known vulnerabilities
- Wallet scan API: working
- Token risk API: working
- Assistant API: working
- Browser UI smoke test: working

## References

- SoSoValue API docs: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoDEX documentation: https://sodex.com/documentation
- OpenAI text generation docs: https://developers.openai.com/api/docs/guides/text
- GoPlus Security docs: https://docs.gopluslabs.io/docs/getting-started
