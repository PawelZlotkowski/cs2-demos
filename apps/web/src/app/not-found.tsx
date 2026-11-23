import { NotFound } from "@/components/NotFound";

export const metadata = { title: "Page not found" };

export default function PageNotFound() {
  return <NotFound title="This page isn’t here" detail="Check the address, or open a review from your match library." />;
}
