import { describe, expect, it } from "vitest"
import { revokeCalldata } from "@/lib/walletshield/revoke"

const spender = "0x1111111111111111111111111111111111111111"

describe("revokeCalldata", () => {
  it("builds ERC-20 approve(spender, 0) calldata", () => {
    expect(
      revokeCalldata({
        type: "erc20",
        spenderAddress: spender,
      }),
    ).toBe(`0x095ea7b3${"1".repeat(40).padStart(64, "0")}${"0".repeat(64)}`)
  })

  it("builds ERC-721 approve(address(0), tokenId) calldata for single-token approvals", () => {
    expect(
      revokeCalldata({
        type: "erc721",
        spenderAddress: spender,
        approvedForAll: false,
        approvedTokenId: "123",
      }),
    ).toBe(`0x095ea7b3${"0".repeat(64)}${BigInt(123).toString(16).padStart(64, "0")}`)
  })

  it("builds ERC-1155 setApprovalForAll(spender, false) calldata", () => {
    expect(
      revokeCalldata({
        type: "erc1155",
        spenderAddress: spender,
      }),
    ).toBe(`0xa22cb465${"1".repeat(40).padStart(64, "0")}${"0".repeat(64)}`)
  })

  it("rejects malformed spender addresses", () => {
    expect(() =>
      revokeCalldata({
        type: "erc20",
        spenderAddress: "0xnot-valid",
      }),
    ).toThrow("Invalid approval address")
  })
})
