import { NextResponse } from "next/server"
import { getChainConfig, normalizeChainId } from "@/lib/walletshield/chains"
import {
  clampScore,
  dataSource,
  fetchAddressSecurity,
  fetchApprovals,
  fetchMarketSignals,
  formatNativeBalance,
  generateAiSummary,
  isAddress,
  localSummary,
  rpcCall,
  scoreLabel,
  severityRank,
  shortAddress,
} from "@/lib/walletshield/server"
import type { ApprovalItem, RiskItem, ScoreCategory } from "@/lib/walletshield/types"

export const runtime = "nodejs"

function riskFromApproval(approval: ApprovalItem): RiskItem {
  const action =
    approval.type === "erc20"
      ? "Use the revoke button to set this allowance to 0 from your wallet."
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

  if (approvals.length === 0) {
    plan[1] = "No open approval surfaced in this scan; still review connected sites inside your wallet."
  }

  return plan
}

function buildScores(input: {
  txCount: number
  addressFlags: string[]
  approvals: ApprovalItem[]
  marketStress: number
}) {
  const highApprovals = input.approvals.filter((item) => severityRank(item.severity) >= severityRank("high")).length
  const criticalApprovals = input.approvals.filter((item) => item.severity === "critical").length
  const unlimited = input.approvals.filter((item) => /unlimited/i.test(item.approvedAmount)).length

  const approvalSafety = clampScore(100 - criticalApprovals * 35 - highApprovals * 16 - unlimited * 6)
  const scamExposure = clampScore(100 - input.addressFlags.length * 25 - criticalApprovals * 20)
  const walletHygiene = clampScore(88 - (input.txCount === 0 ? 8 : 0) - Math.min(input.txCount / 500, 10))
  const marketContext = clampScore(92 - input.marketStress * 8)
  const overall = clampScore(
    approvalSafety * 0.4 + scamExposure * 0.3 + walletHygiene * 0.15 + marketContext * 0.15,
  )

  const categories: ScoreCategory[] = [
    {
      label: "Approval Safety",
      score: approvalSafety,
      note: highApprovals ? `${highApprovals} high-risk approval${highApprovals === 1 ? "" : "s"}` : "No high-risk approval surfaced",
    },
    {
      label: "Scam Exposure",
      score: scamExposure,
      note: input.addressFlags.length ? input.addressFlags.join(", ") : "No malicious-address flag found",
    },
    {
      label: "Wallet Hygiene",
      score: walletHygiene,
      note: input.txCount === 0 ? "Fresh wallet with limited history" : `${input.txCount} on-chain transactions`,
    },
    {
      label: "Market Context",
      score: marketContext,
      note: input.marketStress ? "Volatile market conditions detected" : "No major market stress signal",
    },
  ]

  return { overall, categories }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const address = String(body.address ?? "").trim()
    const chainId = normalizeChainId(body.chainId)
    const chain = getChainConfig(chainId)

    if (!isAddress(address)) {
      return NextResponse.json({ error: "Enter a valid EVM wallet address." }, { status: 400 })
    }

    const [balanceResult, txCountResult, addressResult, approvalResult, marketResult] =
      await Promise.allSettled([
        rpcCall<string>(chain, "eth_getBalance", [address, "latest"]),
        rpcCall<string>(chain, "eth_getTransactionCount", [address, "latest"]),
        fetchAddressSecurity(chain.id, address),
        chain.goplusSupported
          ? fetchApprovals(chain.id, address)
          : Promise.resolve({
              approvals: [],
              status: "unconfigured" as const,
              detail: "GoPlus approval scan is not enabled for this chain in Wave 1.",
            }),
        fetchMarketSignals(),
      ])

    const nativeBalance =
      balanceResult.status === "fulfilled" ? formatNativeBalance(balanceResult.value) : "0"
    const txCount =
      txCountResult.status === "fulfilled" ? Number.parseInt(txCountResult.value, 16) : 0
    const addressFlags =
      addressResult.status === "fulfilled" ? addressResult.value.flags : []
    const approvals =
      approvalResult.status === "fulfilled" ? approvalResult.value.approvals : []
    const marketSignals =
      marketResult.status === "fulfilled" ? marketResult.value.signals : []

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
    ]

    if (txCount === 0) {
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

    const marketStress = marketSignals.filter((signal) => signal.severity === "medium").length
    const { overall, categories } = buildScores({
      txCount,
      addressFlags,
      approvals,
      marketStress,
    })

    const aiSummary =
      (await generateAiSummary({ score: overall, risks, approvals, marketSignals })) ??
      localSummary(overall, risks, approvals)

    const dataSources = [
      dataSource(
        "RPC",
        balanceResult.status === "fulfilled" && txCountResult.status === "fulfilled" ? "live" : "error",
        balanceResult.status === "fulfilled"
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
        "OpenAI",
        process.env.OPENAI_API_KEY ? "live" : "unconfigured",
        process.env.OPENAI_API_KEY
          ? "AI explanation endpoint is configured."
          : "OPENAI_API_KEY is not present; local explanation fallback used.",
      ),
    ]

    return NextResponse.json({
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
      risks,
      approvals,
      marketSignals,
      recoveryPlan: buildRecoveryPlan(risks, approvals),
      aiSummary,
      dataSources,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wallet scan failed." },
      { status: 500 },
    )
  }
}
