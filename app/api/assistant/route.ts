import { NextResponse } from "next/server"
import { extractOpenAiText } from "@/lib/walletshield/server"

export const runtime = "nodejs"

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
  return "WalletShield checks live approvals, address reputation, token security, market context, and gives recovery steps. Ask about a specific alert and I will translate it into plain English."
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const question = String(body.question ?? "").trim()
    const report = body.report ?? null

    if (!question) {
      return NextResponse.json({ error: "Ask a wallet safety question first." }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
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
        model: process.env.OPENAI_MODEL ?? "gpt-5.5",
        reasoning: { effort: "low" },
        instructions:
          "You are WalletShield AI. Help users understand wallet security findings in plain English. Never ask for seed phrases or private keys. Keep answers concise and action-oriented. Use plain text with no Markdown.",
        input: `Question: ${question}

Current scan report JSON:
${JSON.stringify(report).slice(0, 9000)}`,
      }),
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json({
        answer: localAnswer(question),
        source: "WalletShield local assistant",
      })
    }

    const payload = await response.json()
    return NextResponse.json({
      answer: extractOpenAiText(payload) || localAnswer(question),
      source: "OpenAI Responses API",
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant failed." },
      { status: 500 },
    )
  }
}
