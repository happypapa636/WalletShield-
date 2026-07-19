"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { motion } from "framer-motion"
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileText,
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
import { revokeCalldata } from "@/lib/walletshield/revoke"
import type {
  ApprovalItem,
  DataSourceStatus,
  ForensicsEvent,
  MacroEvent,
  MarketSignal,
  RiskItem,
  ScanReport,
  Severity,
  ThreatCampaign,
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
  critical: "text-[var(--signal-critical)] border-[var(--signal-critical)] bg-[var(--signal-critical-bg)]",
  high: "text-[var(--signal-high)] border-[var(--signal-high)] bg-[var(--signal-high-bg)]",
  medium: "text-[var(--signal-medium)] border-[var(--signal-medium)] bg-[var(--signal-medium-bg)]",
  low: "text-foreground border-border bg-secondary/30",
  info: "text-muted-foreground border-border bg-transparent",
}

const sourceStyles: Record<DataSourceStatus["status"], string> = {
  live: "text-foreground",
  partial: "text-[var(--signal-medium)]",
  fallback: "text-muted-foreground",
  unconfigured: "text-[var(--signal-medium)]",
  rate_limited: "text-[var(--signal-medium)]",
  error: "text-[var(--signal-critical)]",
}

type WorkspaceView = "approvals" | "intel" | "radar" | "token" | "assistant" | "recovery" | "roadmap"

const workspaceViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: "approvals", label: "Approvals" },
  { id: "intel", label: "Intel" },
  { id: "radar", label: "Radar" },
  { id: "token", label: "Token" },
  { id: "assistant", label: "Assistant" },
  { id: "recovery", label: "Recovery" },
  { id: "roadmap", label: "Wave 3" },
]

type ScanHistoryItem = {
  address: string
  chainId: string
  chainName: string
  score: number
  scoreLabel: string
  scannedAt: string
  expiresAt?: number
}

const SCAN_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PROTECTION_WATCHLIST_TTL_MS = 30 * 24 * 60 * 60 * 1000

type ProtectionWatchItem = {
  id: string
  address: string
  chainId: string
  chainName: string
  addedAt: string
  expiresAt?: number
  status: "idle" | "scanning" | "ok" | "error"
  latestScore?: number
  latestLabel?: string
  lastScannedAt?: string
  dataConfidenceLabel?: ScanReport["dataConfidence"]["label"]
  error?: string
}

function shortAddress(value?: string) {
  if (!value) return "unknown"
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function isEvmAddress(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? "")
}

function isSelectableChain(chainId: string) {
  return selectableChains.some((chain) => chain.id === chainId)
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "unknown"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp * 1000))
}

function formatDateString(value?: string) {
  if (!value) return "unknown"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`))
}

function pruneScanHistory(value: unknown): ScanHistoryItem[] {
  if (!Array.isArray(value)) return []
  const now = Date.now()
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const next = item as Partial<ScanHistoryItem>
      if (
        !isEvmAddress(next.address) ||
        !next.chainId ||
        !next.chainName ||
        typeof next.score !== "number" ||
        !next.scoreLabel ||
        !next.scannedAt
      ) {
        return []
      }
      const expiresAt = typeof next.expiresAt === "number" ? next.expiresAt : now + SCAN_HISTORY_TTL_MS
      if (expiresAt <= now) return []
      return [{ ...next, expiresAt } as ScanHistoryItem]
    })
    .slice(0, 8)
}

function saveScanHistory(items: ScanHistoryItem[]) {
  try {
    if (items.length > 0) {
      window.localStorage.setItem("walletshield.scanHistory", JSON.stringify(items))
    } else {
      window.localStorage.removeItem("walletshield.scanHistory")
    }
  } catch {
    // Browser storage can be disabled; scan results still remain visible for the session.
  }
}

function watchlistId(address: string, chainId: string) {
  return `${chainId}:${address.toLowerCase()}`
}

function pruneProtectionWatchlist(value: unknown): ProtectionWatchItem[] {
  if (!Array.isArray(value)) return []
  const now = Date.now()
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const next = item as Partial<ProtectionWatchItem>
      const address = next.address
      if (typeof address !== "string" || !isEvmAddress(address) || !next.chainId || !next.chainName || !next.addedAt) return []
      const expiresAt = typeof next.expiresAt === "number" ? next.expiresAt : now + PROTECTION_WATCHLIST_TTL_MS
      if (expiresAt <= now) return []
      return [
        {
          id: next.id ?? watchlistId(address, next.chainId),
          address,
          chainId: next.chainId,
          chainName: next.chainName,
          addedAt: next.addedAt,
          expiresAt,
          status: next.status === "ok" || next.status === "error" ? next.status : "idle",
          latestScore: typeof next.latestScore === "number" ? next.latestScore : undefined,
          latestLabel: next.latestLabel,
          lastScannedAt: next.lastScannedAt,
          dataConfidenceLabel: next.dataConfidenceLabel,
          error: next.error,
        } satisfies ProtectionWatchItem,
      ]
    })
    .slice(0, 8)
}

function saveProtectionWatchlist(items: ProtectionWatchItem[]) {
  try {
    if (items.length > 0) {
      window.localStorage.setItem("walletshield.protectionWatchlist", JSON.stringify(items))
    } else {
      window.localStorage.removeItem("walletshield.protectionWatchlist")
    }
  } catch {
    // Browser storage can be disabled; the in-memory list still works for the session.
  }
}

function assistantReportContext(report: ScanReport | null) {
  if (!report) return null
  return {
    address: shortAddress(report.address),
    chainName: report.chainName,
    score: report.score,
    scoreLabel: report.scoreLabel,
    risks: report.risks.slice(0, 6).map((risk) => ({
      severity: risk.severity,
      title: risk.title,
      source: risk.source,
      action: risk.action,
    })),
    approvals: report.approvals
      .filter((approval) => approval.risky)
      .slice(0, 5)
      .map((approval) => ({
        type: approval.type,
        tokenSymbol: approval.tokenSymbol,
        spender: shortAddress(approval.spenderAddress),
        severity: approval.severity,
        riskLabels: approval.riskLabels.slice(0, 4),
      })),
    dataSources: report.dataSources.map((source) => ({
      name: source.name,
      status: source.status,
    })),
  }
}

function SectionHeading({
  id,
  eyebrow,
  showLabel = false,
  title,
  copy,
}: {
  id: string
  eyebrow: string
  showLabel?: boolean
  title: string
  copy: string
}) {
  return (
    <div id={id} className="mb-8 scroll-mt-24">
      {showLabel && (
        <div className="mb-4 flex items-center gap-4">
          <span className="font-mono text-sm text-muted-foreground">{">"}</span>
          <div className="h-px w-12 bg-border" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </span>
        </div>
      )}
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
      ? "border-[var(--signal-critical)] text-[var(--signal-critical)] hover:bg-[var(--signal-critical)] hover:text-background"
      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-2 font-mono text-xs transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 ${className}`}
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
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--foreground)"
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
  const [activeView, setActiveView] = useState<WorkspaceView>("approvals")
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([])
  const [watchlistAddress, setWatchlistAddress] = useState("")
  const [protectionWatchlist, setProtectionWatchlist] = useState<ProtectionWatchItem[]>([])
  const [watchlistStatus, setWatchlistStatus] = useState("")
  const [isWatchlistScanning, setIsWatchlistScanning] = useState(false)
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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("walletshield.scanHistory")
      if (stored) {
        const next = pruneScanHistory(JSON.parse(stored))
        setScanHistory(next)
        if (next.length > 0) {
          window.localStorage.setItem("walletshield.scanHistory", JSON.stringify(next))
        } else {
          window.localStorage.removeItem("walletshield.scanHistory")
        }
      }
    } catch {
      setScanHistory([])
    }
  }, [])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("walletshield.protectionWatchlist")
      if (stored) {
        const next = pruneProtectionWatchlist(JSON.parse(stored))
        setProtectionWatchlist(next)
        saveProtectionWatchlist(next)
      }
    } catch {
      setProtectionWatchlist([])
    }
  }, [])

  useEffect(() => {
    const sectionToView: Record<string, WorkspaceView> = {
      "approval-manager": "approvals",
      "threat-intelligence": "intel",
      "protection-radar": "radar",
      "token-check": "token",
      "ai-assistant": "assistant",
      "recovery-center": "recovery",
      "wave-roadmap": "roadmap",
    }
    const applySectionView = (id: string) => {
      const nextView = sectionToView[id]
      if (nextView) {
        setActiveView(nextView)
        window.setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 50)
      }
    }
    const handleView = (event: Event) => applySectionView((event as CustomEvent<string>).detail)
    const handleHash = () => applySectionView(window.location.hash.replace(/^#/, ""))

    window.addEventListener("walletshield:setView", handleView)
    window.addEventListener("hashchange", handleHash)
    handleHash()
    return () => {
      window.removeEventListener("walletshield:setView", handleView)
      window.removeEventListener("hashchange", handleHash)
    }
  }, [])

  const connectWallet = useCallback(async () => {
    setScanError("")
    if (!window.ethereum) {
      setScanError("No injected wallet found. Paste an address or install MetaMask/Rabby.")
      return
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
      const activeChain = await window.ethereum.request({ method: "eth_chainId" })
      const account = accounts?.[0] ?? ""
      const nextChainId = String(Number.parseInt(activeChain, 16))
      setConnectedAccount(account)
      setAddress(account)
      if (isSelectableChain(nextChainId)) {
        setChainId(nextChainId)
      } else {
        setScanError("Connected wallet is on an unsupported chain. Choose a supported chain in the scanner before scanning.")
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Wallet connection was rejected.")
    }
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
        setProtectionWatchlist((current) => {
          const next = current.map((item) =>
            item.id === watchlistId(payload.address, payload.chainId)
              ? {
                  ...item,
                  status: "ok" as const,
                  latestScore: payload.score,
                  latestLabel: payload.scoreLabel,
                  lastScannedAt: payload.scannedAt,
                  dataConfidenceLabel: payload.dataConfidence.label,
                  error: undefined,
                }
              : item,
          )
          saveProtectionWatchlist(next)
          return next
        })
        const historyItem: ScanHistoryItem = {
          address: payload.address,
          chainId: payload.chainId,
          chainName: payload.chainName,
          score: payload.score,
          scoreLabel: payload.scoreLabel,
          scannedAt: payload.scannedAt,
          expiresAt: Date.now() + SCAN_HISTORY_TTL_MS,
        }
        setScanHistory((current) => {
          const next = pruneScanHistory([
            historyItem,
            ...current.filter(
              (item) =>
                item.address.toLowerCase() !== historyItem.address.toLowerCase() ||
                item.chainId !== historyItem.chainId,
            ),
          ])
          saveScanHistory(next)
          return next
        })
      } catch (error) {
        setScanError(error instanceof Error ? error.message : "Wallet scan failed.")
      } finally {
        setIsScanning(false)
      }
    },
    [address, chainId],
  )

  const addWatchlistWallet = () => {
    const nextAddress = watchlistAddress.trim()
    setWatchlistStatus("")
    if (!isEvmAddress(nextAddress)) {
      setWatchlistStatus("Enter a valid EVM wallet address before adding it to the protection radar.")
      return
    }

    const item: ProtectionWatchItem = {
      id: watchlistId(nextAddress, selectedChain.id),
      address: nextAddress,
      chainId: selectedChain.id,
      chainName: selectedChain.name,
      addedAt: new Date().toISOString(),
      expiresAt: Date.now() + PROTECTION_WATCHLIST_TTL_MS,
      status: "idle",
    }

    setProtectionWatchlist((current) => {
      const next = pruneProtectionWatchlist([
        item,
        ...current.filter((currentItem) => currentItem.id !== item.id),
      ])
      saveProtectionWatchlist(next)
      return next
    })
    setWatchlistAddress("")
    setWatchlistStatus("Wallet added. Run a watchlist scan to refresh its live score.")
  }

  const removeWatchlistWallet = (id: string) => {
    setProtectionWatchlist((current) => {
      const next = current.filter((item) => item.id !== id)
      saveProtectionWatchlist(next)
      return next
    })
  }

  const clearWatchlist = () => {
    setProtectionWatchlist([])
    saveProtectionWatchlist([])
    setWatchlistStatus("Protection watchlist cleared from this browser.")
  }

  const scanWatchlistWallet = async (target: ProtectionWatchItem) => {
    setProtectionWatchlist((current) => {
      const next = current.map((item) =>
        item.id === target.id ? { ...item, status: "scanning" as const, error: undefined } : item,
      )
      saveProtectionWatchlist(next)
      return next
    })

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: target.address, chainId: target.chainId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Watchlist scan failed.")

      setProtectionWatchlist((current) => {
        const next = current.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: "ok" as const,
                latestScore: payload.score,
                latestLabel: payload.scoreLabel,
                lastScannedAt: payload.scannedAt,
                dataConfidenceLabel: payload.dataConfidence.label,
                error: undefined,
              }
            : item,
        )
        saveProtectionWatchlist(next)
        return next
      })
    } catch (error) {
      setProtectionWatchlist((current) => {
        const next = current.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Watchlist scan failed.",
              }
            : item,
        )
        saveProtectionWatchlist(next)
        return next
      })
    }
  }

  const scanWatchlist = async () => {
    if (protectionWatchlist.length === 0) {
      setWatchlistStatus("Add at least one wallet before running a protection radar scan.")
      return
    }
    setIsWatchlistScanning(true)
    setWatchlistStatus("")
    for (const item of protectionWatchlist) {
      await scanWatchlistWallet(item)
    }
    setIsWatchlistScanning(false)
    setWatchlistStatus("Watchlist scan finished. Review any low-confidence or exposed wallets.")
  }

  useEffect(() => {
    if (!window.ethereum?.on) return

    const handleAccounts = (accounts: string[]) => {
      const account = accounts?.[0] ?? ""
      setConnectedAccount(account)
      if (account) setAddress(account)
    }
    const handleChain = (nextChainId: string) => {
      const parsedChainId = String(Number.parseInt(nextChainId, 16))
      if (isSelectableChain(parsedChainId)) {
        setChainId(parsedChainId)
        setScanError("")
      } else {
        setScanError("Connected wallet switched to an unsupported chain. Choose Ethereum, BNB Smart Chain, Polygon, Arbitrum, or Base before scanning.")
      }
    }

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
    if (report?.address && connectedAccount.toLowerCase() !== report.address.toLowerCase()) {
      setRevokeStatus("Connect the scanned wallet before revoking this approval.")
      return
    }
    if (!isEvmAddress(approval.tokenAddress) || !isEvmAddress(approval.spenderAddress)) {
      setRevokeStatus("This approval has an invalid token or spender address. Open the explorer and revoke manually.")
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

      const tx = {
        from: connectedAccount,
        to: approval.tokenAddress,
        value: "0x0",
        data: revokeCalldata(approval),
      }

      setRevokeStatus("Simulation running: checking whether this revoke call will revert.")
      await window.ethereum.request({
        method: "eth_call",
        params: [tx, "latest"],
      })

      setRevokeStatus("Simulation passed. Estimating gas before wallet confirmation.")
      const gas = await window.ethereum.request({
        method: "eth_estimateGas",
        params: [tx],
      })

      setRevokeStatus("Simulation and gas estimate passed. Confirm the revoke transaction in your wallet.")
      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ ...tx, gas }],
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
        body: JSON.stringify({ question: cleanQuestion, report: assistantReportContext(report) }),
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
            showLabel
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
                    className="min-h-11 min-w-0 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
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
                    className="min-h-11 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
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

                {scanHistory.length > 0 && (
                  <div className="border border-border p-3">
                    <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Clock3 size={13} />
                        Local scan history
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          saveScanHistory([])
                          setScanHistory([])
                        }}
                        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-2">
                      {scanHistory.slice(0, 3).map((item) => (
                        <button
                          key={`${item.address}-${item.chainId ?? item.chainName}`}
                          type="button"
                          onClick={() => {
                            const savedChainId =
                              item.chainId ??
                              selectableChains.find((chain) => chain.name === item.chainName)?.id
                            setAddress(item.address)
                            if (savedChainId) setChainId(savedChainId)
                          }}
                          className="flex w-full items-center justify-between gap-3 border border-border px-3 py-2 text-left font-mono text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
                        >
                          <span>{shortAddress(item.address)} | {item.chainName}</span>
                          <span className="text-foreground">{item.score}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {scanError && (
                  <div className="border border-[var(--signal-critical)] bg-[var(--signal-critical-bg)] px-4 py-3 font-mono text-xs text-[var(--signal-critical)]">
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
                    <div
                      className={`border p-3 ${
                        report.dataConfidence.label === "low"
                          ? "border-[var(--signal-critical)] bg-[var(--signal-critical-bg)]"
                          : report.dataConfidence.label === "medium"
                            ? "border-[var(--signal-medium)] bg-[var(--signal-medium-bg)]"
                            : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Data Confidence
                        </div>
                        <div className="font-mono text-xs uppercase text-foreground">
                          {report.dataConfidence.score}/100 {report.dataConfidence.label}
                        </div>
                      </div>
                      <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {report.dataConfidence.warnings.length
                          ? report.dataConfidence.warnings.join(" ")
                          : "All core scan sources responded."}
                      </p>
                    </div>
                    <div className="border border-border p-3">
                      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <FileText size={13} />
                        Score Formula
                      </div>
                      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {report.scoreFormula.formula}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {report.scoreFormula.weights.map((item) => (
                          <div key={item.label} className="border border-border px-3 py-2 font-mono text-[11px]">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="text-foreground">{Math.round(item.weight * 100)}%</span>
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {item.score}/100 to {item.contribution.toFixed(1)} pts
                            </div>
                          </div>
                        ))}
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

      <section id="workspace" className="sticky top-[73px] z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 lg:px-8">
          {workspaceViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                setActiveView(view.id)
                window.setTimeout(() => {
                  document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }, 0)
              }}
              className={`min-h-10 shrink-0 border px-4 font-mono text-xs uppercase tracking-widest transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                activeView === view.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      </section>

      <section id="approvals" className={activeView === "approvals" ? "border-b border-border" : "hidden"}>
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="approval-manager"
            eyebrow="Approval Manager"
            title="Dangerous Permissions"
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
                <div className="border border-border p-4">
                  <div className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Score Deductions
                  </div>
                  {report.scoreFormula.deductions.length > 0 ? (
                    <div className="space-y-2">
                      {report.scoreFormula.deductions.map((factor) => (
                        <div key={factor.label} className="border border-border px-3 py-2 font-mono text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-foreground">{factor.label}</span>
                            <span className={severityStyles[factor.severity].split(" ").slice(0, 1).join(" ")}>
                              {factor.impact}
                            </span>
                          </div>
                          <p className="mt-1 leading-relaxed text-muted-foreground">{factor.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground">
                      No material deduction was applied by the current formula.
                    </p>
                  )}
                </div>
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

      <section id="threat-intel" className={activeView === "intel" ? "border-b border-border" : "hidden"}>
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

              <div className="flex items-center gap-2 border-b border-border pt-5 pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <Clock3 size={15} />
                Forensics Timeline
              </div>
              {report ? (
                report.forensics.map((event) => <ForensicsRow key={event.id} event={event} />)
              ) : (
                <EmptyState title="No timeline yet" copy="Run a scan to build approval, reputation, and campaign evidence." />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <Database size={15} />
                Campaign Watch
              </div>
              {report ? (
                report.threatCampaigns.length > 0 ? (
                  report.threatCampaigns.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))
                ) : (
                  <EmptyState title="No campaign match" copy="SoSoValue scam-keyword searches did not return active matches for this scan." />
                )
              ) : (
                <EmptyState title="Waiting for scan" copy="SoSoValue campaign searches load with the wallet report." />
              )}

              <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <Activity size={15} />
                Market Signals
              </div>
              {report ? (
                report.marketSignals.length > 0 ? (
                  report.marketSignals.map((signal) => <MarketRow key={signal.id} signal={signal} />)
                ) : (
                  <EmptyState title="No market signals" copy="SoSoValue did not return usable market signals for this scan." />
                )
              ) : (
                <EmptyState title="Waiting for scan" copy="Market intelligence loads with the wallet report." />
              )}

              <div className="flex items-center gap-2 border-b border-border pt-5 pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <LockKeyhole size={15} />
                SoDEX Read-Only Context
              </div>
              {report ? (
                report.dexSignals.length > 0 ? (
                  report.dexSignals.map((signal) => <MarketRow key={signal.id} signal={signal} />)
                ) : (
                  <EmptyState title="No SoDEX signal" copy="SoDEX public market and signing-key checks returned no extra signal." />
                )
              ) : (
                <EmptyState title="Waiting for scan" copy="SoDEX spot/perps and account-key context loads with the wallet report." />
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="radar" className={activeView === "radar" ? "border-b border-border" : "hidden"}>
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="protection-radar"
            eyebrow="Wave 3 Protection Radar"
            showLabel
            title="Proactive Wallet Watch"
            copy="Track user-supplied wallets, rescan them through the live scanner, and combine wallet risk with SoSoValue macro and campaign context before users sign during volatile moments."
          />

          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-border p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Data Confidence
                  </div>
                  <div className="mt-2 font-pixel-line text-3xl text-foreground">
                    {report ? report.dataConfidence.label : "—"}
                  </div>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    {report
                      ? `${report.dataConfidence.score}/100 source coverage`
                      : "Run a scan to evaluate source coverage."}
                  </p>
                </div>
                <div className="border border-border p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Campaign Matches
                  </div>
                  <div className="mt-2 font-pixel-line text-3xl text-foreground">
                    {report ? report.threatCampaigns.length : "—"}
                  </div>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    SoSoValue scam-keyword matches tied to the current scan context.
                  </p>
                </div>
                <div className="border border-border p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Macro Events
                  </div>
                  <div className="mt-2 font-pixel-line text-3xl text-foreground">
                    {report ? report.macroEvents.length : "—"}
                  </div>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    SoSoValue macro calendar items that can raise phishing urgency risk.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <Clock3 size={15} />
                  Macro Risk Calendar
                </div>
                {report ? (
                  report.macroEvents.length > 0 ? (
                    report.macroEvents.map((event) => <MacroEventRow key={event.id} event={event} />)
                  ) : (
                    <EmptyState
                      title="No macro events returned"
                      copy="The current SoSoValue macro calendar call returned no events, or the source is unconfigured/rate limited."
                    />
                  )
                ) : (
                  <EmptyState title="Scan first" copy="Macro risk context loads with the wallet report." />
                )}
              </div>

              {report?.dataConfidence.warnings.length ? (
                <div className="space-y-2">
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Coverage Warnings
                  </div>
                  {report.dataConfidence.warnings.map((warning) => (
                    <div key={warning} className="border border-[var(--signal-medium)] p-3 font-mono text-xs text-[var(--signal-medium)]">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="border border-border p-5">
              <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    <Radar size={15} />
                    Local Wallet Watchlist
                  </div>
                  <p className="mt-2 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">
                    Add public wallet addresses from this browser. WalletShield does not create accounts, send alerts, or store private data server-side.
                  </p>
                </div>
                <IconButton onClick={scanWatchlist} disabled={isWatchlistScanning || protectionWatchlist.length === 0}>
                  {isWatchlistScanning ? <RefreshCw className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                  Scan All
                </IconButton>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={watchlistAddress}
                  onChange={(event) => setWatchlistAddress(event.target.value)}
                  placeholder="0x wallet to monitor"
                  className="min-h-11 min-w-0 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
                />
                <select
                  value={chainId}
                  onChange={(event) => setChainId(event.target.value)}
                  className="min-h-11 border border-border bg-background px-3 font-mono text-xs text-foreground outline-none transition-colors focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
                  aria-label="Watchlist chain"
                >
                  {selectableChains.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
                <IconButton onClick={addWatchlistWallet}>
                  <Wallet size={15} />
                  Add
                </IconButton>
              </div>

              {watchlistStatus && (
                <div className="mt-4 border border-border p-3 font-mono text-xs text-muted-foreground">
                  {watchlistStatus}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {protectionWatchlist.length > 0 ? (
                  protectionWatchlist.map((item) => (
                    <ProtectionWatchRow
                      key={item.id}
                      item={item}
                      disabled={isWatchlistScanning}
                      onScan={() => scanWatchlistWallet(item)}
                      onRemove={() => removeWatchlistWallet(item.id)}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="No watched wallets"
                    copy="Add a public address to build a browser-local protection list. No sample wallets are preloaded."
                  />
                )}
              </div>

              {protectionWatchlist.length > 0 && (
                <button
                  type="button"
                  onClick={clearWatchlist}
                  className="mt-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
                >
                  Clear local watchlist
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="token-probe" className={activeView === "token" ? "border-b border-border" : "hidden"}>
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
                  className="min-h-11 min-w-0 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
                />
                <IconButton onClick={runTokenProbe} disabled={isTokenScanning}>
                  {isTokenScanning ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />}
                  Check Token
                </IconButton>
              </div>
              {tokenError && (
                <div className="mt-4 border border-[var(--signal-critical)] bg-[var(--signal-critical-bg)] p-3 font-mono text-xs text-[var(--signal-critical)]">
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

      <section id="assistant" className={activeView === "assistant" ? "border-b border-border" : "hidden"}>
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
              <div className="border-b border-border px-4 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                AI answers use a redacted scan digest. Full wallet and spender addresses are shortened before model requests.
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
                    className="min-h-11 min-w-0 border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground"
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

      <section id="recovery" className={activeView === "recovery" ? "border-b border-border" : "hidden"}>
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
              {report?.scoreFormula.validationNotes && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Model Limits
                  </div>
                  <div className="space-y-2">
                    {report.scoreFormula.validationNotes.map((note) => (
                      <div key={note} className="border border-border p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className={activeView === "roadmap" ? "border-b border-border" : "hidden"}>
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            id="wave-roadmap"
            eyebrow="WaveHack Roadmap"
            title="From MVP To Security Network"
            copy="Wave 1 proves the useful loop. Wave 2 hardens intelligence and revocation. Wave 3 ships proactive web protection while larger browser and community surfaces stay clearly marked as future infrastructure."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Wave 1", "Live scan, wallet score, approvals, token probe, SoSoValue context, AI assistant."],
              ["Wave 2", "Score formula, SoSoValue campaign watch, SSI index context, SoDEX market data, local history, revoke simulation."],
              ["Wave 3", "Protection Radar, SoSoValue macro calendar, browser-local multi-wallet watchlist, source-confidence warnings."],
              ["Future", "Browser extension, pre-sign warnings, community reports, notification channels, and developer API."],
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

function CampaignRow({ campaign }: { campaign: ThreatCampaign }) {
  return (
    <div className="border border-border p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${severityStyles[campaign.severity]}`}>
              {campaign.severity}
            </span>
            <span className="font-mono text-sm text-foreground">{campaign.title}</span>
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{campaign.detail}</p>
        </div>
        <div className="font-mono text-xs text-muted-foreground md:text-right">
          {campaign.mentionCount} mention{campaign.mentionCount === 1 ? "" : "s"}
          <div className="mt-1 text-[10px] uppercase tracking-widest">{campaign.keyword}</div>
        </div>
      </div>
      {campaign.url && (
        <a
          href={campaign.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          SoSoValue source <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

function MacroEventRow({ event }: { event: MacroEvent }) {
  return (
    <div className="border border-border p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${severityStyles[event.severity]}`}>
              {event.severity}
            </span>
            <span className="font-mono text-sm text-foreground">{event.eventName}</span>
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{event.detail}</p>
        </div>
        <div className="font-mono text-xs text-muted-foreground md:text-right">
          {formatDateString(event.date)}
          <div className="mt-1 text-[10px] uppercase tracking-widest">{event.source}</div>
        </div>
      </div>
    </div>
  )
}

function ForensicsRow({ event }: { event: ForensicsEvent }) {
  return (
    <div className="border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`border px-2 py-1 font-mono text-[10px] uppercase ${severityStyles[event.severity]}`}>
          {event.severity}
        </span>
        <span className="font-mono text-sm text-foreground">{event.title}</span>
      </div>
      <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{event.detail}</p>
      {event.action && <p className="mt-3 font-mono text-xs text-foreground">{event.action}</p>}
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{event.source}</span>
        {event.observedAt && <span>{new Date(event.observedAt).toLocaleString()}</span>}
        {event.explorerUrl && (
          <a href={event.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            Open source <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  )
}

function ProtectionWatchRow({
  item,
  disabled,
  onScan,
  onRemove,
}: {
  item: ProtectionWatchItem
  disabled: boolean
  onScan: () => void
  onRemove: () => void
}) {
  const statusClass =
    item.status === "ok"
      ? "text-foreground"
      : item.status === "error"
      ? "text-[var(--signal-critical)]"
      : item.status === "scanning"
      ? "text-[var(--signal-medium)]"
      : "text-muted-foreground"

  return (
    <div className="border border-border p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-[10px] uppercase tracking-widest ${statusClass}`}>
              {item.status}
            </span>
            <span className="break-all font-mono text-sm text-foreground">{shortAddress(item.address)}</span>
            <span className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {item.chainName}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{item.address}</p>
          {item.error && <p className="mt-3 font-mono text-xs text-[var(--signal-critical)]">{item.error}</p>}
          {item.lastScannedAt && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Last scanned {new Date(item.lastScannedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <div className="font-pixel-line text-3xl text-foreground">
              {typeof item.latestScore === "number" ? item.latestScore : "—"}
            </div>
            <div>{item.latestLabel ?? "Not scanned"}</div>
            {item.dataConfidenceLabel && <div>confidence: {item.dataConfidenceLabel}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton onClick={onScan} disabled={disabled || item.status === "scanning"} variant="ghost">
              {item.status === "scanning" ? <RefreshCw className="animate-spin" size={14} /> : <Search size={14} />}
              Scan
            </IconButton>
            <IconButton onClick={onRemove} disabled={disabled} variant="danger">
              <Ban size={14} />
              Remove
            </IconButton>
          </div>
        </div>
      </div>
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
          {signal.change && <div className={signal.severity === "medium" ? "text-[var(--signal-medium)]" : ""}>{signal.change}</div>}
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
