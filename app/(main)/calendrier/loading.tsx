import { LoadingRows } from "@/components/common/States";

/**
 * Shaped like the list that is coming, so nothing jumps when it lands.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 space-y-2">
        <div className="h-9 w-56 animate-pulse rounded bg-surface-3" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface-3" />
      </div>
      <div className="flex gap-8">
        <div className="hidden w-64 shrink-0 space-y-3 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-surface-3" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <LoadingRows rows={8} />
        </div>
      </div>
    </div>
  );
}
