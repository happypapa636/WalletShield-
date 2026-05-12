import type { Metadata, Viewport } from "next"
import { Geist_Mono, Silkscreen } from "next/font/google"
import { GeistPixelLine } from "geist/font/pixel"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-pixel",
})

const geistPixelLine = GeistPixelLine

export const metadata: Metadata = {
  title: "WalletShield AI | Crypto Wallet Security Assistant",
  description:
    "AI-powered crypto wallet security and recovery assistant for live wallet scans, approval risk, token safety, SoSoValue market context, and incident guidance.",
  generator: "v0.app",
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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${geistPixelLine.variable}`}>
      <body
        className={`${geistMono.variable} ${silkscreen.variable} font-mono antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
