import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The access token lives in module state, so each test starts from a fresh copy of the modules.
async function load() {
  vi.resetModules();
  const { db, getMeta, setMeta } = await import('./db.ts');
  const { status } = await import('./state.svelte.ts');
  const { apiFetch, refreshSettled } = await import('./auth.ts');
  await db.delete();
  await db.open();
  await setMeta('refreshToken', 'first');
  return { apiFetch, getMeta, refreshSettled, setMeta, status };
}

const accessToken = () => `x.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 1800 }))}.y`;

/** Records each call and answers the refresh with `refresh`; everything else gets an empty list. */
function server(refresh: (token: string) => Promise<Response> | Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${input}`);
    if (input === '/api/auth/refresh') return refresh(JSON.parse(String(init!.body)).OldRefreshToken);
    return Response.json({ value: [] });
  });
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe('refresh', () => {
  it('wakes the server before using the refresh token, then saves the next one', async () => {
    const { apiFetch, getMeta } = await load();
    const calls = server(() => Response.json({ accessToken: accessToken(), refreshToken: 'second' }));

    await apiFetch('/api/Event');

    expect(calls).toEqual(['HEAD /api/$metadata', 'POST /api/auth/refresh', 'GET /api/Event']);
    expect(await getMeta('refreshToken')).toBe('second');
  });

  it('uses the newer token when another copy of the app refreshed first', async () => {
    const { apiFetch, setMeta, status } = await load();
    server(async token => {
      if (token === 'first') {
        await setMeta('refreshToken', 'from-other-tab');
        return new Response('Refresh token has been revoked', { status: 401 });
      }
      return Response.json({ accessToken: accessToken(), refreshToken: 'third' });
    });

    const response = await apiFetch('/api/Event');

    expect(response.ok).toBe(true);
    expect(status.needsSignIn).toBe(false);
  });

  it('does not ask for a sign-in when the server is having a bad moment', async () => {
    const { apiFetch, getMeta, status } = await load();
    server(() => new Response('Bad request', { status: 400 }));

    await expect(apiFetch('/api/Event')).rejects.toThrow('Refresh failed (400)');

    expect(status.needsSignIn).toBe(false);
    expect(await getMeta('refreshToken')).toBe('first');
  });

  it('holds the update reload until the next token is saved', async () => {
    const { apiFetch, getMeta, refreshSettled } = await load();
    let answer!: () => void;
    server(() => new Promise(resolve =>
      (answer = () => resolve(Response.json({ accessToken: accessToken(), refreshToken: 'second' })))));

    const sync = apiFetch('/api/Event');
    await vi.waitFor(() => expect(answer).toBeDefined());
    let reloaded = false;
    const reload = refreshSettled().then(() => (reloaded = true));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(reloaded).toBe(false);

    answer();
    await reload;
    expect(await getMeta('refreshToken')).toBe('second');
    await sync;
  });

  it('does not spend the refresh token while the server cannot be reached', async () => {
    const { apiFetch, status } = await load();
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      calls.push(input);
      throw new TypeError('Load failed');
    });

    await expect(apiFetch('/api/Event')).rejects.toThrow('Load failed');

    expect(calls).toEqual(['/api/$metadata']);
    expect(status.needsSignIn).toBe(false);
  });
});
