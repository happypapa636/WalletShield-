import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

describe("token-risk route", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT
  })

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("accepts the UI contractAddress payload and returns normalized token risk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            result: {
              [usdcAddress.toLowerCase()]: {
                token_name: "USD Coin",
                token_symbol: "USDC",
                is_open_source: "1",
                is_in_dex: "1",
                is_in_cex: {
                  listed: "1",
                  cex_list: ["Coinbase"],
                },
                buy_tax: "0",
                sell_tax: "0",
                holder_count: "1000000",
              },
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const { POST } = await import("@/app/api/token-risk/route")
    const response = await POST(
      new Request("http://localhost/api/token-risk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.20",
          "user-agent": "walletshield-test-token-risk",
        },
        body: JSON.stringify({ chainId: "1", contractAddress: usdcAddress }),
      }),
    )

    await expect(response.json()).resolves.toMatchObject({
      contractAddress: usdcAddress,
      tokenName: "USD Coin",
      tokenSymbol: "USDC",
      severity: "low",
      source: "GoPlus Token Security API",
    })
  })

  it("rejects stale tokenAddress payloads before provider calls", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/token-risk/route")
    const response = await POST(
      new Request("http://localhost/api/token-risk", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.21",
          "user-agent": "walletshield-test-token-risk-stale-contract",
        },
        body: JSON.stringify({ chainId: "1", tokenAddress: usdcAddress }),
      }),
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
