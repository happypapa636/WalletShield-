import { NextResponse } from "next/server"
import type { ZodSchema } from "zod"

type RouteName = "scan" | "token-risk" | "assistant"

const RATE_LIMITS: Record<RouteName, { limit: number; windowMs: number }> = {
  scan: { limit: 20, windowMs: 60_000 },
  "token-risk": { limit: 30, windowMs: 60_000 },
  assistant: { limit: 15, windowMs: 60_000 },
}

const GLOBAL_RATE_LIMITS: Record<RouteName, { limit: number; windowMs: number }> = {
  scan: { limit: 120, windowMs: 60_000 },
  "token-risk": { limit: 180, windowMs: 60_000 },
  assistant: { limit: 90, windowMs: 60_000 },
}

const buckets = new Map<string, { count: number; resetAt: number }>()
let requestCount = 0

export const apiHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
}

export function apiJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(apiHeaders)
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function clientKey(request: Request) {
  const forwarded = (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")
  )?.split(",")[0]?.trim()
  const ip =
    forwarded ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  const userAgent = request.headers.get("user-agent")?.slice(0, 80) || "unknown"
  return `${ip}:${userAgent}`
}

function cleanupBuckets(now: number) {
  requestCount += 1
  if (requestCount % 100 !== 0 && buckets.size < 5_000) return

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

function consumeBucket(key: string, limit: number, windowMs: number, now: number) {
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  if (current.count >= limit) return current

  current.count += 1
  return null
}

export function rateLimit(request: Request, route: RouteName) {
  const config = RATE_LIMITS[route]
  const globalConfig = GLOBAL_RATE_LIMITS[route]
  const now = Date.now()
  cleanupBuckets(now)

  const globalBucket = consumeBucket(
    `${route}:global`,
    globalConfig.limit,
    globalConfig.windowMs,
    now,
  )
  const clientBucket = consumeBucket(
    `${route}:${clientKey(request)}`,
    config.limit,
    config.windowMs,
    now,
  )
  const limitedBucket = globalBucket ?? clientBucket

  if (limitedBucket) {
    const retryAfter = Math.max(1, Math.ceil((limitedBucket.resetAt - now) / 1000))
    return apiJson(
      { error: "Too many requests. Wait a moment, then try again." },
      {
        status: 429,
        headers: {
          "retry-after": String(retryAfter),
        },
      },
    )
  }

  return null
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>,
  options: { maxBytes: number },
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > options.maxBytes) {
    return {
      data: null,
      error: apiJson({ error: "Request body is too large." }, { status: 413 }),
    }
  }

  let payload: unknown
  try {
    const raw = await request.text()
    if (raw.length > options.maxBytes) {
      return {
        data: null,
        error: apiJson({ error: "Request body is too large." }, { status: 413 }),
      }
    }
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return {
      data: null,
      error: apiJson({ error: "Send a valid JSON request body." }, { status: 400 }),
    }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return {
      data: null,
      error: apiJson({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 }),
    }
  }

  return { data: parsed.data, error: null }
}
