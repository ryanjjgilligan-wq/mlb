import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="stat-num text-2xs text-ink-faint uppercase tracking-micro">404</p>
      <h1 className="text-2xl font-semibold tracking-tight mt-2">Not found.</h1>
      <p className="text-sm text-ink-muted mt-2">
        That player, team, or game doesn't exist — or never did.
      </p>
      <Link
        href="/"
        className="inline-block mt-6 px-3 py-1.5 rounded border border-line bg-bg-raised hover:bg-bg-hover text-sm"
      >
        ← Back to League
      </Link>
    </div>
  );
}
