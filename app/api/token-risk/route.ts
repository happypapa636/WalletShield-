import { NextResponse } from "next/server"
import { normalizeChainId } from "@/lib/walletshield/chains"
import { fetchTokenRisk, isAddress } from "@/lib/walletshield/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const contractAddress = String(body.contractAddress ?? "").trim()
    const chainId = normalizeChainId(body.chainId)

    if (!isAddress(contractAddress)) {
      return NextResponse.json({ error: "Enter a valid token contract address." }, { status: 400 })
    }

    const report = await fetchTokenRisk(chainId, contractAddress)
    return NextResponse.json(report)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Token risk scan failed." },
      { status: 500 },
    )
  }
}
