import { test as base, expect, type Page } from '@playwright/test';
import type { BabyEvent, Food, Growth } from '../src/lib/db.ts';
import { foodGuid } from '../src/lib/ids.ts';

/** A local time in October 2026 (the config sets the time zone). */
export const at = (day: number, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return new Date(2026, 9, day, h, m).getTime();
};

/** Where every test starts: Sunday the 18th, 1 PM, awake after nap 1, with three days of history behind it. */
export const now = at(18, '13:00');

const synced = { ModifiedAt: '', Deleted: false, LoggedBy: 'Natalie', dirty: 0 };

function event(fields: Partial<BabyEvent> & Pick<BabyEvent, 'Type' | 'Start'>): BabyEvent {
  return {
    ...synced, Guid: crypto.randomUUID(), End: fields.Start, IsNight: false, SleepLocation: null, SleepOnset: null,
    WakeMood: null, SettledBy: null, FeedKind: null, LeftSeconds: 0, RightSeconds: 0, StartSide: null,
    ActiveSide: null, ActiveSince: null, BottleOz: null, Foods: [], SolidAmount: null, Text: '', ...fields
  };
}

const nursing = (start: number, left: number, right: number): BabyEvent =>
  event({ Type: 'Feed', FeedKind: 'Nursing', Start: start, End: start + (left + right) * 60_000,
    LeftSeconds: left * 60, RightSeconds: right * 60, StartSide: 'Left' });

function history(): BabyEvent[] {
  const events: BabyEvent[] = [];
  const napLengths = [75, 60, 90];
  for (const [i, d] of [15, 16, 17].entries()) {
    events.push(
      event({ Type: 'Sleep', Start: at(d, '20:15'), End: at(d + 1, '06:30'), IsNight: true, SleepLocation: 'Crib',
        SleepOnset: 'Own' }),
      event({ Type: 'NightWaking', Start: at(d + 1, '02:10'), End: at(d + 1, '02:30'), SettledBy: 'Feeding' }),
      nursing(at(d + 1, '02:12'), 7, 6),
      nursing(at(d + 1, '06:40'), 8, 7),
      event({ Type: 'Sleep', Start: at(d + 1, '09:05'), End: at(d + 1, '09:05') + napLengths[i] * 60_000,
        SleepLocation: 'Crib' })
    );
  }
  events.push(
    event({ Type: 'Sleep', Start: at(16, '13:10'), End: at(16, '14:20'), SleepLocation: 'Contact' }),
    event({ Type: 'Sleep', Start: at(17, '13:30'), End: at(17, '14:15'), SleepLocation: 'OnTheGo' }),
    event({ Type: 'Solids', Start: at(17, '12:00'), Foods: ['Avocado'], SolidAmount: 'All' }),
    event({ Type: 'Solids', Start: at(18, '08:30'), Foods: ['Banana', 'Oatmeal'], SolidAmount: 'Some' }),
    event({ Type: 'Feed', FeedKind: 'Bottle', Start: at(18, '11:00'), BottleOz: 4 })
  );
  return events;
}

async function foods(): Promise<Food[]> {
  const used: [string, Food['Category'], number][] =
    [['Avocado', 'Fruit', at(17, '12:00')], ['Banana', 'Fruit', at(18, '08:30')], ['Oatmeal', 'Grains', at(18, '08:30')]];
  return Promise.all(used.map(async ([Name, Category, LastUsedAt]) =>
    ({ ...synced, Guid: await foodGuid(Name), Name, Category, LastUsedAt, UseCount: 1 })));
}

const growth: Growth[] = [
  { ...synced, Guid: crypto.randomUUID(), MeasuredAt: at(1, '00:00') - 45 * 86_400_000, WeightKg: 6.8, LengthCm: 64, HeadCm: 41 },
  { ...synced, Guid: crypto.randomUUID(), MeasuredAt: at(1, '00:00'), WeightKg: 7.4, LengthCm: 66.5, HeadCm: 42 }
];

/** Writes rows straight into the app's IndexedDB, then reloads so the app reads them. */
async function seed(page: Page, rows: Record<string, unknown[]>) {
  await page.evaluate(rows => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('ned');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(Object.keys(rows), 'readwrite');
      for (const [table, list] of Object.entries(rows))
        for (const row of list) tx.objectStore(table).put(row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  }), rows);
  await page.reload();
}

export class App {
  constructor(readonly page: Page) {}

  get sleepButton() {
    return this.page.locator('.action.sleep');
  }

  get feedButton() {
    return this.page.locator('.action.feed');
  }

  /** The open full-screen drawer (Sleep, Feed, Solids…), not the Now screen behind it. */
  get drawer() {
    return this.page.locator('.overlay');
  }

  /** A bottom sheet's Done (the strip above the sheet is also labelled Done, as tapping it saves too). */
  async done() {
    await this.page.locator('.sheet').getByRole('button', { name: 'Done', exact: true }).click();
  }

  button(name: string | RegExp) {
    return this.page.getByRole('button', { name, exact: typeof name === 'string' });
  }

  /** Picks a clock time ("14:05") on the time wheel labelled `label`. */
  async pickTime(label: string, time: string) {
    await this.page.getByLabel(label, { exact: true }).first().fill(time);
  }

  /** Lets time pass on the app's clock. */
  async wait(minutes: number) {
    await this.page.clock.fastForward(minutes * 60_000);
  }

  /** Waits out transitions (browser animations, which run on real time), so a screenshot isn't caught mid-fade. */
  async settle() {
    await this.page.waitForTimeout(100); // a transition starts a frame or so after the change behind it
    await this.page.evaluate(() => Promise.allSettled(document.getAnimations().map(a => a.finished)));
  }
}

type Options = {
  /** When the test starts. */
  startAt: number;
  /** Start with the three days of history, as a guest. Off: a fresh install at the sign-in screen. */
  seeded: boolean;
  /**
   * Signed in as this parent instead of a guest, last synced two hours ago. There is no server behind the tests,
   * so every sync fails and the sync cloud asks for attention.
   */
  user: string;
};

export const test = base.extend<Options & { app: App }>({
  startAt: [now, { option: true }],
  seeded: [true, { option: true }],
  user: ['', { option: true }],
  // Automatic, so a test that only asks for `page` still gets the app opened and seeded.
  app: [async ({ page, startAt, seeded, user }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: startAt });
    await page.goto('/');
    await expect(page.getByText('Try it without an account')).toBeVisible();
    if (seeded)
      await seed(page, {
        events: history(), foods: await foods(), growth,
        meta: user
          ? [{ key: 'user', value: user }, { key: 'refreshToken', value: 'spent' }, { key: 'lastSyncedAt', value: startAt - 2 * 3_600_000 }]
          : [{ key: 'guest', value: true }]
      });

    await use(new App(page));
    expect(errors, 'errors on the page').toEqual([]);
  }, { auto: true }]
});

export { expect };
