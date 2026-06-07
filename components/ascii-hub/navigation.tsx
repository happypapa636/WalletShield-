"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { navLinks } from "@/lib/sections-data"
import { Menu, X } from "lucide-react"

export function Navigation() {
  const [activeSection, setActiveSection] = useState("")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)

      const scrollPos = window.scrollY + 120

      for (let i = navLinks.length - 1; i >= 0; i--) {
        const section = document.getElementById(navLinks[i].id)
        const sectionTop = section ? section.getBoundingClientRect().top + window.scrollY : 0
        if (section && section.getClientRects().length > 0 && sectionTop <= scrollPos) {
          setActiveSection(navLinks[i].id)
          return
        }
      }
      setActiveSection("")
    }

    const handleHashChange = () => window.setTimeout(handleScroll, 100)

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("hashchange", handleHashChange)
    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [])

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false)
    setActiveSection(id)
    window.dispatchEvent(new CustomEvent("walletshield:setView", { detail: id }))
    setTimeout(() => {
      const el = document.getElementById(id)
      if (el) {
        const offset = 80
        const top = el.getBoundingClientRect().top + window.scrollY - offset
        window.scrollTo({ top, behavior: "smooth" })
      }
    }, 300)
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2 font-mono text-sm text-foreground transition-all duration-200 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          aria-label="Scroll to top"
        >
          <span className="text-muted-foreground">{">"}</span>
          <span className="font-pixel tracking-wider">WALLETSHIELD</span>
        </button>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className={`px-3 py-1.5 font-mono text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                activeSection === link.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground hover:text-background"
              }`}
            >
              <span className="opacity-50">{link.number}</span>{" "}
              {link.title.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 font-mono text-foreground transition-all duration-200 hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none lg:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-background/95 backdrop-blur-md lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollToSection(link.id)}
                  className={`px-3 py-2 text-left font-mono text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                    activeSection === link.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  <span className="opacity-50">{link.number}</span>{" "}
                  {link.title.toUpperCase()}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
