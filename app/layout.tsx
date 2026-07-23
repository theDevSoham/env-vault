import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Env Vault",
  description: "Zero-knowledge encrypted storage and sharing for .env secrets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 font-sans text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
