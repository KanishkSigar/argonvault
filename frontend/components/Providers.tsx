"use client";

import { ReactNode } from "react";
import { Cursor } from "./Cursor";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <Cursor />
      {children}
    </ToastProvider>
  );
}
