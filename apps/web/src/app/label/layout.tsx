import type { ReactNode } from "react";
import { requireLabelerMode } from "@/lib/labeler/server/pages";
import "@/styles/labeler.css";

export const dynamic = "force-dynamic";

export default function LabelLayout({ children }: { children: ReactNode }) {
  requireLabelerMode();
  return <div className="lb-app">{children}</div>;
}
