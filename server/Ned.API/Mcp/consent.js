// The OAuth consent step: sign in as a parent, then allow or deny the app. Core's authorize endpoint sends the
// browser here with its own URL as returnUrl, and finishes the flow when the browser goes back to it.
const returnUrl = new URLSearchParams(location.search).get('returnUrl') ?? '';
const $ = id => document.getElementById(id);
let accessToken = '';
let clientId = '';

function authorizeUrl() {
  try {
    const url = new URL(returnUrl);
    return url.origin === location.origin && url.pathname === '/connect/authorize' ? url : null;
  } catch {
    return null;
  }
}

function showError(message) {
  $('error').textContent = message;
}

async function messageFrom(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    const first = Array.isArray(body) ? body[0] : body;
    return typeof first === 'string' ? first : first?.text ?? first?.message ?? first?.title ?? text;
  } catch {
    return text;
  }
}

function api(path, init = {}) {
  return fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, ...init.headers }
  });
}

function finish(consent) {
  location.assign(`${returnUrl}&benevia_consent=${consent}`);
}

async function signIn(event) {
  event.preventDefault();
  showError('');
  const response = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ TenantId: 'Ned', Username: $('username').value.trim(), Password: $('password').value })
  });
  if (!response.ok) return showError((await messageFrom(response)) || 'Could not sign in.');
  accessToken = (await response.json()).accessToken;

  const scope = authorizeUrl().searchParams.get('scope') ?? '';
  const info = await api(`/api/oauth/consent/info?clientId=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}`);
  if (!info.ok) return showError(await messageFrom(info));
  $('client').textContent = (await info.json()).clientName;
  $('sign-in').hidden = true;
  $('consent').hidden = false;
}

async function allow() {
  showError('');
  // Never the delete scope: Ned deletes by setting Deleted, so the other phone hears about it.
  const scopes = $('write').checked ? ['benevia.read', 'benevia.write'] : ['benevia.read'];
  const response = await api('/api/oauth/consent/approve', { method: 'POST', body: JSON.stringify({ scopes, clientId }) });
  if (!response.ok) return showError(await messageFrom(response));
  finish('approve');
}

const url = authorizeUrl();
clientId = url?.searchParams.get('client_id') ?? '';
if (!url || !clientId) {
  showError('This link did not come from Ned. Start connecting again from the app.');
} else {
  $('sign-in').hidden = false;
  $('sign-in').addEventListener('submit', event => void signIn(event).catch(() => showError('No connection. Try again.')));
  $('allow').addEventListener('click', () => void allow().catch(() => showError('No connection. Try again.')));
  $('deny').addEventListener('click', () => finish('deny'));
}
