import { AdminApp } from "@/components/labeler/AdminApp";
import { LabelHeader } from "@/components/labeler/LabelHeader";
import { pageRpc } from "@/lib/labeler/server/pages";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const { account } = await pageRpc<{ account: { displayName: string } }>("labeler_session", { role: "admin" });
  return (
    <>
      <LabelHeader name={account.displayName} role="admin" home="/label/admin" />
      <AdminApp />
    </>
  );
}
