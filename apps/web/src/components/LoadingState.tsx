/** Static silhouettes keep loading distinct from empty data, including with reduced motion. */
export function LoadingState({ label, shape = "rows" }: {
  label: string;
  shape?: "rows" | "folder" | "stage";
}) {
  return <div className="loading-state" data-shape={shape} role="status">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="loading-shape"><i /><i /><i /></div>
  </div>;
}
