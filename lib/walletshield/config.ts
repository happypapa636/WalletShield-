import type { ChainConfig, Severity } from "./types"

const DEFAULT_CAMPAIGN_KEYWORDS = ["wallet drainer", "phishing"]

export function envValue(name: string) {
  return process.env[name]?.trim() || ""
}

export function envOrDefault(name: string, fallback: string) {
  return envValue(name) || fallback
}

export function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function envList(name: string, fallback: string[] = []) {
  const raw = envValue(name)
  if (!raw) return fallback
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "")
}

export function booleanEnv(name: string) {
  const value = envValue(name).toLowerCase()
  if (value === "true" || value === "1" || value === "yes") return true
  if (value === "false" || value === "0" || value === "no") return false
  return undefined
}

export function isVercelProduction() {
  return process.env.VERCEL_ENV === "production"
}

export function allowPublicRpcFallbacks() {
  const configured = booleanEnv("ALLOW_PUBLIC_RPC_FALLBACKS")
  if (configured !== undefined) return configured
  return !isVercelProduction()
}

export function getRpcEndpoint(chain: ChainConfig) {
  const configured = envValue(chain.rpcEnv)
  if (configured) return { url: configured, source: "env" as const }

  const fallback = envValue(chain.fallbackRpcEnv)
  if (allowPublicRpcFallbacks()) {
    if (fallback) return { url: fallback, source: "public-fallback" as const }
    throw new Error(`${chain.rpcEnv} or ${chain.fallbackRpcEnv} is required for local RPC fallback mode.`)
  }

  throw new Error(`${chain.rpcEnv} is required when public RPC fallbacks are disabled.`)
}

export const GOPLUS_BASE_URL = trimTrailingSlash(
  envOrDefault("GOPLUS_BASE_URL", "https://api.gopluslabs.io/api"),
)

export const SOSO_BASE_URL = trimTrailingSlash(
  envOrDefault("SOSOVALUE_BASE_URL", "https://openapi.sosovalue.com/openapi/v1"),
)

export const OPENAI_BASE_URL = trimTrailingSlash(
  envOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
)

export const SODEX_REST_BASE_URL = trimTrailingSlash(
  envOrDefault("SODEX_REST_BASE_URL", "https://mainnet-gw.sodex.dev/api/v1"),
)

export const SODEX_SPOT_ENDPOINT = envOrDefault(
  "SODEX_SPOT_ENDPOINT",
  `${SODEX_REST_BASE_URL}/spot`,
)

export const SODEX_PERPS_ENDPOINT = envOrDefault(
  "SODEX_PERPS_ENDPOINT",
  `${SODEX_REST_BASE_URL}/perps`,
)

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini"
export const SOSO_TIMEOUT_MS = envNumber("SOSOVALUE_TIMEOUT_MS", 12_000, 3_000, 30_000)
export const SOSO_MAX_CALLS_PER_MINUTE = envNumber("SOSOVALUE_MAX_CALLS_PER_MINUTE", 16, 1, 18)
export const SOSO_INDEX_TICKERS = envList("SOSOVALUE_INDEX_TICKERS")

export function getCampaignQueries() {
  return envList("SOSOVALUE_CAMPAIGN_KEYWORDS", DEFAULT_CAMPAIGN_KEYWORDS).map((keyword) => {
    const normalized = keyword.toLowerCase()
    const severity: Severity =
      normalized.includes("drainer") || normalized.includes("phishing") ? "high" : "medium"
    return {
      slug: normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign",
      keyword,
      title: `${keyword
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")} campaign`,
      severity,
    }
  })
}

export function sharedRateLimitConfig() {
  const url = envValue("UPSTASH_REDIS_REST_URL") || envValue("KV_REST_API_URL")
  const token = envValue("UPSTASH_REDIS_REST_TOKEN") || envValue("KV_REST_API_TOKEN")
  if (!url || !token) return null
  return {
    url: trimTrailingSlash(url),
    token,
  }
}

export function requireSharedRateLimit() {
  return booleanEnv("WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT") === true
}
