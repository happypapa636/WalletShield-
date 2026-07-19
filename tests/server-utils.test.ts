import { describe, expect, it } from "vitest"
import { formatNativeBalance, parseRpcQuantity } from "@/lib/walletshield/server"

describe("RPC quantity parsing", () => {
  it("formats native balances from valid hex quantities", () => {
    expect(formatNativeBalance("0xde0b6b3a7640000")).toBe("1")
    expect(formatNativeBalance("0x0")).toBe("0")
  })

  it("rejects invalid RPC quantities instead of throwing deep BigInt errors", () => {
    expect(() => formatNativeBalance("not-hex")).toThrow("Invalid RPC quantity")
    expect(() => parseRpcQuantity("0xzz")).toThrow("Invalid RPC quantity")
  })

  it("parses valid transaction counts", () => {
    expect(parseRpcQuantity("0x10")).toBe(16)
  })
})
