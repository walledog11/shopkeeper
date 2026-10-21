import type { ReactNode } from "react";
import { newsreader } from "@/lib/fonts";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={newsreader.variable}>{children}</div>;
}
