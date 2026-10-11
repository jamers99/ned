import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { loadUser } from './lib/auth.ts';
import { listenForBack } from './lib/nav.svelte.ts';
import { startClock } from './lib/state.svelte.ts';
import { syncNow } from './lib/sync.ts';

registerSW({ immediate: true });
startClock();
listenForBack();

await loadUser();
mount(App, { target: document.getElementById('app')! });

// Push and pull on open, whenever the app comes back to the front, when the network returns,
// and every minute while it is open.
void syncNow();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void syncNow();
});
addEventListener('online', () => void syncNow());
setInterval(() => {
  if (document.visibilityState === 'visible') void syncNow();
}, 60_000);
