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
  approvedForAll?: boolean
  approvedTokenId?: string
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

export interface ThreatCampaign {
  id: string
  title: string
  keyword: string
  mentionCount: number
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

export interface ScoreFactor {
  label: string
  impact: number
  severity: Severity
  detail: string
}

export interface ScoreFormula {
  formula: string
  weights: Array<{
    label: string
    weight: number
    score: number
    contribution: number
    note: string
  }>
  deductions: ScoreFactor[]
  validationNotes: string[]
}

export interface DataSourceStatus {
  name: string
  status: "live" | "fallback" | "unconfigured" | "error"
  detail: string
}

export interface DataConfidence {
  score: number
  label: "high" | "medium" | "low"
  warnings: string[]
}

export interface ForensicsEvent {
  id: string
  title: string
  severity: Severity
  source: string
  detail: string
  action?: string
  observedAt?: string
  txHash?: string
  explorerUrl?: string
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
  scoreFormula: ScoreFormula
  risks: RiskItem[]
  approvals: ApprovalItem[]
  marketSignals: MarketSignal[]
  threatCampaigns: ThreatCampaign[]
  dexSignals: MarketSignal[]
  forensics: ForensicsEvent[]
  recoveryPlan: string[]
  aiSummary: string
  dataSources: DataSourceStatus[]
  dataConfidence: DataConfidence
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
