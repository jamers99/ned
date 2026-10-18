/**
 * Keeps the screen on until the returned function is called. The browser drops the lock whenever the app
 * leaves the screen, so it is taken again on return. Where wake locks aren't supported, nothing happens.
 */
export function keepScreenOn(): () => void {
  if (!('wakeLock' in navigator)) return () => {};
  let wanted = true;
  let lock: WakeLockSentinel | null = null;

  async function take() {
    if (!wanted || document.visibilityState !== 'visible') return;
    try {
      const taken = await navigator.wakeLock.request('screen');
      if (wanted) lock = taken;
      else void taken.release();
    } catch {
      // Low power mode can refuse it; then the screen just dims as usual.
    }
  }

  void take();
  document.addEventListener('visibilitychange', take);
  return () => {
    wanted = false;
    document.removeEventListener('visibilitychange', take);
    lock?.release().catch(() => {});
    lock = null;
  };
}
