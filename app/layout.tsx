import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Life OS — your day, your way",
  description: "Log meals in plain words — English, हिन्दी, ಕನ್ನಡ, తెలుగు — and see how your days add up.",
  applicationName: "Life OS",
  appleWebApp: { capable: true, title: "Life OS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1b110c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
