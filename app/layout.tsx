import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Life OS — your day, your way",
  description: "Log meals in plain words — English, हिन्दी, ಕನ್ನಡ, తెలుగు — and see how your days add up.",
  applicationName: "Life OS",
  appleWebApp: { capable: true, title: "Life OS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={body.variable}>
      <body className="min-h-dvh">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
