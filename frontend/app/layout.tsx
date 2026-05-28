import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ArgonVault",
  description: "Zero-knowledge encrypted file vault. Your files. Your keys. Nobody else's.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
