// Placeholder cards shown while a route search is in flight, so the layout
// doesn't jump when real results (RouteResults) replace it.
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="h-5 w-40 rounded bg-slate-200" />
        <div className="h-5 w-14 rounded bg-slate-200" />
      </div>
      <div className="mb-4 flex gap-2">
        <div className="h-4 w-16 rounded bg-slate-200" />
        <div className="h-4 w-20 rounded bg-slate-200" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
      </div>
    </div>
  )
}

function RouteResultsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Finding routes">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

export default RouteResultsSkeleton
