import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { loadUser } from './lib/auth.ts';
import { listenForBack } from './lib/nav.svelte.ts';
import { startClock, watchForProblems } from './lib/state.svelte.ts';
import { abandonSync, syncNow } from './lib/sync.ts';

// The new version installs in the background and the page reloads into it. Checking again whenever the
// app comes back to the front means an update arrives without a full restart.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update();
    });
  }
});
watchForProblems();
startClock();
listenForBack();

await loadUser();
mount(App, { target: document.getElementById('app')! });

// Push and pull on open, whenever the app comes back to the front, when the network returns,
// and every minute while it is open.
void syncNow();
// Back from the background: whatever sync was in flight may be hanging on a dead connection, so start over.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  abandonSync();
  void syncNow();
});
addEventListener('online', () => void syncNow());
setInterval(() => {
  if (document.visibilityState === 'visible') void syncNow();
}, 60_000);
