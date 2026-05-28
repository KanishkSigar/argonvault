"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, ApiError } from "@/lib/api";
import { getVaultSession } from "@/lib/vaultSession";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    auth
      .me()
      .then(() => {
        // server says we have a session — but we also need the vault key in
        // this tab to actually read anything. If missing, force a fresh login.
        if (getVaultSession()) router.replace("/vault");
        else router.replace("/login");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else router.replace("/login");
      });
  }, [router]);
  return (
    <main className="container">
      <p className="muted">Loading…</p>
    </main>
  );
}
