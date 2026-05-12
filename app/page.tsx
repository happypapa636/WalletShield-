import { Navigation } from "@/components/ascii-hub/navigation"
import { HeroSection } from "@/components/ascii-hub/hero-section"
import { TechTicker } from "@/components/ascii-hub/tech-ticker"
import { PseudoTerminal } from "@/components/ascii-hub/pseudo-terminal"
import { Footer } from "@/components/ascii-hub/footer"
import { SecurityConsole } from "@/components/walletshield/security-console"

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <main>
        <HeroSection />

        <TechTicker />

        <SecurityConsole />

        <PseudoTerminal />
      </main>

      <Footer />
    </div>
  )
}
