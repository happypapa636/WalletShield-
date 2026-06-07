import { z } from "zod"
import {
  getChainConfig,
  isSupportedChainId,
  normalizeChainId,
  supportedChainNames,
} from "@/lib/walletshield/chains"
import { apiJson, parseJsonBody, rateLimit } from "@/lib/walletshield/guards"
import {
  clampScore,
  dataSource,
  fetchAddressSecurity,
  fetchApprovals,
  fetchMarketSignals,
  fetchSodexSignals,
  formatNativeBalance,
  generateAiSummary,
  isAddress,
  localSummary,
  rpcCall,
  scoreLabel,
  severityRank,
  shortAddress,
} from "@/lib/walletshield/server"
import type {
  ApprovalItem,
  DataConfidence,
  ForensicsEvent,
  MarketSignal,
  RiskItem,
  ScoreCategory,
  ScoreFactor,
  ScoreFormula,
  ThreatCampaign,
} from "@/lib/walletshield/types"

export const runtime = "nodejs"

const scanRequestSchema = z
  .object({
    address: z.string().trim().min(1, "Enter a valid EVM wallet address.").max(64, "Wallet address is too long."),
    chainId: z.union([z.string(), z.number()]).optional(),
  })
  .strict()

function riskFromApproval(approval: ApprovalItem): RiskItem {
  const action =
    approval.type === "erc20"
      ? "Use the revoke button to set this allowance to 0 from your wallet."
      : approval.type === "erc721" && approval.approvedForAll === false && approval.approvedTokenId
      ? "Use the revoke button to clear the approved address for this specific NFT token."
      : "Use the revoke button to remove operator access for this NFT collection."

  return {
    id: `approval-${approval.id}`,
    title: `${approval.tokenSymbol} approval to ${approval.spenderName}`,
    severity: approval.severity,
    source: approval.source,
    explanation:
      approval.riskLabels.join(", ") +
      `. The spender ${shortAddress(approval.spenderAddress)} can use the permission until it is revoked.`,
    action,
    affectedAsset: approval.tokenSymbol,
    spender: approval.spenderAddress,
    txHash: approval.txHash,
  }
}

function buildRecoveryPlan(risks: RiskItem[], approvals: ApprovalItem[]) {
  const plan = [
    "Do not sign new transactions until you understand the top alert.",
    "Revoke unknown or unlimited approvals first.",
    "Move high-value assets to a fresh wallet if you suspect compromise.",
    "Disconnect risky dApps from your wallet settings.",
    "Scan again after each action and keep the report for incident notes.",
  ]

  if (risks.some((risk) => risk.severity === "critical")) {
    plan.unshift("Treat this as urgent: use a clean device and do not reuse the compromised wallet for fresh funds.")
  }

  if (approvals.length === 0 && risks.some((risk) => risk.id === "data-confidence-warning")) {
    plan[1] = "Approval data may be incomplete; manually review connected sites, token allowances, and chain explorer approvals."
  } else if (approvals.length === 0) {
    plan[1] = "No open approval surfaced in this scan; still review connected sites inside your wallet."
  }

  if (risks.some((risk) => /SoDEX/i.test(risk.source))) {
    plan.splice(
      2,
      0,
      "Review SoDEX API keys and rotate any trading key that is not actively used.",
    )
  }

  return plan
}

function buildScores(input: {
  txCount: number
  addressFlags: string[]
  approvals: ApprovalItem[]
  marketStress: number
  dexSignals: MarketSignal[]
  approvalCoverageLimited: boolean
  rpcFailed: boolean
  addressFeedFailed: boolean
  approvalFeedFailed: boolean
  marketFeedFailed: boolean
  sodexFeedFailed: boolean
}) {
  const highApprovals = input.approvals.filter((item) => severityRank(item.severity) >= severityRank("high")).length
  const criticalApprovals = input.approvals.filter((item) => item.severity === "critical").length
  const unlimited = input.approvals.filter((item) => /unlimited/i.test(item.approvedAmount)).length
  const dexStress = input.dexSignals.filter(
    (item) => severityRank(item.severity) >= severityRank("medium"),
  ).length

  const approvalSafety = clampScore(
    100 -
      criticalApprovals * 35 -
      highApprovals * 16 -
      unlimited * 6 -
      (input.approvalCoverageLimited ? 12 : 0) -
      (input.approvalFeedFailed ? 25 : 0),
  )
  const scamExposure = clampScore(
    100 - input.addressFlags.length * 25 - criticalApprovals * 20 - (input.addressFeedFailed ? 30 : 0),
  )
  const walletHygiene = clampScore(
    88 -
      (input.rpcFailed ? 20 : input.txCount === 0 ? 8 : 0) -
      (input.rpcFailed ? 0 : Math.min(input.txCount / 500, 10)),
  )
  const marketContext = clampScore(92 - input.marketStress * 8 - (input.marketFeedFailed ? 12 : 0))
  const tradingSurface = clampScore(96 - dexStress * 14 - (input.sodexFeedFailed ? 8 : 0))
  const overall = clampScore(
    approvalSafety * 0.35 +
      scamExposure * 0.25 +
      walletHygiene * 0.15 +
      marketContext * 0.15 +
      tradingSurface * 0.1,
  )

  const categories: ScoreCategory[] = [
    {
      label: "Approval Safety",
      score: approvalSafety,
      note: input.approvalFeedFailed
        ? "Approval feed failed, so coverage is degraded"
        : input.approvalCoverageLimited
        ? "Approval feed is unavailable for this chain, so coverage is partial"
        : highApprovals
          ? `${highApprovals} high-risk approval${highApprovals === 1 ? "" : "s"}`
          : "No high-risk approval surfaced",
    },
    {
      label: "Scam Exposure",
      score: scamExposure,
      note: input.addressFeedFailed
        ? "Address reputation feed failed"
        : input.addressFlags.length
          ? input.addressFlags.join(", ")
          : "No malicious-address flag found",
    },
    {
      label: "Wallet Hygiene",
      score: walletHygiene,
      note: input.rpcFailed
        ? "RPC balance or transaction-count read failed"
        : input.txCount === 0
          ? "Fresh wallet with limited history"
          : `${input.txCount} on-chain transactions`,
    },
    {
      label: "Market Context",
      score: marketContext,
      note:
        input.marketFeedFailed
          ? "SoSoValue market feed failed"
          : input.marketStress
          ? "Market stress signal detected"
          : "No major market stress signal",
    },
    {
      label: "Trading Surface",
      score: tradingSurface,
      note: input.sodexFeedFailed
        ? "SoDEX read-only context failed"
        : dexStress
        ? `${dexStress} SoDEX execution or signing-key signal${dexStress === 1 ? "" : "s"} need review`
        : "No SoDEX trading-surface stress signal",
    },
  ]

  const deductions: ScoreFactor[] = [
    criticalApprovals > 0 && {
      label: "Critical approvals",
      impact: criticalApprovals * -35,
      severity: "critical" as const,
      detail: `${criticalApprovals} approval${criticalApprovals === 1 ? "" : "s"} matched malicious or doubt-list behavior.`,
    },
    highApprovals > 0 && {
      label: "High-risk approvals",
      impact: highApprovals * -16,
      severity: "high" as const,
      detail: `${highApprovals} high-risk approval${highApprovals === 1 ? "" : "s"} reduced approval safety.`,
    },
    unlimited > 0 && {
      label: "Unlimited allowances",
      impact: unlimited * -6,
      severity: "high" as const,
      detail: `${unlimited} unlimited allowance${unlimited === 1 ? "" : "s"} increased revocation priority.`,
    },
    input.approvalCoverageLimited && {
      label: "Partial approval coverage",
      impact: -12,
      severity: "info" as const,
      detail: "Approval scanning is unavailable for this chain, so the approval-safety score is intentionally conservative.",
    },
    input.approvalFeedFailed && {
      label: "Approval feed failed",
      impact: -25,
      severity: "high" as const,
      detail: "Open token and NFT approvals could not be fully loaded, so WalletShield does not treat missing approvals as clean.",
    },
    input.addressFlags.length > 0 && {
      label: "Address reputation flags",
      impact: input.addressFlags.length * -25,
      severity: "critical" as const,
      detail: input.addressFlags.join(", "),
    },
    input.addressFeedFailed && {
      label: "Address reputation unavailable",
      impact: -30,
      severity: "high" as const,
      detail: "GoPlus address reputation failed, so scam-exposure confidence is reduced.",
    },
    input.rpcFailed && {
      label: "RPC state unavailable",
      impact: -20,
      severity: "medium" as const,
      detail: "Balance or transaction count could not be read from the selected chain RPC.",
    },
    !input.rpcFailed && input.txCount === 0 && {
      label: "Limited wallet history",
      impact: -8,
      severity: "info" as const,
      detail: "Fresh wallets are not automatically risky, but they reduce behavior confidence.",
    },
    input.marketStress > 0 && {
      label: "Market stress",
      impact: input.marketStress * -8,
      severity: "medium" as const,
      detail: `${input.marketStress} volatile market signal${input.marketStress === 1 ? "" : "s"} from SoSoValue market, news, or SSI feeds.`,
    },
    input.marketFeedFailed && {
      label: "SoSoValue context unavailable",
      impact: -12,
      severity: "medium" as const,
      detail: "SoSoValue market and SSI context failed, so market-context confidence is reduced.",
    },
    input.sodexFeedFailed && {
      label: "SoDEX context unavailable",
      impact: -8,
      severity: "info" as const,
      detail: "SoDEX public spot/perps or account-key reads failed, so trading-surface context is reduced.",
    },
    dexStress > 0 && {
      label: "SoDEX trading surface",
      impact: dexStress * -14,
      severity: "medium" as const,
      detail: `${dexStress} SoDEX read-only signal${dexStress === 1 ? "" : "s"} raised execution-safety review priority.`,
    },
  ].filter(Boolean) as ScoreFactor[]

  const scoreFormula: ScoreFormula = {
    formula:
      "Overall = Approval Safety x 35% + Scam Exposure x 25% + Wallet Hygiene x 15% + Market Context x 15% + Trading Surface x 10%",
    weights: categories.map((category) => {
      const weight =
        category.label === "Approval Safety"
          ? 0.35
          : category.label === "Scam Exposure"
            ? 0.25
            : category.label === "Trading Surface"
              ? 0.1
            : 0.15
      return {
        label: category.label,
        weight,
        score: category.score,
        contribution: Number((category.score * weight).toFixed(2)),
        note: category.note,
      }
    }),
    deductions,
    validationNotes: [
      "False positives are possible when a legitimate spender is not verified or uses unlimited allowance for convenience.",
      "False negatives are possible when a new drainer contract has not appeared in public feeds yet.",
      "SoSoValue campaign search is context only unless it can be tied to wallet assets, approvals, or user activity.",
      "When a critical data source fails, WalletShield lowers score confidence instead of treating missing data as clean.",
    ],
  }

  return { overall, categories, scoreFormula }
}

function riskFromDexSignal(signal: MarketSignal): RiskItem {
  return {
    id: `sodex-risk-${signal.id}`,
    title: signal.title,
    severity: signal.severity,
    source: signal.source,
    explanation: signal.detail,
    action:
      "Use SoDEX read-only context before trading, rotate unused API keys, and never paste trading private keys into WalletShield.",
  }
}

function buildForensicsTimeline(input: {
  approvals: ApprovalItem[]
  risks: RiskItem[]
  campaigns: ThreatCampaign[]
  dexSignals: MarketSignal[]
  txCount: number
  rpcFailed: boolean
  explorer: string
}): ForensicsEvent[] {
  const events: ForensicsEvent[] = []

  for (const approval of input.approvals
    .filter((item) => item.risky)
    .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
    .slice(0, 5)) {
    events.push({
      id: `forensics-${approval.id}`,
      title: `${approval.tokenSymbol} approval exposed`,
      severity: approval.severity,
      source: approval.source,
      detail: `${approval.spenderName} can use ${approval.approvedAmount}. Labels: ${approval.riskLabels.join(", ")}.`,
      observedAt: approval.approvedAt ? new Date(approval.approvedAt * 1000).toISOString() : undefined,
      txHash: approval.txHash,
      explorerUrl: approval.txHash ? `${input.explorer}/tx/${approval.txHash}` : undefined,
    })
  }

  for (const risk of input.risks.filter((item) => item.source === "GoPlus Address Security API")) {
    events.push({
      id: `forensics-${risk.id}`,
      title: risk.title,
      severity: risk.severity,
      source: risk.source,
      detail: risk.explanation,
      txHash: risk.txHash,
      explorerUrl: risk.txHash ? `${input.explorer}/tx/${risk.txHash}` : undefined,
    })
  }

  for (const campaign of input.campaigns.slice(0, 3)) {
    events.push({
      id: `forensics-${campaign.id}`,
      title: campaign.title,
      severity: campaign.severity,
      source: campaign.source,
      detail: campaign.detail,
      explorerUrl: campaign.url,
    })
  }

  for (const signal of input.dexSignals.filter((item) => severityRank(item.severity) >= severityRank("medium"))) {
    events.push({
      id: `forensics-${signal.id}`,
      title: signal.title,
      severity: signal.severity,
      source: signal.source,
      detail: signal.detail,
      action: "Review SoDEX API-key and execution exposure before placing new orders.",
      explorerUrl: signal.url,
    })
  }

  if (!input.rpcFailed && input.txCount === 0) {
    events.push({
      id: "forensics-fresh-wallet",
      title: "Limited transaction history",
      severity: "info",
      source: "RPC transaction count",
      detail: "No transactions were found, so historical behavior confidence is low.",
    })
  }

  if (events.length === 0) {
    events.push({
      id: "forensics-clean",
      title: "No drain timeline evidence surfaced",
      severity: "low",
      source: "WalletShield forensics",
      detail: "The current scan did not find risky approval timestamps, address-reputation hits, or active campaign matches.",
    })
  }

  return events.slice(0, 10)
}

function buildDataConfidence(input: {
  rpcFailed: boolean
  addressFeedFailed: boolean
  approvalFeedFailed: boolean
  marketFeedFailed: boolean
  sodexFeedFailed: boolean
  approvalCoverageLimited: boolean
}): DataConfidence {
  const warnings: string[] = []

  if (input.rpcFailed) warnings.push("RPC balance or transaction-count reads failed.")
  if (input.addressFeedFailed) warnings.push("Address reputation could not be verified.")
  if (input.approvalFeedFailed) warnings.push("Approval inventory could not be fully loaded.")
  if (input.approvalCoverageLimited) warnings.push("Approval coverage is partial for this chain.")
  if (input.marketFeedFailed) warnings.push("SoSoValue market and SSI context is unavailable.")
  if (input.sodexFeedFailed) warnings.push("SoDEX read-only context is unavailable.")

  const score = clampScore(
    100 -
      (input.rpcFailed ? 22 : 0) -
      (input.addressFeedFailed ? 24 : 0) -
      (input.approvalFeedFailed ? 26 : 0) -
      (input.approvalCoverageLimited ? 10 : 0) -
      (input.marketFeedFailed ? 10 : 0) -
      (input.sodexFeedFailed ? 6 : 0),
  )

  return {
    score,
    label: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
    warnings,
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "scan")
    if (limited) return limited

    const parsed = await parseJsonBody(request, scanRequestSchema, { maxBytes: 2_000 })
    if (parsed.error) return parsed.error

    const address = parsed.data.address
    const chainId = normalizeChainId(parsed.data.chainId)

    if (!isAddress(address)) {
      return apiJson({ error: "Enter a valid EVM wallet address." }, { status: 400 })
    }

    if (!isSupportedChainId(chainId)) {
      return apiJson(
        { error: `Unsupported chain. Choose one of: ${supportedChainNames()}.` },
        { status: 400 },
      )
    }

    const chain = getChainConfig(chainId)

    const [balanceResult, txCountResult, addressResult, approvalResult, marketResult, sodexResult] =
      await Promise.allSettled([
        rpcCall<string>(chain, "eth_getBalance", [address, "latest"]),
        rpcCall<string>(chain, "eth_getTransactionCount", [address, "latest"]),
        fetchAddressSecurity(chain.id, address),
        chain.goplusSupported
          ? fetchApprovals(chain.id, address)
          : Promise.resolve({
              approvals: [],
              status: "unconfigured" as const,
              detail: "GoPlus approval scanning is not available for this chain yet.",
            }),
        fetchMarketSignals(),
        fetchSodexSignals(address),
      ])

    const nativeBalance =
      balanceResult.status === "fulfilled" ? formatNativeBalance(balanceResult.value) : "0"
    const txCount =
      txCountResult.status === "fulfilled" ? Number.parseInt(txCountResult.value, 16) : 0
    const addressFlags =
      addressResult.status === "fulfilled" ? addressResult.value.flags : []
    const approvals =
      approvalResult.status === "fulfilled" ? approvalResult.value.approvals : []
    const sosoSignals =
      marketResult.status === "fulfilled" ? marketResult.value.signals : []
    const sodexSignals =
      sodexResult.status === "fulfilled" ? sodexResult.value.signals : []
    const threatCampaigns =
      marketResult.status === "fulfilled" ? marketResult.value.campaigns : []
    const approvalCoverageLimited =
      approvalResult.status === "fulfilled" && approvalResult.value.status === "unconfigured"
    const rpcFailed = balanceResult.status !== "fulfilled" || txCountResult.status !== "fulfilled"
    const addressFeedFailed = addressResult.status !== "fulfilled"
    const approvalFeedFailed =
      approvalResult.status !== "fulfilled" || approvalResult.value.status === "error"
    const marketFeedFailed =
      marketResult.status !== "fulfilled" || marketResult.value.status === "error"
    const sodexFeedFailed =
      sodexResult.status !== "fulfilled" || sodexResult.value.status === "error"
    const dataConfidence = buildDataConfidence({
      rpcFailed,
      addressFeedFailed,
      approvalFeedFailed,
      marketFeedFailed,
      sodexFeedFailed,
      approvalCoverageLimited,
    })

    const risks: RiskItem[] = [
      ...addressFlags.map((flag, index) => ({
        id: `address-${index}`,
        title: flag,
        severity: "critical" as const,
        source: "GoPlus Address Security API",
        explanation: `This address matched the ${flag.toLowerCase()} signal in a wallet reputation feed.`,
        action: "Do not send new assets to this wallet until the activity is reviewed.",
      })),
      ...approvals
        .filter((approval) => approval.risky)
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 8)
        .map(riskFromApproval),
      ...sodexSignals
        .filter((signal) => severityRank(signal.severity) >= severityRank("medium"))
        .slice(0, 3)
        .map(riskFromDexSignal),
    ]

    if (approvalCoverageLimited) {
      risks.push({
        id: "approval-coverage-limited",
        title: "Approval coverage is limited on this chain",
        severity: "info",
        source: "WalletShield coverage guard",
        explanation:
          "This chain can be scanned for balance, transaction count, market context, and account intelligence, but approval inventory is not available from the current approval feed.",
        action: "Use the chain explorer and wallet connected-sites panel to manually review approvals before treating the wallet as clean.",
      })
    }

    if (dataConfidence.warnings.length > 0) {
      risks.push({
        id: "data-confidence-warning",
        title: "Scan coverage is degraded",
        severity: dataConfidence.label === "low" ? "high" : "medium",
        source: "WalletShield source health",
        explanation: dataConfidence.warnings.join(" "),
        action: "Do not treat this scan as fully clean until failed sources are live or manually checked.",
      })
    }

    if (!rpcFailed && txCount === 0) {
      risks.push({
        id: "fresh-wallet",
        title: "Fresh wallet with little history",
        severity: "info",
        source: "RPC transaction count",
        explanation: "A fresh wallet is not risky by itself, but there is not enough behavior history to score hygiene deeply.",
        action: "Use a test transaction and keep long-term holdings separate from dApp experiments.",
      })
    }

    if (risks.length === 0) {
      risks.push({
        id: "clean-scan",
        title: "No urgent threat surfaced",
        severity: "low",
        source: "WalletShield rule engine",
        explanation: "The live sources did not return a critical issue for this scan.",
        action: "Keep scanning after connecting to new dApps or receiving unknown tokens.",
      })
    }

    const marketStress = sosoSignals.filter(
      (signal) => severityRank(signal.severity) >= severityRank("medium"),
    ).length
    const { overall, categories, scoreFormula } = buildScores({
      txCount,
      addressFlags,
      approvals,
      marketStress,
      dexSignals: sodexSignals,
      approvalCoverageLimited,
      rpcFailed,
      addressFeedFailed,
      approvalFeedFailed,
      marketFeedFailed,
      sodexFeedFailed,
    })

    const generatedSummary = await generateAiSummary({
      score: overall,
      risks,
      approvals,
      marketSignals: [...sosoSignals, ...sodexSignals],
    })
    const aiSummary = generatedSummary ?? localSummary(overall, risks, approvals)
    const forensics = buildForensicsTimeline({
      approvals,
      risks,
      campaigns: threatCampaigns,
      dexSignals: sodexSignals,
      txCount,
      rpcFailed,
      explorer: chain.explorer,
    })

    const dataSources = [
      dataSource(
        "RPC",
        balanceResult.status === "fulfilled" && txCountResult.status === "fulfilled" ? "live" : "error",
        balanceResult.status === "fulfilled" && txCountResult.status === "fulfilled"
          ? `${chain.name} balance and transaction count loaded.`
          : "RPC read failed.",
      ),
      dataSource(
        "GoPlus Address Security",
        addressResult.status === "fulfilled" ? "live" : "error",
        addressResult.status === "fulfilled"
          ? addressResult.value.detail
          : "Address reputation feed failed.",
      ),
      dataSource(
        "GoPlus Approval Security",
        approvalResult.status === "fulfilled" ? approvalResult.value.status : "error",
        approvalResult.status === "fulfilled"
          ? approvalResult.value.detail
          : "Approval feed failed.",
      ),
      dataSource(
        "SoSoValue",
        marketResult.status === "fulfilled" ? marketResult.value.status : "error",
        marketResult.status === "fulfilled"
          ? marketResult.value.detail
          : "SoSoValue market intelligence failed.",
      ),
      dataSource(
        "SoDEX Public Market Data",
        sodexResult.status === "fulfilled" ? sodexResult.value.status : "error",
        sodexResult.status === "fulfilled"
          ? sodexResult.value.detail
          : "SoDEX spot/perps market data failed.",
      ),
      dataSource(
        "OpenAI",
        generatedSummary
          ? "live"
          : process.env.OPENAI_API_KEY
            ? "fallback"
            : "unconfigured",
        generatedSummary
          ? "AI explanation generated by OpenAI Responses API."
          : process.env.OPENAI_API_KEY
            ? "OPENAI_API_KEY is present, but local explanation fallback was used for this scan."
            : "OPENAI_API_KEY is not present; local explanation fallback used.",
      ),
    ]

    return apiJson({
      address,
      chainId: chain.id,
      chainName: chain.name,
      nativeSymbol: chain.nativeSymbol,
      explorer: chain.explorer,
      scannedAt: new Date().toISOString(),
      nativeBalance,
      txCount,
      score: overall,
      scoreLabel: scoreLabel(overall),
      categories,
      scoreFormula,
      risks,
      approvals,
      marketSignals: sosoSignals,
      threatCampaigns,
      dexSignals: sodexSignals,
      forensics,
      recoveryPlan: buildRecoveryPlan(risks, approvals),
      aiSummary,
      dataSources,
      dataConfidence,
    })
  } catch {
    return apiJson(
      { error: "Wallet scan failed. Check the address, chain, and provider configuration, then try again." },
      { status: 500 },
    )
  }
}
