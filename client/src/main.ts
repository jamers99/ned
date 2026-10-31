import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { loadUser, refreshSettled } from './lib/auth.ts';
import { watchForProblems } from './lib/diagnostics.svelte.ts';
import { loadFamily } from './lib/family.ts';
import { listenForInstall } from './lib/install.svelte.ts';
import { listenForBack } from './lib/nav.svelte.ts';
import { startClock } from './lib/state.svelte.ts';
import { abandonSync, syncNow } from './lib/sync.ts';

// The new version installs in the background and the page reloads into it. Checking again whenever the
// app comes back to the front means an update arrives without a full restart. Both happen as the app opens,
// just as a sync refreshes the sign-in, so the reload waits for the refresh: cutting it off signs the phone out.
registerSW({
  immediate: true,
  onNeedReload: () => void refreshSettled().then(() => location.reload()),
  onRegisteredSW(_url, registration) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update();
    });
  }
});
watchForProblems();
listenForInstall();
startClock();
listenForBack();

// Ask the browser to keep the log and the sign-in even when the phone runs low on storage.
void navigator.storage?.persist?.().catch(() => {});
await loadUser();
await loadFamily();
mount(App, { target: document.getElementById('app')! });

// Push and pull on open, whenever the app comes back to the front, when the network returns, and every minute
// while it is open — but only in the copy on screen. A hidden copy frozen mid-save would hold up the database.
const onScreen = () => document.visibilityState === 'visible';
const syncIfOnScreen = () => onScreen() && void syncNow();
syncIfOnScreen();
addEventListener('online', syncIfOnScreen);
setInterval(syncIfOnScreen, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!onScreen()) return;
  // Back from the background: whatever sync was in flight may be hanging on a dead connection, so start over.
  abandonSync();
  void syncNow();
});
