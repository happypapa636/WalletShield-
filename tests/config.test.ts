import { afterEach, describe, expect, it } from "vitest"
import { CHAINS } from "@/lib/walletshield/chains"
import { getRpcEndpoint } from "@/lib/walletshield/config"

const chain = CHAINS["1"]

describe("RPC endpoint configuration", () => {
  afterEach(() => {
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_PUBLIC_RPC_FALLBACKS
    delete process.env.ETHEREUM_RPC_URL
    delete process.env.ETHEREUM_PUBLIC_RPC_FALLBACK_URL
  })

  it("requires primary RPC configuration in production by default", () => {
    process.env.VERCEL_ENV = "production"
    expect(() => getRpcEndpoint(chain)).toThrow("ETHEREUM_RPC_URL is required")
  })

  it("uses explicit fallback URLs only when fallback mode is enabled", () => {
    process.env.ALLOW_PUBLIC_RPC_FALLBACKS = "true"
    process.env.ETHEREUM_PUBLIC_RPC_FALLBACK_URL = "https://rpc.example"
    expect(getRpcEndpoint(chain)).toEqual({ url: "https://rpc.example", source: "public-fallback" })
  })

  it("prefers the primary RPC URL when both values are present", () => {
    process.env.ALLOW_PUBLIC_RPC_FALLBACKS = "true"
    process.env.ETHEREUM_RPC_URL = "https://primary.example"
    process.env.ETHEREUM_PUBLIC_RPC_FALLBACK_URL = "https://fallback.example"
    expect(getRpcEndpoint(chain)).toEqual({ url: "https://primary.example", source: "env" })
  })
})
