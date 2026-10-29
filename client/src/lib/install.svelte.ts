// Ned installs from the browser: there's no app store. This works out which steps to show on the first screen.

/** Chrome's install offer, which it hands the page once Ned qualifies as installable. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const install = $state({ prompt: null as InstallPrompt | null, done: false });

/** Chrome may offer to install as the page loads, so this listens from the start. */
export function listenForInstall() {
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    install.prompt = event as InstallPrompt;
  });
  addEventListener('appinstalled', () => {
    install.prompt = null;
    install.done = true;
  });
}

/** Opened from the home screen rather than in a browser tab. */
export const installed = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPads ask for the desktop site, so they say Macintosh, but have a touch screen. */
export function device(): 'iphone' | 'android' | 'other' {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(agent)) return 'android';
  return 'other';
}

export async function installNow() {
  const prompt = install.prompt;
  if (!prompt) return;
  await prompt.prompt();
  if ((await prompt.userChoice).outcome === 'accepted') install.done = true;
  install.prompt = null;
}
