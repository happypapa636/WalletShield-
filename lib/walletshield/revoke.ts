import type { ApprovalItem } from "./types"

export function encodeAddress(address: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Invalid approval address.")
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

export function encodeUint256(value: string) {
  if (!/^\d+$/.test(value)) throw new Error("Invalid token id.")
  const next = BigInt(value)
  if (next < BigInt(0)) throw new Error("Invalid token id.")
  return next.toString(16).padStart(64, "0")
}

export function revokeCalldata(approval: Pick<ApprovalItem, "type" | "spenderAddress" | "approvedForAll" | "approvedTokenId">) {
  if (approval.type === "erc20") {
    return `0x095ea7b3${encodeAddress(approval.spenderAddress)}${"0".repeat(64)}`
  }
  if (approval.type === "erc721" && approval.approvedForAll === false && approval.approvedTokenId) {
    return `0x095ea7b3${"0".repeat(64)}${encodeUint256(approval.approvedTokenId)}`
  }
  return `0xa22cb465${encodeAddress(approval.spenderAddress)}${"0".repeat(64)}`
}
