import type { Metadata, Viewport } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistPixelLine } from "geist/font/pixel"
import { Analytics } from "@vercel/analytics/next"
import { MotionSafeProvider } from "@/components/motion-safe-provider"
import "./globals.css"


const geistMono = GeistMono
const geistPixelLine = GeistPixelLine

export const metadata: Metadata = {
  title: "WalletShield AI | Crypto Wallet Security Assistant",
  description:
    "AI-powered crypto wallet security and recovery assistant for live wallet scans, approval risk, token safety, SoSoValue market context, and incident guidance.",
  generator: "WalletShield AI",
  keywords: [
    "wallet security",
    "crypto recovery",
    "approval manager",
    "scam token detector",
    "SoSoValue",
    "SoDEX",
    "WaveHack",
  ],
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
}

export const viewport: Viewport = {
  themeColor: "oklch(0.13 0.01 265)",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"

  return (
    <html lang="en" className={`dark ${geistPixelLine.variable}`}>
      <body className={`${geistMono.variable} font-mono antialiased`}>
        <MotionSafeProvider>
          {children}
          {analyticsEnabled && <Analytics />}
        </MotionSafeProvider>
      </body>
    </html>
  )
}
