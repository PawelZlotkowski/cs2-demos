import { ClipReview, type ClipData } from "@/components/labeler/ClipReview";
import { LabelHeader } from "@/components/labeler/LabelHeader";
import { pageRpc } from "@/lib/labeler/server/pages";

export const metadata = { title: "Review clip" };

export default async function ReviewPage({ params }: { params: Promise<{ collectionId: string; clipId: string }> }) {
  const { collectionId, clipId } = await params;
  const data = await pageRpc<ClipData>("labeler_reviewer_clip", { collectionId, clipId });
  return (
    <>
      <LabelHeader name={data.account.displayName} role={data.account.role} home="/label" />
      <ClipReview key={clipId} data={data} />
    </>
  );
}
