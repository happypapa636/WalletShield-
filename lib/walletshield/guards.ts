import { NextResponse } from "next/server"
import { createHash, randomUUID } from "node:crypto"
import type { ZodSchema } from "zod"
import { consumeQuota } from "./shared-rate-limit"

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

export const apiHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
}

export function apiJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(apiHeaders)
  headers.set("x-walletshield-request-id", randomUUID())
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

function stableClientKey(request: Request) {
  return createHash("sha256").update(clientKey(request)).digest("hex").slice(0, 32)
}

export async function rateLimit(request: Request, route: RouteName) {
  const config = RATE_LIMITS[route]
  const globalConfig = GLOBAL_RATE_LIMITS[route]

  const globalBucket = await consumeQuota(
    `${route}:global`,
    globalConfig.limit,
    globalConfig.windowMs,
  )
  const clientBucket = await consumeQuota(
    `${route}:client:${stableClientKey(request)}`,
    config.limit,
    config.windowMs,
  )
  const limitedBucket = globalBucket.limited ? globalBucket : clientBucket.limited ? clientBucket : null

  if (limitedBucket) {
    return apiJson(
      { error: "Too many requests. Wait a moment, then try again." },
      {
        status: 429,
        headers: {
          "retry-after": String(limitedBucket.retryAfterSeconds),
          "x-walletshield-rate-limit-source": limitedBucket.source,
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
