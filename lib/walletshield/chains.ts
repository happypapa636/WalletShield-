import type { ChainConfig } from "./types"

export const CHAINS: Record<string, ChainConfig> = {
  "1": {
    id: "1",
    hexId: "0x1",
    name: "Ethereum",
    nativeSymbol: "ETH",
    rpcEnv: "ETHEREUM_RPC_URL",
    fallbackRpc: "https://ethereum.publicnode.com",
    explorer: "https://etherscan.io",
    goplusSupported: true,
  },
  "56": {
    id: "56",
    hexId: "0x38",
    name: "BNB Smart Chain",
    nativeSymbol: "BNB",
    rpcEnv: "BSC_RPC_URL",
    fallbackRpc: "https://bsc.publicnode.com",
    explorer: "https://bscscan.com",
    goplusSupported: true,
  },
  "137": {
    id: "137",
    hexId: "0x89",
    name: "Polygon",
    nativeSymbol: "MATIC",
    rpcEnv: "POLYGON_RPC_URL",
    fallbackRpc: "https://polygon-bor.publicnode.com",
    explorer: "https://polygonscan.com",
    goplusSupported: true,
  },
  "42161": {
    id: "42161",
    hexId: "0xa4b1",
    name: "Arbitrum One",
    nativeSymbol: "ETH",
    rpcEnv: "ARBITRUM_RPC_URL",
    fallbackRpc: "https://arbitrum-one.publicnode.com",
    explorer: "https://arbiscan.io",
    goplusSupported: true,
  },
  "8453": {
    id: "8453",
    hexId: "0x2105",
    name: "Base",
    nativeSymbol: "ETH",
    rpcEnv: "BASE_RPC_URL",
    fallbackRpc: "https://base.publicnode.com",
    explorer: "https://basescan.org",
    goplusSupported: true,
  },
}

export function normalizeChainId(input?: string | number | null) {
  if (!input) return "1"
  if (typeof input === "number") return String(input)
  if (input.startsWith("0x")) return String(Number.parseInt(input, 16))
  return input
}

export function getChainConfig(input?: string | number | null) {
  const chainId = normalizeChainId(input)
  return CHAINS[chainId] ?? CHAINS["1"]
}

export function isSupportedChainId(input?: string | number | null) {
  const chainId = normalizeChainId(input)
  return Boolean(CHAINS[chainId])
}

export function supportedChainNames() {
  return Object.values(CHAINS)
    .map((chain) => chain.name)
    .join(", ")
}

export const selectableChains = Object.values(CHAINS)
