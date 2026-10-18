import { db, getMeta, setMeta, syncedTables } from './db.ts';
import { status } from './state.svelte.ts';

const tenantId = 'Ned';
// Android can leave a request hanging while the app is in the background; give up rather than wait.
const authTimeout = 15_000;
// The server sleeps when nobody has used it for a while, and waking it can take longer than authTimeout.
// A refresh token works only once, so giving up on a refresh the server did answer leaves the phone holding
// a spent token: it is signed out. So each refresh first wakes the server with a request that changes nothing.
const wakeTimeout = 60_000;
const refreshTimeout = 30_000;

// The access token lives in memory only. The refresh token is in IndexedDB so phones stay signed in.
let accessToken = '';
let accessExpiresAt = 0;
let refreshing: Promise<boolean> | null = null;

export class SignInRequired extends Error {
  constructor() {
    super('Sign in to sync');
  }
}

export async function loadUser() {
  status.user = (await getMeta<string>('user')) ?? '';
  status.guest = (await getMeta<boolean>('guest')) ?? false;
}

/** Uses the app without an account. Signing in later keeps everything logged so far and syncs it. */
export async function skipSignIn() {
  await setMeta('guest', true);
  status.guest = true;
}

/** Returns an error message, or an empty string when signed in. Signing in never touches local data. */
export async function signIn(username: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ TenantId: tenantId, Username: username.trim(), Password: password }),
      signal: AbortSignal.timeout(authTimeout)
    });
  } catch {
    return 'No connection. Try again when you are online.';
  }
  if (!response.ok) return (await messageFrom(response)) || 'Could not sign in.';

  const body = await response.json();
  useAccessToken(body.accessToken);
  await setMeta('refreshToken', body.refreshToken);
  await setMeta('user', body.username);
  status.user = body.username;
  status.needsSignIn = false;
  return '';
}

/** Forgets the tokens. Local data stays unless `clearData` is set. */
export async function signOut(clearData: boolean) {
  accessToken = '';
  accessExpiresAt = 0;
  await db.meta.clear();
  if (clearData)
    await Promise.all(syncedTables.map(table => db[table].clear()));
  status.user = '';
  status.guest = false;
  status.needsSignIn = false;
}

/** Fetches from the API, refreshing the access token first if needed and once more after a 401. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (Date.now() > accessExpiresAt - 60_000 && !(await refresh(init.signal)))
    throw new SignInRequired();

  const response = await fetch(path, withToken(init));
  if (response.status !== 401) return response;

  if (!(await refresh(init.signal))) throw new SignInRequired();
  return fetch(path, withToken(init));
}

/**
 * Each refresh token works once, so concurrent callers share one refresh. The caller's signal can abandon
 * waking the server, which is harmless, but never the refresh itself.
 */
function refresh(signal?: AbortSignal | null): Promise<boolean> {
  refreshing ??= refreshOnce(signal).finally(() => (refreshing = null));
  return refreshing;
}

async function refreshOnce(signal?: AbortSignal | null): Promise<boolean> {
  const sent = await getMeta<string>('refreshToken');
  if (!sent) {
    status.needsSignIn = true;
    return false;
  }

  // A network failure propagates: being offline is not a reason to ask for a password.
  const wake = AbortSignal.any([AbortSignal.timeout(wakeTimeout), ...(signal ? [signal] : [])]);
  await fetch('/api/$metadata', { method: 'HEAD', cache: 'no-store', signal: wake });
  let response = await postRefresh(sent);
  if (response.status === 401) {
    // Another copy of the app (a second tab, say) may have used the token first and saved the next one.
    const latest = await getMeta<string>('refreshToken');
    if (latest && latest !== sent) response = await postRefresh(latest);
  }
  // Only a rejected token means signing in again. Anything else is the server having a bad moment.
  if (response.status === 401) {
    status.needsSignIn = true;
    return false;
  }
  if (!response.ok) throw new Error(`Refresh failed (${response.status})`);

  const body = await response.json();
  await setMeta('refreshToken', body.refreshToken);
  useAccessToken(body.accessToken);
  status.needsSignIn = false;
  return true;
}

function postRefresh(refreshToken: string) {
  return fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ TenantId: tenantId, OldRefreshToken: refreshToken }),
    signal: AbortSignal.timeout(refreshTimeout)
  });
}

function useAccessToken(token: string) {
  accessToken = token;
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  accessExpiresAt = payload.exp * 1000;
}

function withToken(init: RequestInit): RequestInit {
  return { ...init, headers: { ...init.headers, authorization: `Bearer ${accessToken}` } };
}

export async function messageFrom(response: Response): Promise<string> {
  const text = await response.text();
  try {
    return errorText(JSON.parse(text)) || text;
  } catch {
    return text;
  }
}

/** The message in a Core error body: a string, `{ text }` or `{ message }`, or a list of those. */
export function errorText(body: unknown): string {
  const first = Array.isArray(body) ? body[0] : body;
  if (typeof first === 'string') return first;
  return first?.text ?? first?.message ?? '';
}
