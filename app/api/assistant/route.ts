import { z } from "zod"
import { apiJson, parseJsonBody, rateLimit } from "@/lib/walletshield/guards"
import { extractOpenAiText, getOpenAiModel, isAddress, shortAddress } from "@/lib/walletshield/server"

export const runtime = "nodejs"

const assistantRequestSchema = z
  .object({
    question: z.string().trim().min(1, "Ask a wallet safety question first.").max(800, "Question is too long."),
    report: z.unknown().optional(),
  })
  .strict()

function localAnswer(question: string) {
  const normalized = question.toLowerCase()
  if (normalized.includes("approval") || normalized.includes("revoke")) {
    return "Approvals are permissions you gave to a smart contract. If the allowance is unlimited or the spender is unknown, revoke it from the Approval Manager before using that wallet for valuable assets."
  }
  if (normalized.includes("hacked") || normalized.includes("drain")) {
    return "First stop signing, then move remaining valuable assets to a fresh wallet from a clean device. After that, revoke approvals, document suspicious transactions, and do not reuse the exposed wallet for long-term holdings."
  }
  if (normalized.includes("token") || normalized.includes("airdrop")) {
    return "Treat unknown tokens and airdrops as hostile until proven otherwise. Do not visit links from token names, do not approve the token contract, and use the token probe before interacting."
  }
  if (normalized.includes("score") || normalized.includes("formula")) {
    return "The health score is public in each scan: approval safety is weighted highest, then scam exposure, wallet hygiene, market/threat context from SoSoValue, and SoDEX trading-surface context. Market news can raise review priority, but it is never treated as proof that the wallet is compromised."
  }
  if (normalized.includes("soso") || normalized.includes("ssi") || normalized.includes("index")) {
    return "SoSoValue powers the market and campaign radar: BTC/ETH snapshots, SSI index stress, live news, and scam-keyword searches. WalletShield uses those feeds to show when phishing or fake-airdrop narratives are active around a scan."
  }
  if (normalized.includes("sodex") || normalized.includes("trading key") || normalized.includes("api key")) {
    return "WalletShield uses SoDEX read-only context. It checks public spot/perps market stress and whether the scanned wallet has registered SoDEX signing keys. It never asks for trading private keys or places orders."
  }
  return "WalletShield checks live approvals, address reputation, token security, market context, and gives recovery steps. Ask about a specific alert and I will translate it into plain English."
}

function containsSensitiveSecret(value: string) {
  const patterns = [
    /\b0x[a-fA-F0-9]{64}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\b(?:api[_ -]?key|private[_ -]?key|secret)\s*[:=]\s*\S{8,}/i,
    /\b(?:seed phrase|mnemonic|recovery phrase|secret phrase)\s*[:=]/i,
    /\b(?:my|here is|this is|i pasted).{0,40}(?:api[_ -]?key|private[_ -]?key|seed phrase|mnemonic|recovery phrase|secret phrase)\b/i,
  ]
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const looksLikeRawRecoveryPhrase =
    words.length >= 12 &&
    words.length <= 24 &&
    !/[?.!,;:]/.test(value) &&
    words.every((word) => /^[a-z]{3,12}$/.test(word))

  return looksLikeRawRecoveryPhrase || patterns.some((pattern) => pattern.test(value))
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.slice(0, 240) : fallback
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asList(value: unknown) {
  return Array.isArray(value) ? value : []
}

function redactedAddress(value: unknown) {
  const next = text(value)
  return isAddress(next) ? shortAddress(next) : undefined
}

function buildAssistantContext(report: unknown) {
  const root = asRecord(report)
  if (Object.keys(root).length === 0) return null

  return {
    address: redactedAddress(root.address),
    chain: text(root.chainName),
    score: numberValue(root.score),
    scoreLabel: text(root.scoreLabel),
    topRisks: asList(root.risks)
      .slice(0, 6)
      .map((item) => {
        const risk = asRecord(item)
        return {
          severity: text(risk.severity),
          title: text(risk.title),
          source: text(risk.source),
          action: text(risk.action),
        }
      }),
    riskyApprovals: asList(root.approvals)
      .filter((item) => asRecord(item).risky === true)
      .slice(0, 5)
      .map((item) => {
        const approval = asRecord(item)
        return {
          type: text(approval.type),
          tokenSymbol: text(approval.tokenSymbol),
          spender: redactedAddress(approval.spenderAddress) ?? text(approval.spenderName, "unknown"),
          severity: text(approval.severity),
          labels: asList(approval.riskLabels).map((label) => text(label)).filter(Boolean).slice(0, 4),
        }
      }),
    dataSources: asList(root.dataSources)
      .slice(0, 8)
      .map((item) => {
        const source = asRecord(item)
        return {
          name: text(source.name),
          status: text(source.status),
        }
      }),
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "assistant")
    if (limited) return limited

    const parsed = await parseJsonBody(request, assistantRequestSchema, { maxBytes: 16_000 })
    if (parsed.error) return parsed.error

    const { question } = parsed.data
    const reportContext = buildAssistantContext(parsed.data.report)

    if (containsSensitiveSecret(question)) {
      return apiJson({
        answer:
          "For safety, do not paste seed phrases, private keys, recovery phrases, or API secrets into WalletShield. Rotate or revoke anything you already exposed, then ask again using only public wallet addresses, token contracts, or alert names.",
        source: "WalletShield safety guard",
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return apiJson({
        answer: localAnswer(question),
        source: "WalletShield local assistant",
      })
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        reasoning: { effort: "low" },
        instructions:
          "You are WalletShield AI. Help users understand wallet security findings in plain English. Never ask for seed phrases or private keys. Keep answers concise and action-oriented. Use plain text with no Markdown.",
        input: `Question: ${question}

Redacted scan context:
${JSON.stringify(reportContext).slice(0, 3000)}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      return apiJson({
        answer: localAnswer(question),
        source: "WalletShield local assistant",
      })
    }

    const payload = await response.json()
    return apiJson({
      answer: extractOpenAiText(payload) || localAnswer(question),
      source: "OpenAI Responses API",
    })
  } catch {
    return apiJson(
      { error: "Assistant failed. Try again or use the recovery guidance in the scan report." },
      { status: 500 },
    )
  }
}
