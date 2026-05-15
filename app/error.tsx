'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went sideways.</h1>
      <p className="text-sm text-ink-muted mt-2">
        We hit an error fetching live MLB data. It's usually transient.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded border border-line bg-bg-raised hover:bg-bg-hover text-sm"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-3 py-1.5 rounded border border-line text-sm text-ink-muted hover:text-ink"
        >
          Back to League
        </Link>
      </div>
      <pre className="mt-6 text-2xs text-ink-faint text-left bg-bg-sunken border border-line rounded p-3 overflow-x-auto">
        {error.message}
      </pre>
    </div>
  );
}
