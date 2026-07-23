import type { Metadata } from "next";
import { Providers } from "@/src/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Env Vault",
  description: "Zero-knowledge encrypted storage and sharing for .env secrets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
