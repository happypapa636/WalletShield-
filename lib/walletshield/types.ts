export type Severity = "critical" | "high" | "medium" | "low" | "info"

export interface ChainConfig {
  id: string
  hexId: string
  name: string
  nativeSymbol: string
  rpcEnv: string
  fallbackRpc: string
  explorer: string
  goplusSupported: boolean
}

export interface RiskItem {
  id: string
  title: string
  severity: Severity
  source: string
  explanation: string
  action: string
  affectedAsset?: string
  spender?: string
  txHash?: string
}

export interface ApprovalItem {
  id: string
  type: "erc20" | "erc721" | "erc1155"
  chainId: string
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  spenderAddress: string
  spenderName: string
  spenderTag?: string
  approvedAmount: string
  approvedAt?: number
  txHash?: string
  risky: boolean
  severity: Severity
  riskLabels: string[]
  source: string
}

export interface MarketSignal {
  id: string
  title: string
  value: string
  change?: string
  severity: Severity
  source: string
  detail: string
  url?: string
}

export interface ScoreCategory {
  label: string
  score: number
  note: string
}

export interface DataSourceStatus {
  name: string
  status: "live" | "fallback" | "unconfigured" | "error"
  detail: string
}

export interface ScanReport {
  address: string
  chainId: string
  chainName: string
  nativeSymbol: string
  explorer: string
  scannedAt: string
  nativeBalance: string
  txCount: number
  score: number
  scoreLabel: string
  categories: ScoreCategory[]
  risks: RiskItem[]
  approvals: ApprovalItem[]
  marketSignals: MarketSignal[]
  recoveryPlan: string[]
  aiSummary: string
  dataSources: DataSourceStatus[]
}

export interface TokenRiskReport {
  chainId: string
  contractAddress: string
  tokenName: string
  tokenSymbol: string
  score: number
  severity: Severity
  riskLabels: string[]
  facts: { label: string; value: string }[]
  source: string
}
