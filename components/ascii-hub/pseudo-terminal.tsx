"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { motion } from "framer-motion"

const COMMANDS: Record<string, string[]> = {
  help: [
    "Available commands:",
    "  help       - Show this message",
    "  sections   - List WalletShield modules",
    "  inspect    - Inspect the scanner pipeline",
    "  about      - About WalletShield AI",
    "  stack      - Show tech stack",
    "  clear      - Clear terminal",
    "  ascii      - Show ASCII art",
  ],
  sections: [
    "01  Dashboard",
    "02  Approval Manager",
    "03  Threat Intelligence",
    "04  Token Probe",
    "05  AI Assistant",
    "06  Recovery Center",
    "07  Wave Roadmap",
    "08  Terminal",
  ],
  inspect: [
    "Module: WalletShield AI",
    "Version: Wave 2 Security Platform",
    "Pipelines: RPC + GoPlus + SoSoValue + SSI + SoDEX + OpenAI",
    "Revocation: eth_call simulated wallet transaction",
    "Scoring: public weighted formula",
    "Status: OPERATIONAL",
  ],
  about: [
    "WalletShield AI",
    "",
    "An AI-powered Web3 security assistant that",
    "scans wallets, explains approvals, detects",
    "scam-token risk, and gives recovery steps.",
    "",
    "Never share seed phrases or private keys.",
  ],
  stack: [
    "Frontend:  Next.js 16 + React 19",
    "Styling:   Tailwind CSS 4",
    "Animation: Framer Motion",
    "Security:  GoPlus APIs",
    "Intel:     SoSoValue API + SSI indexes",
    "Trading:   SoDEX read-only REST",
    "AI:        OpenAI Responses API",
  ],
  ascii: [
    "",
    "  ███╗   ███╗ ██████╗ ███╗   ██╗ ██████╗",
    "  ████╗ ████║██╔═══██╗████╗  ██║██╔═══██╗",
    "  ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║",
    "  ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║",
    "  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║╚██████╔╝",
    "  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝",
    "",
  ],
}

interface TerminalLine {
  type: "input" | "output"
  content: string
}

export function PseudoTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", content: 'Welcome to WalletShield AI Terminal' },
    { type: "output", content: 'Type "help" for available commands.' },
    { type: "output", content: "" },
  ])
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const processCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase()
    const baseLines: TerminalLine[] = [
      ...lines,
      { type: "input", content: `$ ${cmd}` },
    ]

    if (trimmed === "clear") {
      setLines([])
      setInput("")
      return
    }

    const newLines: TerminalLine[] = [...baseLines]
    const response = COMMANDS[trimmed]
    if (response) {
      response.forEach((line) => {
        newLines.push({ type: "output", content: line })
      })
    } else if (trimmed === "") {
      // do nothing
    } else {
      newLines.push({ type: "output", content: `command not found: ${trimmed}` })
      newLines.push({ type: "output", content: 'Type "help" for available commands.' })
    }

    newLines.push({ type: "output", content: "" })
    setLines(newLines)
    setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      processCommand(input)
    }
  }

  return (
    <motion.section
      id="terminal"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-muted-foreground">{">"}</span>
          <div className="h-[1px] w-12 bg-border" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Interactive
          </span>
        </div>
        <h2 className="font-pixel-line text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          Terminal
        </h2>
        <p className="max-w-prose font-mono text-sm leading-relaxed text-muted-foreground">
          Explore the system. Type commands to inspect WalletShield modules.
        </p>
      </div>

      <div
        className="border border-border"
        onClick={() => inputRef.current?.focus()}
        role="application"
        aria-label="Interactive pseudo-terminal"
      >
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="h-2.5 w-2.5 bg-foreground" />
          <div className="h-2.5 w-2.5 bg-muted-foreground/50" />
          <div className="h-2.5 w-2.5 bg-muted-foreground/30" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            walletshield ~ interactive
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="h-80 overflow-y-auto bg-secondary/20 p-4"
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className={`font-mono text-xs leading-relaxed ${
                line.type === "input"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {line.content || "\u00A0"}
            </div>
          ))}

          {/* Input line */}
          <div className="relative flex items-center font-mono text-xs text-foreground">
            <span className="mr-1">{"$"}</span>
            <span>{input}</span>
            <span className="animate-blink">{"█"}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="absolute inset-0 h-full w-full cursor-default border-none bg-transparent opacity-0 outline-none"
              aria-label="Terminal input"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </motion.section>
  )
}
