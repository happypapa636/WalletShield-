import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("assistant route", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("blocks pasted recovery secrets before model calls", async () => {
    const { POST } = await import("@/app/api/assistant/route")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "walletshield-test-secret",
        },
        body: JSON.stringify({
          question: "seed phrase: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        }),
      }),
    )

    await expect(response.json()).resolves.toMatchObject({ source: "WalletShield safety guard" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("labels empty OpenAI responses as local fallback answers", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    const { POST } = await import("@/app/api/assistant/route")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 })),
    )

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.11",
          "user-agent": "walletshield-test-fallback",
        },
        body: JSON.stringify({ question: "Why is this approval risky?" }),
      }),
    )

    await expect(response.json()).resolves.toMatchObject({ source: "WalletShield local assistant" })
  })
})
