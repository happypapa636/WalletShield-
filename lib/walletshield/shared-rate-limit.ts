import { sharedRateLimitConfig, requireSharedRateLimit } from "./config"

type SharedQuotaResult = {
  limited: boolean
  retryAfterSeconds: number
  source: "redis" | "memory"
}

const localBuckets = new Map<string, { count: number; resetAt: number }>()
let requestCount = 0

function cleanupBuckets(now: number) {
  requestCount += 1
  if (requestCount % 100 !== 0 && localBuckets.size < 5_000) return

  for (const [key, bucket] of localBuckets.entries()) {
    if (bucket.resetAt <= now) localBuckets.delete(key)
  }
}

function consumeLocalQuota(key: string, limit: number, windowMs: number): SharedQuotaResult {
  const now = Date.now()
  cleanupBuckets(now)
  const current = localBuckets.get(key)

  if (!current || current.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, retryAfterSeconds: Math.ceil(windowMs / 1000), source: "memory" }
  }

  if (current.count >= limit) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      source: "memory",
    }
  }

  current.count += 1
  return {
    limited: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    source: "memory",
  }
}

async function consumeRedisQuota(key: string, limit: number, windowMs: number): Promise<SharedQuotaResult> {
  const config = sharedRateLimitConfig()
  if (!config) throw new Error("Shared rate-limit store is not configured.")

  const windowKey = `walletshield:${key}:${Math.floor(Date.now() / windowMs)}`
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", windowKey],
      ["PEXPIRE", windowKey, String(windowMs), "NX"],
      ["PTTL", windowKey],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  })

  if (!response.ok) {
    throw new Error(`Shared rate-limit store failed with ${response.status}.`)
  }

  const payload = await response.json()
  const count = Number(payload?.[0]?.result)
  const ttl = Number(payload?.[2]?.result)
  if (!Number.isFinite(count)) throw new Error("Shared rate-limit store returned an invalid count.")

  const retryAfterSeconds = Number.isFinite(ttl) && ttl > 0
    ? Math.max(1, Math.ceil(ttl / 1000))
    : Math.ceil(windowMs / 1000)

  return {
    limited: count > limit,
    retryAfterSeconds,
    source: "redis",
  }
}

export async function consumeQuota(key: string, limit: number, windowMs: number): Promise<SharedQuotaResult> {
  const config = sharedRateLimitConfig()
  if (requireSharedRateLimit() && !config) {
    throw new Error("Shared rate-limit store is required but not configured.")
  }

  if (config) {
    try {
      return await consumeRedisQuota(key, limit, windowMs)
    } catch (error) {
      if (requireSharedRateLimit()) throw error
    }
  }

  return consumeLocalQuota(key, limit, windowMs)
}

export function resetLocalQuotaForTests() {
  localBuckets.clear()
  requestCount = 0
}
