// A log of errors on the phone, shown in Settings. It lives in sessionStorage so it survives a reload.
const logKey = 'ned-diagnostics';
const maxEntries = 40;

export const diagnostics = $state({ log: restore() as { at: number; message: string }[] });

export function note(message: string) {
  diagnostics.log = [{ at: Date.now(), message }, ...diagnostics.log].slice(0, maxEntries);
  try {
    sessionStorage.setItem(logKey, JSON.stringify(diagnostics.log));
  } catch {
    // Diagnostics are best-effort; private modes can refuse storage.
  }
}

export function reportProblem(error: unknown) {
  note(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

export function watchForProblems() {
  addEventListener('error', event => reportProblem(event.error ?? event.message));
  addEventListener('unhandledrejection', event => reportProblem(event.reason));
}

function restore() {
  try {
    return JSON.parse(sessionStorage.getItem(logKey) ?? '[]');
  } catch {
    return [];
  }
}
