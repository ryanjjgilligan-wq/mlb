export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">
      <div className="h-8 w-64 bg-bg-raised rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 h-96 bg-bg-panel border border-line rounded animate-pulse" />
        <div className="lg:col-span-5 space-y-4">
          <div className="h-44 bg-bg-panel border border-line rounded animate-pulse" />
          <div className="h-44 bg-bg-panel border border-line rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
