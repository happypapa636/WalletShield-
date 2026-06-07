export interface TechSection {
  id: string
  number: string
  title: string
  subtitle: string
  description: string
  ascii: string
  specs: { label: string; value: string }[]
  commands: string[]
}

export const techSections: TechSection[] = [
  {
    id: "dashboard",
    number: "01",
    title: "Dashboard",
    subtitle: "Wallet checkup",
    description:
      "Connect or paste a wallet address, scan live threat sources, and get a readable wallet security score.",
    ascii: "[wallet] -> [rpc] -> [risk engine] -> [score]",
    specs: [
      { label: "Input", value: "EVM wallet" },
      { label: "Output", value: "Score + alerts" },
    ],
    commands: ["$ walletshield scan 0x...", "score: live"],
  },
  {
    id: "approval-manager",
    number: "02",
    title: "Approvals",
    subtitle: "Permission control",
    description:
      "Inspect dangerous token and NFT permissions, then revoke risky spenders directly from the connected wallet.",
    ascii: "[token] -> [spender] -> [allowance] -> [revoke]",
    specs: [
      { label: "ERC-20", value: "approve(spender, 0)" },
      { label: "NFT", value: "setApprovalForAll(false)" },
    ],
    commands: ["$ approvals list", "$ approvals revoke --risky"],
  },
  {
    id: "threat-intelligence",
    number: "03",
    title: "Threat Intel",
    subtitle: "Market signals",
    description:
      "Blend wallet risk with SoSoValue market/news feeds, SSI index stress, scam-campaign searches, and SoDEX read-only context.",
    ascii: "[SoSoValue + SSI + SoDEX] -> [risk context] -> [wallet score]",
    specs: [
      { label: "Market", value: "Snapshots + SSI" },
      { label: "Campaigns", value: "News search" },
    ],
    commands: ["$ intel pull --sosovalue --sodex", "signals: loaded"],
  },
  {
    id: "token-check",
    number: "04",
    title: "Token Probe",
    subtitle: "Scam detection",
    description:
      "Paste a token contract and check honeypot traits, verification, taxes, listing status, and owner controls.",
    ascii: "[contract] -> [token security] -> [risk labels]",
    specs: [
      { label: "Honeypot", value: "Detected" },
      { label: "Controls", value: "Owner, taxes, lists" },
    ],
    commands: ["$ token probe 0x...", "risk labels: live"],
  },
  {
    id: "ai-assistant",
    number: "05",
    title: "AI Assistant",
    subtitle: "Plain English",
    description:
      "Ask what a warning means and get calm next steps without needing to read raw contract data.",
    ascii: "[scan report] -> [OpenAI] -> [plain language]",
    specs: [
      { label: "Mode", value: "Report-aware chat" },
      { label: "Fallback", value: "Local safety answers" },
    ],
    commands: ["$ ask 'why is this risky?'", "answer: plain English"],
  },
  {
    id: "recovery-center",
    number: "06",
    title: "Recovery",
    subtitle: "Incident steps",
    description:
      "Follow a practical recovery checklist when a wallet might be compromised.",
    ascii: "[stop signing] -> [revoke] -> [move assets] -> [rescan]",
    specs: [
      { label: "Mode", value: "Panic-safe" },
      { label: "Goal", value: "Reduce damage" },
    ],
    commands: ["$ recovery plan", "steps: ordered"],
  },
  {
    id: "wave-roadmap",
    number: "07",
    title: "Roadmap",
    subtitle: "Wave 2 shipped",
    description:
      "Show the WaveHack path from MVP scanner to the Wave 2 security platform and future protection network.",
    ascii: "[mvp] -> [wave 2 platform] -> [protection network]",
    specs: [
      { label: "Wave 2", value: "Formula + intel" },
      { label: "Wave 3", value: "Protection network" },
    ],
    commands: ["$ roadmap --wavehack", "status: shipping"],
  },
]

export const navLinks = techSections.map((section) => ({
  id: section.id,
  number: section.number,
  title: section.title,
}))
