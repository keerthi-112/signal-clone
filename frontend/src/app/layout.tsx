import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import { Providers } from "@/components/Providers";
import { THEME_BOOT_SCRIPT } from "@/lib/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal",
  description: "Signal clone — private messaging.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
