import { beforeEach, describe, expect, it } from "vitest"
import { consumeQuota, resetLocalQuotaForTests } from "@/lib/walletshield/shared-rate-limit"

describe("local quota fallback", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT
    resetLocalQuotaForTests()
  })

  it("limits after the configured threshold", async () => {
    await expect(consumeQuota("test-route", 2, 60_000)).resolves.toMatchObject({ limited: false, source: "memory" })
    await expect(consumeQuota("test-route", 2, 60_000)).resolves.toMatchObject({ limited: false, source: "memory" })
    await expect(consumeQuota("test-route", 2, 60_000)).resolves.toMatchObject({ limited: true, source: "memory" })
  })

  it("fails closed when shared rate limiting is required but not configured", async () => {
    process.env.WALLETSHIELD_REQUIRE_SHARED_RATE_LIMIT = "true"
    await expect(consumeQuota("test-route", 2, 60_000)).rejects.toThrow("Shared rate-limit store is required")
  })
})
