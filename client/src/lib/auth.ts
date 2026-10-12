import { db, getMeta, setMeta, syncedTables } from './db.ts';
import { status } from './state.svelte.ts';

const tenantId = 'Ned';
// Android can leave a request hanging while the app is in the background; give up rather than wait.
const authTimeout = 15_000;

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
  status.needsSignIn = false;
}

/** Fetches from the API, refreshing the access token first if needed and once more after a 401. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (Date.now() > accessExpiresAt - 60_000 && !(await refresh()))
    throw new SignInRequired();

  const response = await fetch(path, withToken(init));
  if (response.status !== 401) return response;

  if (!(await refresh())) throw new SignInRequired();
  return fetch(path, withToken(init));
}

/** Each refresh token works once, so concurrent callers share one refresh. */
function refresh(): Promise<boolean> {
  refreshing ??= refreshOnce().finally(() => (refreshing = null));
  return refreshing;
}

async function refreshOnce(): Promise<boolean> {
  const oldRefreshToken = await getMeta<string>('refreshToken');
  if (!oldRefreshToken) {
    status.needsSignIn = true;
    return false;
  }

  // A network failure propagates: being offline is not a reason to ask for a password.
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ TenantId: tenantId, OldRefreshToken: oldRefreshToken }),
    signal: AbortSignal.timeout(authTimeout)
  });
  if (response.status === 401 || response.status === 400) {
    status.needsSignIn = true;
    return false;
  }
  if (!response.ok) throw new Error(`Refresh failed (${response.status})`);

  const body = await response.json();
  useAccessToken(body.accessToken);
  await setMeta('refreshToken', body.refreshToken);
  return true;
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
