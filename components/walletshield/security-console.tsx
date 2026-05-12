"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { motion } from "framer-motion"
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
  LockKeyhole,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react"
import { selectableChains } from "@/lib/walletshield/chains"
import type {
  ApprovalItem,
  DataSourceStatus,
  MarketSignal,
  RiskItem,
  ScanReport,
  Severity,
  TokenRiskReport,
} from "@/lib/walletshield/types"

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>
      on?: (event: string, handler: (...args: any[]) => void) => void
      removeListener?: (event: string, handler: (...args: any[]) => void) => void
    }
  }
}

const severityStyles: Record<Severity, string> = {
  critical: "text-[#ff3333] border-[#ff3333]/60 bg-[#ff3333]/10",
  high: "text-[#ff6b4a] border-[#ff6b4a]/50 bg-[#ff6b4a]/10",
  medium: "text-[#f6c65b] border-[#f6c65b]/50 bg-[#f6c65b]/10",
  low: "text-foreground border-border bg-secondary/30",
  info: "text-muted-foreground border-border bg-transparent",
}

const sourceStyles: Record<DataSourceStatus["status"], string> = {
  live: "text-foreground",
  fallback: "text-muted-foreground",
  unconfigured: "text-[#f6c65b]",
  error: "text-[#ff3333]",
}

function shortAddress(value?: string) {
  if (!value) return "unknown"
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "unknown"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp * 1000))
}

function encodeAddress(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function revokeCalldata(approval: ApprovalItem) {
  if (approval.type === "erc20") {
    return `0x095ea7b3${encodeAddress(approval.spenderAddress)}${"0".repeat(64)}`
  }
  return `0xa22cb465${encodeAddress(approval.spenderAddress)}${"0".repeat(64)}`
}

function SectionHeading({
  id,
  eyebrow,
  title,
  copy,
}: {
  id: string
  eyebrow: string
  title: string
  copy: string
}) {
  return (
    <div id={id} className="mb-8 scroll-mt-24">
      <div className="mb-4 flex items-center gap-4">
        <span className="font-mono text-sm text-muted-foreground">{">"}</span>
        <div className="h-px w-12 bg-border" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <h2 className="font-pixel-line text-3xl font-bold tracking-tight text-foreground md:text-5xl">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl font-mono text-sm leading-relaxed text-muted-foreground">
        {copy}
      </p>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: "primary" | "ghost" | "danger"
  type?: "button" | "submit"
}) {
  const className =
    variant === "primary"
      ? "border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground"
      : variant === "danger"
      ? "border-[#ff3333] text-[#ff3333] hover:bg-[#ff3333] hover:text-background"
      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-2 font-mono text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

function ScoreDial({ score, label }: { score: number; label: string }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className="relative flex aspect-square min-h-56 w-full max-w-72 items-center justify-center">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#262626" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#ffffff"
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="text-center">
        <div className="font-pixel-line text-6xl font-bold leading-none text-foreground md:text-7xl">
          {score}
        </div>
        <div className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="border border-dashed border-border p-6">
      <div className="font-mono text-sm text-foreground">{title}</div>
      <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  )
}

export function SecurityConsole() {
  const [address, setAddress] = useState("")
  const [connectedAccount, setConnectedAccount] = useState("")
  const [chainId, setChainId] = useState("1")
  const [report, setReport] = useState<ScanReport | null>(null)
  const [scanError, setScanError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [liveWatch, setLiveWatch] = useState(false)
  const [revokeStatus, setRevokeStatus] = useState("")
  const [tokenAddress, setTokenAddress] = useState("")
  const [tokenReport, setTokenReport] = useState<TokenRiskReport | null>(null)
  const [tokenError, setTokenError] = useState("")
  const [isTokenScanning, setIsTokenScanning] = useState(false)
  const [question, setQuestion] = useState("")
  const [assistantLines, setAssistantLines] = useState<
    Array<{ role: "user" | "assistant"; content: string; source?: string }>
  >([
    {
      role: "assistant",
      content:
        "Ask me why an approval is risky, what to do after a wallet drain, or whether an airdrop looks safe.",
      source: "WalletShield",
    },
  ])
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedChain = useMemo(
    () => selectableChains.find((item) => item.id === chainId) ?? selectableChains[0]!,
    [chainId],
  )

  const connectWallet = useCallback(async () => {
    setScanError("")
    if (!window.ethereum) {
      setScanError("No injected wallet found. Paste an address or install MetaMask/Rabby.")
      return
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
    const activeChain = await window.ethereum.request({ method: "eth_chainId" })
    const account = accounts?.[0] ?? ""
    setConnectedAccount(account)
    setAddress(account)
    setChainId(String(Number.parseInt(activeChain, 16)))
  }, [])

  const runScan = useCallback(
    async (silent = false) => {
      if (!address.trim()) {
        setScanError("Connect a wallet or paste an address first.")
        return
      }

      setIsScanning(true)
      if (!silent) setScanError("")

      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: address.trim(), chainId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? "Wallet scan failed.")
        setReport(payload)
      } catch (error) {
        setScanError(error instanceof Error ? error.message : "Wallet scan failed.")
      } finally {
        setIsScanning(false)
      }
    },
    [address, chainId],
  )

  useEffect(() => {
    if (!window.ethereum?.on) return

    const handleAccounts = (accounts: string[]) => {
      const account = accounts?.[0] ?? ""
      setConnectedAccount(account)
      if (account) setAddress(account)
    }
    const handleChain = (nextChainId: string) => setChainId(String(Number.parseInt(nextChainId, 16)))

    window.ethereum.on("accountsChanged", handleAccounts)
    window.ethereum.on("chainChanged", handleChain)

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccounts)
      window.ethereum?.removeListener?.("chainChanged", handleChain)
    }
  }, [])

  useEffect(() => {
    if (liveTimer.current) clearInterval(liveTimer.current)
    if (liveWatch && address) {
      liveTimer.current = setInterval(() => runScan(true), 60000)
    }
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current)
    }
  }, [address, liveWatch, runScan])

  const revokeApproval = async (approval: ApprovalItem) => {
    setRevokeStatus("")
    if (!window.ethereum || !connectedAccount) {
      setRevokeStatus("Connect the same wallet before revoking.")
      return
    }

    try {
      const activeChain = await window.ethereum.request({ method: "eth_chainId" })
      if (String(Number.parseInt(activeChain, 16)) !== approval.chainId) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${Number(approval.chainId).toString(16)}` }],
        })
      }

      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: connectedAccount,
            to: approval.tokenAddress,
            value: "0x0",
            data: revokeCalldata(approval),
          },
        ],
      })
      setRevokeStatus(`Revoke submitted: ${hash}`)
    } catch (error) {
      setRevokeStatus(error instanceof Error ? error.message : "Revoke transaction rejected.")
    }
  }

  const runTokenProbe = async () => {
    setIsTokenScanning(true)
    setTokenError("")
    setTokenReport(null)
    try {
      const response = await fetch("/api/token-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractAddress: tokenAddress.trim(), chainId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Token scan failed.")
      setTokenReport(payload)
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Token scan failed.")
    } finally {
      setIsTokenScanning(false)
    }
  }

  const askAssistant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanQuestion = question.trim()
    if (!cleanQuestion) return

    setQuestion("")
    setAssistantLines((current) => [...current, { role: "user", content: cleanQuestion }])
    setIsAssistantLoading(true)

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, report }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Assistant failed.")
      setAssistantLines((current) => [
        ...current,
        { role: "assistant", content: payload.answer, source: payload.source },
      ])
    } catch (error) {
      setAssistantLines((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Assistant failed.",
          source: "WalletShield",
        },
      ])
    } finally {
      setIsAssistantLoading(false)
    }
  }

  return (
    <div className="relative">
      <section id="scanner" className="border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="dashboard"
            eyebrow="Live Scanner"
            title="Wallet Security Checkup"
            copy="Connect a wallet or paste an EVM address. WalletShield reads live RPC state, checks approval exposure, pulls threat intelligence, and explains what matters first."
          />

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="border border-border"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Wallet size={16} />
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Wallet Input
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {selectedChain.name}
                </span>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="0x wallet address"
                    className="min-h-11 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                  />
                  <IconButton onClick={connectWallet} variant="ghost">
                    <Wallet size={15} />
                    Connect
                  </IconButton>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <select
                    value={chainId}
                    onChange={(event) => setChainId(event.target.value)}
                    className="min-h-11 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-foreground"
                  >
                    {selectableChains.map((chain) => (
                      <option key={chain.id} value={chain.id}>
                        {chain.name}
                      </option>
                    ))}
                  </select>
                  <IconButton onClick={() => runScan()} disabled={isScanning}>
                    {isScanning ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />}
                    {isScanning ? "Scanning" : "Scan Wallet"}
                  </IconButton>
                </div>

                <button
                  type="button"
                  onClick={() => setLiveWatch((value) => !value)}
                  className={`flex w-full items-center justify-between border px-4 py-3 font-mono text-xs transition-colors ${
                    liveWatch
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radar size={15} />
                    Live Watch
                  </span>
                  <span>{liveWatch ? "ON" : "OFF"}</span>
                </button>

                {connectedAccount && (
                  <div className="border border-border px-4 py-3 font-mono text-xs text-muted-foreground">
                    Connected as <span className="text-foreground">{shortAddress(connectedAccount)}</span>
                  </div>
                )}

                {scanError && (
                  <div className="border border-[#ff3333]/60 bg-[#ff3333]/10 px-4 py-3 font-mono text-xs text-[#ff3333]">
                    {scanError}
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="border border-border"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Security Score
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {report ? new Date(report.scannedAt).toLocaleTimeString() : "waiting"}
                </span>
              </div>

              {report ? (
                <div className="grid gap-4 p-5 md:grid-cols-[auto_1fr]">
                  <ScoreDial score={report.score} label={report.scoreLabel} />
                  <div className="space-y-4">
                    <div className="font-mono text-sm leading-relaxed text-muted-foreground">
                      {report.aiSummary}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="border border-border p-3">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Balance
                        </div>
                        <div className="mt-2 font-mono text-xl text-foreground">
                          {report.nativeBalance} {report.nativeSymbol}
                        </div>
                      </div>
                      <div className="border border-border p-3">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Transactions
                        </div>
                        <div className="mt-2 font-mono text-xl text-foreground">{report.txCount}</div>
                      </div>
                    </div>
                    <a
                      href={`${report.explorer}/address/${report.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View on explorer <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  <EmptyState
                    title="No scan yet"
                    copy="Run a wallet scan to generate the score, alerts, approval inventory, market context, and recovery plan."
                  />
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      <section id="approvals" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="approval-manager"
            eyebrow="Approval Manager"
            title="Danger Permissions"
            copy="Unlimited token approvals and NFT operator permissions are the fastest path from one bad signature to an empty wallet. WalletShield turns them into plain actions."
          />

          {report ? (
            <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-3">
                {report.categories.map((category) => (
                  <div key={category.label} className="border border-border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs text-muted-foreground">{category.label}</span>
                      <span className="font-mono text-sm text-foreground">{category.score}/100</span>
                    </div>
                    <div className="mt-3 h-1.5 bg-border">
                      <div className="h-full bg-foreground" style={{ width: `${category.score}%` }} />
                    </div>
                    <p className="mt-3 font-mono text-xs text-muted-foreground">{category.note}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {report.approvals.length > 0 ? (
                  report.approvals.map((approval) => (
                    <div key={approval.id} className="border border-border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${severityStyles[approval.severity]}`}>
                              {approval.severity}
                            </span>
                            <span className="font-mono text-sm text-foreground">
                              {approval.tokenSymbol}
                              {" -> "}
                              {approval.spenderName}
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-xs text-muted-foreground">
                            {approval.approvedAmount} approved on {formatDate(approval.approvedAt)}
                          </div>
                          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                            Token {shortAddress(approval.tokenAddress)} | Spender {shortAddress(approval.spenderAddress)}
                          </div>
                        </div>
                        <IconButton
                          onClick={() => revokeApproval(approval)}
                          variant={approval.risky ? "danger" : "ghost"}
                        >
                          <Ban size={14} />
                          Revoke
                        </IconButton>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {approval.riskLabels.map((label) => (
                          <span
                            key={`${approval.id}-${label}`}
                            className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No active approvals returned"
                    copy="The approval feed did not return ERC-20, ERC-721, or ERC-1155 permissions for this wallet and chain."
                  />
                )}
                {revokeStatus && (
                  <div className="border border-border p-3 font-mono text-xs text-muted-foreground">
                    {revokeStatus}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState title="Scan first" copy="Approval inventory appears here after the wallet scanner runs." />
          )}
        </div>
      </section>

      <section id="threat-intel" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="threat-intelligence"
            eyebrow="Threat Intelligence"
            title="Market + Scam Context"
            copy="SoSoValue market feeds add context around volatile moments, suspicious narratives, and tokens users may panic-click during fast moves."
          />

          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <AlertTriangle size={15} />
                Top Alerts
              </div>
              {report ? (
                report.risks.map((risk) => <RiskRow key={risk.id} risk={risk} />)
              ) : (
                <EmptyState title="No report loaded" copy="Scan a wallet to see prioritized risk findings." />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <Activity size={15} />
                SoSoValue Signals
              </div>
              {report ? (
                report.marketSignals.map((signal) => <MarketRow key={signal.id} signal={signal} />)
              ) : (
                <EmptyState title="Waiting for scan" copy="Market intelligence loads with the wallet report." />
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="token-probe" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="token-check"
            eyebrow="Scam Token Detector"
            title="Probe Before You Click"
            copy="Paste any token contract to inspect honeypot traits, transfer controls, source verification, listing status, taxes, and holder distribution signals."
          />

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border border-border p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={tokenAddress}
                  onChange={(event) => setTokenAddress(event.target.value)}
                  placeholder="0x token contract"
                  className="min-h-11 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                />
                <IconButton onClick={runTokenProbe} disabled={isTokenScanning}>
                  {isTokenScanning ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />}
                  Check Token
                </IconButton>
              </div>
              {tokenError && (
                <div className="mt-4 border border-[#ff3333]/60 bg-[#ff3333]/10 p-3 font-mono text-xs text-[#ff3333]">
                  {tokenError}
                </div>
              )}
              <div className="mt-6 border-t border-border pt-5 font-mono text-xs leading-relaxed text-muted-foreground">
                This check uses GoPlus token security data. It does not require token approval, wallet signature, or private information.
              </div>
            </div>

            <div className="border border-border p-5">
              {tokenReport ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        {tokenReport.tokenName}
                      </div>
                      <div className="mt-2 font-pixel-line text-4xl text-foreground">
                        {tokenReport.tokenSymbol}
                      </div>
                    </div>
                    <span className={`border px-3 py-2 font-mono text-xs uppercase ${severityStyles[tokenReport.severity]}`}>
                      {tokenReport.score}/100
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tokenReport.riskLabels.map((label) => (
                      <span key={label} className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tokenReport.facts.map((fact) => (
                      <div key={fact.label} className="border border-border p-3">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {fact.label}
                        </div>
                        <div className="mt-2 font-mono text-xs text-foreground">{fact.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState title="No token checked" copy="Paste a token contract to run a live scam-token probe." />
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="assistant" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="ai-assistant"
            eyebrow="AI Explanation"
            title="Plain-English Incident Room"
            copy="Ask what an alert means, what to do next, or how to avoid the same mistake. The assistant uses the current report when available."
          />

          <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Bot size={16} />
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  WalletShield AI
                </span>
              </div>
              <div className="flex h-[28rem] flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {assistantLines.map((line, index) => (
                    <div
                      key={`${line.role}-${index}`}
                      className={`max-w-[90%] border p-3 font-mono text-xs leading-relaxed ${
                        line.role === "user"
                          ? "ml-auto border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {line.content}
                      {line.source && line.role === "assistant" && (
                        <div className="mt-2 text-[10px] uppercase tracking-widest opacity-60">{line.source}</div>
                      )}
                    </div>
                  ))}
                  {isAssistantLoading && (
                    <div className="border border-border p-3 font-mono text-xs text-muted-foreground">
                      Thinking<span className="animate-blink">_</span>
                    </div>
                  )}
                </div>
                <form onSubmit={askAssistant} className="grid gap-3 border-t border-border p-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Why is this risky?"
                    className="min-h-11 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                  />
                  <IconButton type="submit" disabled={isAssistantLoading}>
                    <Zap size={15} />
                    Ask
                  </IconButton>
                </form>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <LockKeyhole size={15} />
                Data Sources
              </div>
              {report ? (
                report.dataSources.map((source) => (
                  <div key={source.name} className="border border-border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs text-foreground">{source.name}</span>
                      <span className={`font-mono text-[10px] uppercase ${sourceStyles[source.status]}`}>
                        {source.status}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{source.detail}</p>
                  </div>
                ))
              ) : (
                <EmptyState title="No source status yet" copy="Run a scan to see which live integrations responded." />
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="recovery" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="recovery-center"
            eyebrow="Recovery Center"
            title="Panic Mode, With Steps"
            copy="When something feels wrong, the app reduces the situation into a clean order of operations so users do not sign their way deeper into trouble."
          />

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border border-border p-5">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <LifeBuoy size={15} />
                Recommended Actions
              </div>
              <div className="mt-5 space-y-3">
                {(report?.recoveryPlan ?? [
                  "Run a wallet scan.",
                  "Review approvals.",
                  "Probe unknown token contracts.",
                  "Ask the assistant about any alert.",
                ]).map((item, index) => (
                  <div key={item} className="flex gap-3 border border-border p-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-mono text-xs leading-relaxed text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border p-5">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <CheckCircle2 size={15} />
                Learning Mode
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Unlimited approval", "A spender can move that token until you revoke or the contract stops existing."],
                  ["Wallet drainer", "A malicious flow that combines social pressure with signatures or approvals."],
                  ["Scam token", "A token designed to bait clicks, approvals, fake claims, or honeypot trades."],
                  ["Fresh wallet", "A wallet with little history. Useful for safety, but harder to score from behavior."],
                ].map(([title, copy]) => (
                  <div key={title} className="border border-border p-4">
                    <div className="font-mono text-xs text-foreground">{title}</div>
                    <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="wave-roadmap"
            eyebrow="WaveHack Roadmap"
            title="From MVP To Security Network"
            copy="Wave 1 proves the useful loop. Wave 2 hardens intelligence and revocation. Wave 3 turns WalletShield into proactive wallet protection."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Wave 1", "Live scan, wallet score, approvals, token probe, SoSoValue context, AI assistant."],
              ["Wave 2", "Deeper forensics, real-time monitors, richer threat database, multi-chain revoke flows."],
              ["Wave 3", "Browser extension, pre-sign warnings, reputation engine, community reports, notification channels."],
            ].map(([title, copy]) => (
              <div key={title} className="border border-border p-5">
                <div className="font-pixel-line text-3xl text-foreground">{title}</div>
                <p className="mt-4 font-mono text-sm leading-relaxed text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function RiskRow({ risk }: { risk: RiskItem }) {
  return (
    <div className="border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${severityStyles[risk.severity]}`}>
          {risk.severity}
        </span>
        <span className="font-mono text-sm text-foreground">{risk.title}</span>
      </div>
      <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{risk.explanation}</p>
      <p className="mt-3 font-mono text-xs text-foreground">{risk.action}</p>
    </div>
  )
}

function MarketRow({ signal }: { signal: MarketSignal }) {
  return (
    <div className="border border-border p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-mono text-sm text-foreground">{signal.title}</div>
          <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">{signal.detail}</p>
        </div>
        <div className="font-mono text-xs text-muted-foreground md:text-right">
          <div>{signal.value}</div>
          {signal.change && <div className={signal.severity === "medium" ? "text-[#f6c65b]" : ""}>{signal.change}</div>}
        </div>
      </div>
      {signal.url && (
        <a
          href={signal.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Source <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}
