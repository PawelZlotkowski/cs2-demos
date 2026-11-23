import type { ReactNode } from "react";

export const metadata = { title: "Welcome" };

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return children;
}
