import { z } from "zod"
import { isSupportedChainId, normalizeChainId, supportedChainNames } from "@/lib/walletshield/chains"
import { apiJson, parseJsonBody, rateLimit } from "@/lib/walletshield/guards"
import { fetchTokenRisk, isAddress } from "@/lib/walletshield/server"

export const runtime = "nodejs"

const tokenRiskRequestSchema = z
  .object({
    contractAddress: z.string().trim().min(1, "Enter a valid token contract address.").max(64, "Token address is too long."),
    chainId: z.union([z.string(), z.number()]).optional(),
  })
  .strict()

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "token-risk")
    if (limited) return limited

    const parsed = await parseJsonBody(request, tokenRiskRequestSchema, { maxBytes: 1_500 })
    if (parsed.error) return parsed.error

    const contractAddress = parsed.data.contractAddress
    const chainId = normalizeChainId(parsed.data.chainId)

    if (!isAddress(contractAddress)) {
      return apiJson({ error: "Enter a valid token contract address." }, { status: 400 })
    }

    if (!isSupportedChainId(chainId)) {
      return apiJson(
        { error: `Unsupported chain. Choose one of: ${supportedChainNames()}.` },
        { status: 400 },
      )
    }

    const report = await fetchTokenRisk(chainId, contractAddress)
    return apiJson(report)
  } catch {
    return apiJson(
      { error: "Token risk scan failed. Check the token address and chain, then try again." },
      { status: 500 },
    )
  }
}
