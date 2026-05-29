import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "ArgonVault — Zero-knowledge encrypted file vault",
  description:
    "Argon2id + AES-256-GCM, end-to-end in your browser. The server holds your ciphertext and cannot read your files, your filenames, or your password.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
