/**
 * Picks persistence — Vercel KV when configured, in-memory otherwise.
 *
 * The track record requires logging predictions at the moment they're made
 * so they can be graded later when game finals come in. Vercel KV (free
 * tier: 30k commands/month, 256MB storage) is more than enough for this
 * use case.
 *
 * If KV env vars (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) are missing the
 * code degrades to a process-local Map. The track record page will show an
 * empty state with setup instructions in that case.
 *
 * Setup: in the Vercel dashboard for this project, Storage tab → Create →
 * KV. Connect to the project. The two env vars auto-populate. Redeploy.
 */

let _kv: any = null;
let _kvAvailable: boolean | null = null;

async function loadKv() {
  if (_kvAvailable !== null) return _kv;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const mod = await import('@vercel/kv');
      _kv = mod.kv;
      _kvAvailable = true;
    } catch {
      _kvAvailable = false;
    }
  } else {
    _kvAvailable = false;
  }
  return _kv;
}

const memStore = new Map<string, unknown>();

export async function getJson<T>(key: string): Promise<T | null> {
  const kv = await loadKv();
  if (kv) {
    try {
      const v = (await kv.get(key)) as T | null | undefined;
      return v ?? null;
    } catch {
      return null;
    }
  }
  return (memStore.get(key) as T | undefined) ?? null;
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const kv = await loadKv();
  if (kv) {
    try {
      await kv.set(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  memStore.set(key, value);
}

export async function listByPrefix(prefix: string): Promise<string[]> {
  const kv = await loadKv();
  if (kv) {
    try {
      const keys: string[] = [];
      let cursor: string | number = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = (await kv.scan(cursor, { match: `${prefix}*`, count: 200 })) as [string | number, string[]];
        cursor = result[0];
        keys.push(...result[1]);
        if (cursor === 0 || cursor === '0') break;
      }
      return keys;
    } catch {
      return [];
    }
  }
  return Array.from(memStore.keys()).filter((k) => k.startsWith(prefix));
}

export async function hasPersistence(): Promise<boolean> {
  await loadKv();
  return _kvAvailable === true;
}
