import type {
  ApprovalItem,
  ChainConfig,
  DataSourceStatus,
  MacroEvent,
  MarketSignal,
  RiskItem,
  Severity,
  ThreatCampaign,
  TokenRiskReport,
} from "./types"
import {
  DEFAULT_OPENAI_MODEL,
  GOPLUS_BASE_URL,
  OPENAI_BASE_URL,
  SODEX_PERPS_ENDPOINT,
  SODEX_SPOT_ENDPOINT,
  SOSO_BASE_URL,
  SOSO_INDEX_TICKERS,
  SOSO_MAX_CALLS_PER_MINUTE,
  SOSO_TIMEOUT_MS,
  getCampaignQueries,
  getRpcEndpoint,
} from "./config"
import { consumeQuota } from "./shared-rate-limit"

const SOSO_SUPPORTED_LANGUAGES = new Set(["en", "zh", "tc", "ja", "vi", "es", "pt", "ru", "tr", "fr"])
const SOSO_INDEX_METADATA: Record<string, { label: string; context: string }> = {
  ssimag7: { label: "MAG7.ssi", context: "large-cap crypto beta" },
  ssimeme: { label: "MEME.ssi", context: "meme-sector risk pulse" },
  ssidefi: { label: "DEFI.ssi", context: "DeFi-sector risk pulse" },
  ussi: { label: "USSI", context: "delta-neutral index stability" },
}

export function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

export function shortAddress(value?: string) {
  if (!value) return "unknown"
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function scoreLabel(score: number) {
  if (score >= 85) return "Protected"
  if (score >= 70) return "Watchful"
  if (score >= 50) return "Exposed"
  return "Emergency"
}

export function severityRank(severity: Severity) {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[severity]
}

export async function rpcCall<T>(
  chain: ChainConfig,
  method: string,
  params: unknown[],
) {
  const rpcUrl = getRpcEndpoint(chain).url
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} failed`)
  }

  return payload.result as T
}

export function formatNativeBalance(hexValue?: string) {
  if (!hexValue) return "0"
  if (!/^0x[0-9a-fA-F]+$/.test(hexValue)) throw new Error("Invalid RPC quantity.")
  const wei = BigInt(hexValue)
  const divisor = BigInt("1000000000000000000")
  const whole = wei / divisor
  const fraction = wei % divisor
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4)
  return `${whole.toString()}.${fractionText}`.replace(/\.?0+$/, "")
}

export function parseRpcQuantity(hexValue?: string) {
  if (!hexValue || !/^0x[0-9a-fA-F]+$/.test(hexValue)) throw new Error("Invalid RPC quantity.")
  return Number.parseInt(hexValue, 16)
}

async function getJson(url: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}`)
  }
  return response.json()
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
}

export function getOpenAiResponsesUrl() {
  return `${OPENAI_BASE_URL}/responses`
}

function getSosoLanguage() {
  const language = process.env.SOSOVALUE_NEWS_LANGUAGE?.trim().toLowerCase() || "en"
  return SOSO_SUPPORTED_LANGUAGES.has(language) ? language : "en"
}

function boolish(value: unknown) {
  return value === "1" || value === 1 || value === true
}

function buildApprovalRiskLabels(token: Record<string, any>, approval: Record<string, any>) {
  const labels: string[] = []
  const info = approval.address_info ?? {}
  const amount = String(approval.approved_amount ?? "")

  if (/unlimited/i.test(amount)) labels.push("Unlimited allowance")
  if (boolish(approval.approved_for_all)) labels.push("NFT operator approval")
  if (boolish(token.malicious_address)) labels.push("Token marked malicious")
  if (boolish(info.doubt_list)) labels.push("Spender on doubt list")
  if (boolish(info.malicious_address)) labels.push("Spender marked malicious")
  if (boolish(info.is_open_source) === false && info.is_open_source != null) {
    labels.push("Spender source not verified")
  }
  if (boolish(token.is_open_source) === false && token.is_open_source != null) {
    labels.push("Token source not verified")
  }
  if (Array.isArray(info.malicious_behavior) && info.malicious_behavior.length > 0) {
    labels.push(...info.malicious_behavior.map((item: string) => `Spender behavior: ${item}`))
  }
  if (Array.isArray(token.malicious_behavior) && token.malicious_behavior.length > 0) {
    labels.push(...token.malicious_behavior.map((item: string) => `Token behavior: ${item}`))
  }

  return Array.from(new Set(labels))
}

function approvalSeverity(labels: string[]): Severity {
  if (labels.some((label) => /malicious|doubt/i.test(label))) return "critical"
  if (labels.some((label) => /unlimited|operator/i.test(label))) return "high"
  if (labels.some((label) => /not verified/i.test(label))) return "medium"
  return "low"
}

function flattenApprovalResult(
  result: any,
  type: ApprovalItem["type"],
  chainId: string,
): ApprovalItem[] {
  if (!Array.isArray(result)) return []

  return result.flatMap((token: Record<string, any>) => {
    const list = Array.isArray(token.approved_list) ? token.approved_list : []
    const tokenAddress =
      token.token_address ?? token.nft_address ?? token.contract_address ?? ""
    const tokenName =
      token.token_name ?? token.nft_name ?? token.name ?? type.toUpperCase()
    const tokenSymbol =
      token.token_symbol ?? token.nft_symbol ?? token.symbol ?? type.toUpperCase()

    return list
      .filter((approval: Record<string, any>) => isAddress(String(approval.approved_contract ?? "")))
      .map((approval: Record<string, any>, index: number) => {
        const riskLabels = buildApprovalRiskLabels(token, approval)
        const severity = approvalSeverity(riskLabels)
        const info = approval.address_info ?? {}
        const spender = String(approval.approved_contract)
        const approvedForAll =
          type === "erc20" ? undefined : boolish(approval.approved_for_all)
        const approvedTokenId =
          approval.approved_token_id != null ? String(approval.approved_token_id) : undefined
        const approvedAmount =
          type === "erc20"
            ? String(approval.approved_amount ?? "Unknown")
            : approvedForAll
              ? "Approved for all"
              : approvedTokenId
                ? `Token #${approvedTokenId}`
                : "Single NFT approval"

        return {
          id: `${type}-${chainId}-${tokenAddress}-${spender}-${index}`,
          type,
          chainId,
          tokenAddress,
          tokenName,
          tokenSymbol,
          spenderAddress: spender,
          spenderName: info.contract_name || info.tag || shortAddress(spender),
          spenderTag: info.tag ?? undefined,
          approvedAmount,
          approvedForAll,
          approvedTokenId,
          approvedAt: Number(approval.approved_time ?? approval.initial_approval_time) || undefined,
          txHash: approval.hash ?? approval.initial_approval_hash ?? undefined,
          risky: severityRank(severity) >= severityRank("medium"),
          severity,
          riskLabels: riskLabels.length > 0 ? riskLabels : ["No explicit risk found"],
          source: "GoPlus Approval Security API",
        } satisfies ApprovalItem
      })
  })
}

export async function fetchApprovals(chainId: string, address: string) {
  if (!chainId) return { approvals: [], status: "error" as const, detail: "Missing chain id" }

  const endpoints: Array<[ApprovalItem["type"], string]> = [
    ["erc20", `${GOPLUS_BASE_URL}/v2/token_approval_security/${chainId}?addresses=${address}`],
    ["erc721", `${GOPLUS_BASE_URL}/v2/nft721_approval_security/${chainId}?addresses=${address}`],
    ["erc1155", `${GOPLUS_BASE_URL}/v2/nft1155_approval_security/${chainId}?addresses=${address}`],
  ]

  const settled = await Promise.allSettled(
    endpoints.map(async ([type, url]) => {
      const payload = await getJson(url)
      return flattenApprovalResult(payload.result, type, chainId)
    }),
  )

  const approvals = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []))
  const failed = settled.filter((item) => item.status === "rejected").length

  return {
    approvals,
    status: failed === endpoints.length ? ("error" as const) : ("live" as const),
    detail:
      failed === 0
        ? "ERC-20, ERC-721, and ERC-1155 approvals checked."
        : `${endpoints.length - failed}/${endpoints.length} approval feeds responded.`,
  }
}

const ADDRESS_FLAGS: Record<string, string> = {
  cybercrime: "Cybercrime exposure",
  money_laundering: "Money laundering exposure",
  number_of_malicious_contracts_created: "Created malicious contracts",
  gas_abuse: "Gas abuse behavior",
  financial_crime: "Financial-crime exposure",
  darkweb_transactions: "Darkweb transaction exposure",
  phishing_activities: "Phishing activity",
  blacklist_doubt: "Blacklist doubt",
  stealing_attack: "Stealing attack exposure",
  blackmail_activities: "Blackmail activity",
  sanctioned: "Sanctions exposure",
  malicious_mining_activities: "Malicious mining activity",
  mixer: "Mixer exposure",
  fake_token: "Fake-token exposure",
  honeypot_related_address: "Honeypot-related address",
}

export async function fetchAddressSecurity(chainId: string, address: string) {
  const payload = await getJson(
    `${GOPLUS_BASE_URL}/v1/address_security/${address}?chain_id=${chainId}`,
  )
  const result = payload.result ?? {}
  const flags = Object.entries(ADDRESS_FLAGS)
    .filter(([key]) => {
      const value = result[key]
      if (key === "number_of_malicious_contracts_created") return Number(value) > 0
      return boolish(value)
    })
    .map(([, label]) => label)

  return {
    flags,
    status: "live" as const,
    detail: "Address reputation checked against GoPlus malicious-address intelligence.",
  }
}

function stripHtml(value?: string) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function asList(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.list)) return value.list
  return []
}

function numberOrZero(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function formatUsd(value: unknown, maximumFractionDigits = 2) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return "Live"
  return `$${next.toLocaleString(undefined, { maximumFractionDigits })}`
}

function formatPercent(value: unknown, decimalRatio = false) {
  const next = Number(value)
  if (!Number.isFinite(next)) return undefined
  const normalized = decimalRatio ? next * 100 : next
  return `${normalized.toFixed(2)}% 24h`
}

function signalSeverity(changePct: number): Severity {
  const magnitude = Math.abs(changePct)
  if (magnitude >= 12) return "high"
  if (magnitude >= 5) return "medium"
  return "info"
}

function newsTitle(item: Record<string, any>) {
  return stripHtml(item.title).slice(0, 140) || "Crypto threat update"
}

function newsUrl(item: Record<string, any>) {
  return item.original_link || item.source_link
}

class SosoApiError extends Error {
  constructor(
    public kind: "unconfigured" | "rate_limited" | "error",
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

function isSosoApiError(error: unknown): error is SosoApiError {
  return error instanceof SosoApiError
}

const sosoCache = new Map<string, { expiresAt: number; data: unknown }>()

async function consumeSosoBudget() {
  const quota = await consumeQuota("sosovalue:api-key", SOSO_MAX_CALLS_PER_MINUTE, 60_000)
  if (quota.limited) {
    throw new SosoApiError(
      "rate_limited",
      `SoSoValue local quota guard reached ${SOSO_MAX_CALLS_PER_MINUTE} requests/minute.`,
      quota.retryAfterSeconds,
    )
  }
}

function readRetryAfter(response: Response, payload?: any) {
  const retryHeader = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryHeader) && retryHeader > 0) return retryHeader
  const retryDetail = Number(payload?.details?.retry_after)
  return Number.isFinite(retryDetail) && retryDetail > 0 ? retryDetail : undefined
}

function noteSosoRateHeaders(response: Response) {
  const remaining = Number(response.headers.get("x-ratelimit-remaining"))
  if (Number.isFinite(remaining) && remaining <= 0) return
}

async function sosoFetch<T = unknown>(path: string, options: { cacheTtlMs?: number } = {}) {
  const key = process.env.SOSOVALUE_API_KEY
  if (!key) throw new SosoApiError("unconfigured", "SOSOVALUE_API_KEY is not configured")

  const url = `${SOSO_BASE_URL}${path}`
  const cached = sosoCache.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.data as T

  await consumeSosoBudget()

  const response = await fetch(url, {
    headers: {
      "x-soso-api-key": key,
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(SOSO_TIMEOUT_MS),
  })
  noteSosoRateHeaders(response)

  let payload: any
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.status === 429) {
    throw new SosoApiError(
      "rate_limited",
      "SoSoValue rate limit exceeded.",
      readRetryAfter(response, payload),
    )
  }

  if (!response.ok) {
    throw new SosoApiError("error", `SoSoValue request failed with ${response.status}`)
  }

  if (payload && "code" in payload && payload.code !== 0 && payload.code !== "0") {
    const code = Number(payload.code)
    if (code === 429 || code === 42901) {
      throw new SosoApiError(
        "rate_limited",
        "SoSoValue rate limit exceeded.",
        readRetryAfter(response, payload),
      )
    }
    throw new SosoApiError("error", payload.message ?? "SoSoValue API request failed")
  }

  const data = payload && "data" in payload ? payload.data : payload
  if (options.cacheTtlMs && options.cacheTtlMs > 0) {
    sosoCache.set(url, { expiresAt: Date.now() + options.cacheTtlMs, data })
  }
  return data as T
}

type MarketSignalResult = {
  signals: MarketSignal[]
  campaigns: ThreatCampaign[]
  macroEvents: MacroEvent[]
  status: DataSourceStatus["status"]
  detail: string
}

let marketSignalCache: { expiresAt: number; result: MarketSignalResult } | null = null

async function fetchSosoCampaigns() {
  const queries = getCampaignQueries()
  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const result = await sosoFetch(
        `/news/search?keyword=${encodeURIComponent(query.keyword)}&page=1&page_size=3`,
        { cacheTtlMs: 5 * 60_000 },
      ) as Record<string, any>
      const list = asList(result)
      if (list.length === 0) return null

      const first = list[0] as Record<string, any>
      const total = numberOrZero(result?.total) || list.length
      return {
        id: `campaign-${query.slug}`,
        title: query.title,
        keyword: query.keyword,
        mentionCount: total,
        severity: query.severity,
        source: "SoSoValue News Search",
        detail: `${total} recent SoSoValue result${total === 1 ? "" : "s"} matched "${query.keyword}". Latest: ${newsTitle(first)}`,
        url: newsUrl(first),
      } satisfies ThreatCampaign
    }),
  )

  const campaigns: ThreatCampaign[] = []
  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) {
      campaigns.push(item.value)
    }
  }
  return {
    campaigns,
    failed: settled.filter((item) => item.status === "rejected").length,
    total: queries.length,
  }
}

async function fetchSosoIndexTargets() {
  const configured = SOSO_INDEX_TICKERS.map((ticker) => ticker.toLowerCase())
  try {
    const available = asList(await sosoFetch("/indices", { cacheTtlMs: 60_000 }))
      .map((ticker: unknown) => String(ticker).toLowerCase())
      .filter(Boolean)
    const preferred = configured.filter((ticker) => available.includes(ticker))
    const remaining = available.filter((ticker: string) => !preferred.includes(ticker))
    const selected = [...preferred, ...remaining].slice(0, 2)
    if (selected.length > 0) return selected.map(indexTarget)
  } catch (error) {
    if (isSosoApiError(error) && error.kind === "rate_limited") throw error
  }
  return configured.slice(0, 2).map(indexTarget)
}

function indexTarget(ticker: string) {
  const meta = SOSO_INDEX_METADATA[ticker]
  return {
    ticker,
    label: meta?.label ?? `${ticker.toUpperCase()}.ssi`,
    context: meta?.context ?? "SoSoValue index risk pulse",
  }
}

function macroSeverity(date: string): Severity {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const targetDate = new Date(`${date}T00:00:00Z`)
  const target = targetDate.getTime()
  if (!Number.isFinite(target)) return "info"
  const daysAway = Math.round((target - today) / 86_400_000)
  if (daysAway < 0) return "info"
  if (daysAway <= 1) return "medium"
  if (daysAway <= 7) return "low"
  return "info"
}

function macroDetail(date: string, eventName: string) {
  const severity = macroSeverity(date)
  if (severity === "medium") {
    return `${eventName} is scheduled near this scan window. Macro releases can increase volatility, urgency scams, fake liquidation messages, and panic-signing attempts.`
  }
  if (severity === "low") {
    return `${eventName} is scheduled this week. Keep signing decisions separated from market volatility and news-driven urgency.`
  }
  return `${eventName} is listed on the SoSoValue macro calendar. Use it as context, not wallet-specific evidence.`
}

async function fetchSosoMacroEvents() {
  const eventsByDate = asList(await sosoFetch("/macro/events", { cacheTtlMs: 60 * 60_000 })) as Array<{
    date?: string
    events?: unknown[]
  }>

  return eventsByDate
    .flatMap((item) => {
      const date = typeof item.date === "string" ? item.date : ""
      if (!date) return []
      return asList(item.events)
        .map((eventName: unknown) => String(eventName).trim())
        .filter(Boolean)
        .map((eventName: string) => ({
          id: `macro-${date}-${eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
          date,
          eventName,
          severity: macroSeverity(date),
          source: "SoSoValue Macro Calendar",
          detail: macroDetail(date, eventName),
        }) satisfies MacroEvent)
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
}

export async function fetchMarketSignals() {
  if (!process.env.SOSOVALUE_API_KEY) {
    return {
      signals: [
        {
          id: "soso-unconfigured",
          title: "SoSoValue intelligence waiting for key",
          value: "Env needed",
          severity: "info" as Severity,
          source: "SoSoValue",
          detail: "Add SOSOVALUE_API_KEY to unlock live market, news, and sentiment context.",
        },
      ],
      campaigns: [],
      macroEvents: [],
      status: "unconfigured" as const,
      detail: "SOSOVALUE_API_KEY not present in the server environment.",
    }
  }

  if (marketSignalCache && marketSignalCache.expiresAt > Date.now()) {
    return {
      ...marketSignalCache.result,
      detail: `${marketSignalCache.result.detail} Served from short-lived cache.`,
    }
  }

  try {
    const signals: MarketSignal[] = []
    const currencies = (await sosoFetch("/currencies", { cacheTtlMs: 5 * 60_000 })) as Array<{
      currency_id: string
      symbol: string
      name: string
    }>

    const targets = ["BTC", "ETH"]
    const matched = targets
      .map((symbol) => currencies.find((item) => item.symbol?.toUpperCase() === symbol))
      .filter(Boolean)
      .slice(0, 2) as Array<{ currency_id: string; symbol: string; name: string }>

    const indexTargets = await fetchSosoIndexTargets()

    const language = getSosoLanguage()
    const [snapshots, newsResult, indexResults, campaignResult, macroResult] = await Promise.all([
      Promise.allSettled(
        matched.map(async (currency) => {
          const snapshot = await sosoFetch(`/currencies/${currency.currency_id}/market-snapshot`, {
            cacheTtlMs: 30_000,
          })
          return { currency, snapshot: snapshot as Record<string, any> }
        }),
      ),
      sosoFetch(`/news?language=${encodeURIComponent(language)}&page=1&page_size=3`, {
        cacheTtlMs: 60_000,
      }).then(
        (news) => ({ status: "fulfilled" as const, news }),
        (error) => ({ status: "rejected" as const, error }),
      ),
      Promise.allSettled(
        indexTargets.map(async (index) => {
          const snapshot = await sosoFetch(`/indices/${index.ticker}/market-snapshot`, {
            cacheTtlMs: 30_000,
          })
          return { index, snapshot: snapshot as Record<string, any> }
        }),
      ),
      fetchSosoCampaigns(),
      fetchSosoMacroEvents().then(
        (macroEvents) => ({ status: "fulfilled" as const, macroEvents }),
        (error) => ({ status: "rejected" as const, error }),
      ),
    ])

    for (const item of snapshots) {
      if (item.status !== "fulfilled") continue
      const { currency, snapshot } = item.value
      const change = Number(snapshot.change_pct_24h ?? 0)
      const price = Number(snapshot.price ?? 0)
      signals.push({
        id: `market-${currency.symbol}`,
        title: `${currency.symbol} market context`,
        value: price ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "Live",
        change: formatPercent(change),
        severity: signalSeverity(change),
        source: "SoSoValue Market Snapshot",
        detail:
          Math.abs(change) >= 5
            ? "Sharp market moves can increase scam-airdrop and panic-signing attempts."
            : "Market snapshot is available for wallet-context risk scoring.",
      })
    }

    if (newsResult.status === "fulfilled") {
      const newsList = asList(newsResult.news)
      signals.push(
        ...newsList.slice(0, 3).map((item: Record<string, any>) => ({
          id: `news-${item.id}`,
          title: newsTitle(item),
          value: "News",
          severity: "info" as Severity,
          source: "SoSoValue News Feed",
          detail: stripHtml(item.content).slice(0, 180) || "Live crypto feed item.",
          url: newsUrl(item),
        })),
      )
    }

    for (const item of indexResults) {
      if (item.status !== "fulfilled") continue
      const { index, snapshot } = item.value
      const change = numberOrZero(snapshot["24h_change_pct"])
      const normalizedChange = Math.abs(change) <= 1 ? change * 100 : change
      signals.push({
        id: `soso-index-${index.ticker}`,
        title: `${index.label} index context`,
        value: formatUsd(snapshot.price, 4),
        change: formatPercent(change, Math.abs(change) <= 1),
        severity: signalSeverity(normalizedChange),
        source: "SoSoValue Index Snapshot",
        detail: `${index.label} tracks ${index.context}. This helps compare wallet-token exposure against sector-wide stress instead of isolated token noise.`,
      })
    }

    const campaigns = campaignResult.campaigns
    const macroEvents = macroResult.status === "fulfilled" ? macroResult.macroEvents : []
    const partialDetails: string[] = []

    const snapshotFailures = snapshots.filter((item) => item.status === "rejected").length
    const indexFailures = indexResults.filter((item) => item.status === "rejected").length
    if (snapshotFailures > 0) partialDetails.push(`${snapshotFailures} currency snapshot request${snapshotFailures === 1 ? "" : "s"} failed`)
    if (newsResult.status === "rejected") partialDetails.push("news feed failed")
    if (indexFailures > 0) partialDetails.push(`${indexFailures} SSI index snapshot request${indexFailures === 1 ? "" : "s"} failed`)
    if (campaignResult.failed > 0) partialDetails.push(`${campaignResult.failed}/${campaignResult.total} campaign search request${campaignResult.failed === 1 ? "" : "s"} failed`)
    if (macroResult.status === "rejected") partialDetails.push("macro calendar failed")

    if (signals.length === 0) {
      throw new Error("SoSoValue returned no usable market or news signals.")
    }

    const result = {
      signals,
      campaigns,
      macroEvents,
      status: partialDetails.length > 0 ? ("partial" as const) : ("live" as const),
      detail:
        partialDetails.length > 0
          ? `SoSoValue returned usable intelligence with partial coverage: ${partialDetails.join("; ")}.`
          : "BTC/ETH snapshots, SSI index snapshots, news, macro calendar, and scam-campaign searches loaded from SoSoValue.",
    }
    marketSignalCache = { expiresAt: Date.now() + 60_000, result }
    return result
  } catch (error) {
    const rateLimited = isSosoApiError(error) && error.kind === "rate_limited"
    const fallbackDetail = rateLimited
      ? `SoSoValue rate limit reached. WalletShield continued with wallet and security feeds${error.retryAfterSeconds ? `; retry after about ${error.retryAfterSeconds}s` : ""}.`
      : "The SoSoValue API request failed, so WalletShield continued with wallet and security feeds."
    return {
      signals: [
        {
          id: rateLimited ? "soso-rate-limited" : "soso-error",
          title: rateLimited ? "SoSoValue rate limit reached" : "SoSoValue intelligence temporarily unavailable",
          value: rateLimited ? "Quota guard" : "Retry later",
          severity: "info" as Severity,
          source: "SoSoValue",
          detail: fallbackDetail,
        },
      ],
      campaigns: [],
      macroEvents: [],
      status: rateLimited ? ("rate_limited" as const) : ("error" as const),
      detail: fallbackDetail,
    }
  }
}

type SodexSignalResult = {
  signals: MarketSignal[]
  status: "live" | "fallback" | "unconfigured" | "error"
  detail: string
}

let sodexSignalCache: { key: string; expiresAt: number; result: SodexSignalResult } | null = null

async function sodexFetch(endpoint: string) {
  const payload = await getJson(endpoint, { accept: "application/json" })
  if ("code" in payload && payload.code !== 0 && payload.code !== "0") {
    throw new Error(payload.error ?? "SoDEX request failed")
  }
  return "data" in payload ? payload.data : payload
}

function topByQuoteVolume(list: Array<Record<string, any>>, limit: number) {
  return [...list]
    .sort((a, b) => numberOrZero(b.quoteVolume) - numberOrZero(a.quoteVolume))
    .slice(0, limit)
}

export async function fetchSodexSignals(address?: string): Promise<SodexSignalResult> {
  const cacheKey = address?.toLowerCase() || "public"
  if (
    sodexSignalCache &&
    sodexSignalCache.key === cacheKey &&
    sodexSignalCache.expiresAt > Date.now()
  ) {
    return {
      ...sodexSignalCache.result,
      detail: `${sodexSignalCache.result.detail} Served from short-lived cache.`,
    }
  }

  try {
    const [spotResult, perpsResult, spotKeysResult, perpsKeysResult] = await Promise.allSettled([
      sodexFetch(`${SODEX_SPOT_ENDPOINT}/markets/tickers`),
      sodexFetch(`${SODEX_PERPS_ENDPOINT}/markets/tickers`),
      address
        ? sodexFetch(`${SODEX_SPOT_ENDPOINT}/accounts/${address}/api-keys`)
        : Promise.resolve([]),
      address
        ? sodexFetch(`${SODEX_PERPS_ENDPOINT}/accounts/${address}/api-keys`)
        : Promise.resolve([]),
    ])

    const spotTickers =
      spotResult.status === "fulfilled"
        ? (asList(spotResult.value) as Array<Record<string, any>>)
        : []
    const perpsTickers =
      perpsResult.status === "fulfilled"
        ? (asList(perpsResult.value) as Array<Record<string, any>>)
        : []

    const signals: MarketSignal[] = []

    if (spotTickers.length > 0) {
      const ssiMarkets = spotTickers.filter((ticker) =>
        /ssi|soso/i.test(String(ticker.symbol ?? "")),
      )
      const featured = topByQuoteVolume(ssiMarkets.length > 0 ? ssiMarkets : spotTickers, 3)
      const quoteVolume = featured.reduce((sum, ticker) => sum + numberOrZero(ticker.quoteVolume), 0)
      signals.push({
        id: "sodex-spot-ssi",
        title: "SoDEX spot execution context",
        value: `${featured.length} focus markets`,
        change: quoteVolume > 0 ? `${formatUsd(quoteVolume, 0)} 24h volume` : undefined,
        severity: "info",
        source: "SoDEX Public Spot API",
        detail: `Live public spot tickers are available for ${featured
          .map((ticker) => ticker.symbol)
          .join(", ")}. WalletShield uses this as read-only liquidity context before users trade or rebalance.`,
      })
    }

    if (perpsTickers.length > 0) {
      const majors = perpsTickers.filter((ticker) =>
        ["BTC-USD", "ETH-USD", "SOL-USD"].includes(String(ticker.symbol)),
      )
      const volatile = topByQuoteVolume(majors.length > 0 ? majors : perpsTickers, 3)
      const stressed = volatile.filter((ticker) => Math.abs(numberOrZero(ticker.changePct)) >= 5)
      signals.push({
        id: "sodex-perps-risk",
        title: "SoDEX perps risk pulse",
        value: `${perpsTickers.length} perps markets`,
        change:
          stressed.length > 0
            ? `${stressed.length} sharp mover${stressed.length === 1 ? "" : "s"}`
            : "No major stress",
        severity: stressed.length > 0 ? "medium" : "info",
        source: "SoDEX Public Perps API",
        detail:
          stressed.length > 0
            ? `Sharp moves in ${stressed.map((ticker) => ticker.symbol).join(", ")} can create urgency scams, fake liquidation messages, and panic-signing attempts.`
            : "Perps market data is reachable and does not show a major stress signal in the focus set.",
      })
    }

    if (address) {
      const spotKeys =
        spotKeysResult.status === "fulfilled"
          ? (asList(spotKeysResult.value) as Array<Record<string, any>>)
          : []
      const perpsKeys =
        perpsKeysResult.status === "fulfilled"
          ? (asList(perpsKeysResult.value) as Array<Record<string, any>>)
          : []
      const keyCount = spotKeys.length + perpsKeys.length
      const failedAccountReads =
        (spotKeysResult.status === "rejected" ? 1 : 0) +
        (perpsKeysResult.status === "rejected" ? 1 : 0)

      signals.push({
        id: "sodex-api-key-surface",
        title: "SoDEX signing-key surface",
        value:
          failedAccountReads === 2
            ? "Account read failed"
            : `${keyCount} registered key${keyCount === 1 ? "" : "s"}`,
        severity: keyCount > 0 ? "medium" : "low",
        source: "SoDEX Account API",
        detail:
          keyCount > 0
            ? "This wallet has registered SoDEX API keys. Rotate unused keys and keep the master wallet offline except for add/revoke key operations."
            : failedAccountReads > 0
              ? "SoDEX public market data loaded, but one account key read failed for this address."
              : "No registered SoDEX signing keys were returned for this wallet.",
        url: "https://sodex.com/documentation/trading-api/trading-api",
      })
    }

    if (signals.length === 0) {
      throw new Error("SoDEX returned no usable public ticker data.")
    }

    const result = {
      signals,
      status:
        spotResult.status === "fulfilled" || perpsResult.status === "fulfilled"
          ? ("live" as const)
          : ("error" as const),
      detail: address
        ? "Read-only SoDEX spot/perps market data and account signing-key surface loaded."
        : "Read-only SoDEX spot/perps public market data loaded.",
    }
    sodexSignalCache = { key: cacheKey, expiresAt: Date.now() + 60_000, result }
    return result
  } catch {
    const fallbackDetail =
      "SoDEX public market data failed, so WalletShield continued without execution-context signals."
    return {
      signals: [
        {
          id: "sodex-error",
          title: "SoDEX public market data unavailable",
          value: "Retry later",
          severity: "info" as Severity,
          source: "SoDEX Public API",
          detail: fallbackDetail,
        },
      ],
      status: "error" as const,
      detail: fallbackDetail,
    }
  }
}

export async function generateAiSummary(input: {
  score: number
  risks: RiskItem[]
  approvals: ApprovalItem[]
  marketSignals: MarketSignal[]
}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  try {
    const response = await fetch(getOpenAiResponsesUrl(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        reasoning: { effort: "low" },
        instructions:
          "You are WalletShield AI, a crypto wallet security assistant. Explain risk clearly, avoid fearmongering, and never ask for seed phrases or private keys. Keep output under 120 words. Use plain text with no Markdown.",
        input: `Wallet score: ${input.score}/100
Risks: ${input.risks.map((risk) => `${risk.severity}: ${risk.title}`).join("; ") || "none"}
Approvals: ${input.approvals
          .slice(0, 8)
          .map((approval) => `${approval.tokenSymbol} -> ${approval.spenderName}: ${approval.approvedAmount}`)
          .join("; ") || "none"}
Market signals: ${input.marketSignals
          .slice(0, 5)
          .map((signal) => `${signal.title}: ${signal.change ?? signal.value}`)
          .join("; ")}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) return null
    const payload = await response.json()
    return extractOpenAiText(payload)
  } catch {
    return null
  }
}

export function extractOpenAiText(payload: any) {
  if (typeof payload?.output_text === "string") return sanitizeAssistantText(payload.output_text)
  const text = payload?.output
    ?.flatMap((item: any) => item.content ?? [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
    ?.join("\n")
  return typeof text === "string" ? sanitizeAssistantText(text) : ""
}

function sanitizeAssistantText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function localSummary(score: number, risks: RiskItem[], approvals: ApprovalItem[]) {
  const critical = risks.filter((risk) => risk.severity === "critical").length
  const high = risks.filter((risk) => risk.severity === "high").length
  const highApprovals = approvals.filter((approval) => severityRank(approval.severity) >= severityRank("high")).length
  if (critical > 0) {
    const approvalNote =
      approvals.length > 0
        ? ` I also found ${approvals.length} open approval${approvals.length === 1 ? "" : "s"} to review.`
        : " No open approval surfaced in this scan."
    return `This wallet needs immediate attention. I found ${critical} critical signal${critical === 1 ? "" : "s"}.${approvalNote} Stop signing, review recent activity, and move valuable assets only after you understand the alert.`
  }
  if (highApprovals > 0) {
    return `The wallet is usable but exposed. The biggest issue is high-risk approval surface, especially unlimited allowances. Revoke anything you do not recognize and scan again.`
  }
  if (high > 0) {
    return "The wallet is usable but exposed. The main issue is a high-priority alert, such as degraded source coverage, address intelligence, approval exposure, or trading-surface context. Review the detailed alerts before signing again."
  }
  if (score >= 85) {
    return "The wallet looks healthy from the live checks available. Keep approvals short-lived, avoid unknown airdrops, and scan again after connecting to new dApps."
  }
  return "No emergency signal was found, but there is room to tighten wallet hygiene. Review approvals, check token contracts before interacting, and keep a recovery wallet ready."
}

export async function fetchTokenRisk(chainId: string, contractAddress: string): Promise<TokenRiskReport> {
  const payload = await getJson(
    `${GOPLUS_BASE_URL}/v1/token_security/${chainId}?contract_addresses=${contractAddress}`,
  )
  const result = payload.result?.[contractAddress.toLowerCase()] ?? payload.result?.[contractAddress]
  if (!result) throw new Error("Token was not found by GoPlus")

  const riskyFields: Record<string, string> = {
    is_honeypot: "Honeypot behavior",
    cannot_sell_all: "Cannot sell all",
    is_blacklisted: "Blacklist controls",
    is_whitelisted: "Whitelist controls",
    is_mintable: "Mintable supply",
    hidden_owner: "Hidden owner",
    can_take_back_ownership: "Ownership can be reclaimed",
    owner_change_balance: "Owner can change balances",
    selfdestruct: "Self-destruct function",
    external_call: "External-call risk",
    personal_slippage_modifiable: "Personal slippage can be modified",
    slippage_modifiable: "Slippage can be modified",
    transfer_pausable: "Transfers can be paused",
    trading_cooldown: "Trading cooldown controls",
    is_proxy: "Proxy contract",
  }

  const riskLabels = Object.entries(riskyFields)
    .filter(([key]) => boolish(result[key]))
    .map(([, label]) => label)

  if (boolish(result.trust_list)) riskLabels.unshift("Trusted token list")
  if (boolish(result.is_open_source) === false) riskLabels.push("Source not verified")

  const dangerCount = riskLabels.filter((label) => !/trusted/i.test(label)).length
  const score = clampScore(100 - dangerCount * 11 - (boolish(result.is_honeypot) ? 35 : 0))
  const severity: Severity =
    boolish(result.is_honeypot) || boolish(result.cannot_sell_all)
      ? "critical"
      : score < 60
      ? "high"
      : score < 78
      ? "medium"
      : "low"

  return {
    chainId,
    contractAddress,
    tokenName: result.token_name ?? "Unknown token",
    tokenSymbol: result.token_symbol ?? "TOKEN",
    score,
    severity,
    riskLabels: riskLabels.length ? Array.from(new Set(riskLabels)) : ["No explicit token risk found"],
    facts: [
      { label: "Open source", value: boolish(result.is_open_source) ? "Yes" : "No / unknown" },
      { label: "DEX listed", value: boolish(result.is_in_dex) ? "Yes" : "No / unknown" },
      { label: "CEX listed", value: boolish(result.is_in_cex?.listed) ? result.is_in_cex.cex_list?.join(", ") || "Yes" : "No / unknown" },
      { label: "Buy tax", value: result.buy_tax ? `${result.buy_tax}%` : "0 / unknown" },
      { label: "Sell tax", value: result.sell_tax ? `${result.sell_tax}%` : "0 / unknown" },
      { label: "Holder count", value: result.holder_count ?? "Unknown" },
    ],
    source: "GoPlus Token Security API",
  }
}

export function dataSource(name: string, status: DataSourceStatus["status"], detail: string) {
  return { name, status, detail } satisfies DataSourceStatus
}
