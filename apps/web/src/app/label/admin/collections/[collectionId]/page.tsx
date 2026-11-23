import { CollectionAdmin } from "@/components/labeler/CollectionAdmin";
import { LabelHeader } from "@/components/labeler/LabelHeader";
import { pageRpc } from "@/lib/labeler/server/pages";

export const metadata = { title: "Collection" };

export default async function CollectionPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = await params;
  const { account } = await pageRpc<{ account: { displayName: string } }>("labeler_session", { role: "admin" });
  return (
    <>
      <LabelHeader name={account.displayName} role="admin" home="/label/admin" />
      <CollectionAdmin collectionId={collectionId} />
    </>
  );
}
