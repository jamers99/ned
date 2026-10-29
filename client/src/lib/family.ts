import { editStamp } from './actions.ts';
import { apiFetch, messageFrom } from './auth.ts';
import { db, getMeta, setMeta } from './db.ts';
import { firstFamily, foodGuid, oldSettingsGuid } from './ids.ts';
import { status } from './state.svelte.ts';

export interface Family {
  Guid: string;
  /** What the other parent enters when they create their account, to share this family. */
  InviteCode: string;
}

/** As the phone keeps it: also whose family it is, so signing in as someone else asks again. */
interface KnownFamily extends Family {
  user: string;
}

/** On launch: the family this phone last heard of. Before it has heard, it keys rows to the first family's. */
export async function loadFamily() {
  const family = await getMeta<KnownFamily>('family');
  status.family = family?.Guid ?? firstFamily;
  status.inviteCode = family?.InviteCode ?? '';
  await moveOldSettings();
}

/** The family's one Settings row. */
export const settingsGuid = () => status.family;

/**
 * Asks the server which family the signed-in parent is in, and moves this phone's settings and foods to that
 * family's Guids. Their events and growth keep theirs. A family that already has settings keeps them.
 */
export async function adoptFamily(signal?: AbortSignal) {
  const response = await apiFetch('/api/Family?$select=Guid,InviteCode', { signal });
  if (!response.ok) throw new Error(`Could not find your family: ${await messageFrom(response)}`);
  const [family] = (await response.json() as { value: Family[] }).value;
  if (!family) throw new Error('This account is not in a family.');

  if (family.Guid !== status.family) {
    const settings = await apiFetch(`/api/Settings(${family.Guid})?$select=Guid`, { signal });
    await moveToFamily(status.family, family.Guid, settings.status === 404);
  }
  await setMeta('family', { ...family, user: status.user } satisfies KnownFamily);
  status.family = family.Guid;
  status.inviteCode = family.InviteCode;
}

/**
 * Whether this phone knows the signed-in parent's family. It asks on the first sync after signing in, and a
 * phone signed in before families asks on its first sync after the update.
 */
export async function knowsFamily() {
  return (await getMeta<KnownFamily>('family'))?.user === status.user;
}

export async function moveToFamily(from: string, to: string, keepSettings: boolean) {
  const foods = await db.foods.toArray();
  const moved = await Promise.all(foods.map(async food => ({ food, guid: await foodGuid(food.Name, to) })));

  await db.transaction('rw', db.settings, db.foods, async () => {
    const settings = await db.settings.get(from);
    if (settings) {
      await db.settings.delete(from);
      if (keepSettings) await db.settings.put({ ...settings, Guid: to, ModifiedAt: '', dirty: editStamp() });
    }

    // The family is learned before the first pull, so none of its foods are on the phone yet to collide with.
    for (const { food, guid } of moved) {
      if (guid === food.Guid) continue;
      await db.foods.delete(food.Guid);
      await db.foods.put({ ...food, Guid: guid, ModifiedAt: '', dirty: editStamp() });
    }
  });
}

/** Before families, the one Settings row had a fixed Guid. It now belongs to the first family. */
async function moveOldSettings() {
  await db.transaction('rw', db.settings, async () => {
    const old = await db.settings.get(oldSettingsGuid);
    if (!old) return;
    await db.settings.delete(oldSettingsGuid);
    if (!(await db.settings.get(firstFamily)))
      await db.settings.put({ ...old, Guid: firstFamily, ModifiedAt: '' });
  });
}
