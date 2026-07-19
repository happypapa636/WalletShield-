"use client"

import { motion } from "framer-motion"

const TECH_ITEMS = [
  "Wallet Scanner",
  "Approval Manager",
  "GoPlus Security",
  "SoSoValue Campaign Radar",
  "SSI Index Context",
  "Macro Risk Calendar",
  "Wave 3 Protection Radar",
  "SoDEX Read-Only Context",
  "Score Formula",
  "OpenAI Explanations",
  "Token Probe",
  "Recovery Center",
  "Live Watch",
  "Ethereum",
  "Polygon",
  "BNB Chain",
  "Arbitrum",
  "Base",
  "Revoke Simulation",
  "Wave 3 Platform",
  "Next.js 16",
]

export function TechTicker() {
  return (
    <div className="overflow-hidden border-y border-border py-3" aria-label="Technology stack ticker">
      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 30,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {[...TECH_ITEMS, ...TECH_ITEMS].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="font-mono text-xs text-muted-foreground"
          >
            {item}
            <span className="ml-8 text-border">{"///"}</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}
