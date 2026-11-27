import type { Pronouns, Settings } from './db.ts';
import { fromDateInput } from './time.ts';

const forms: Record<Pronouns, { they: string; their: string; theyre: string; theyve: string; plural: boolean }> = {
  She: { they: 'she', their: 'her', theyre: "she's", theyve: "she's", plural: false },
  He: { they: 'he', their: 'his', theyre: "he's", theyve: "he's", plural: false },
  They: { they: 'they', their: 'their', theyre: "they're", theyve: "they've", plural: true }
};

/**
 * Who the app is about: the name and pronouns from Settings. UI text goes through these rather than spelling out
 * a name or "she". Until a parent fills them in, the app says "Baby" and "they".
 */
export const baby = $state({ name: 'Baby', born: null as number | null, ...forms.They });

export function useBaby(settings: Partial<Pick<Settings, 'BabyName' | 'BabyPronouns' | 'BabyBirthDate'>> | undefined) {
  Object.assign(baby, {
    name: settings?.BabyName?.trim() || 'Baby', born: settings?.BabyBirthDate ? fromDateInput(settings.BabyBirthDate) : null,
    ...forms[settings?.BabyPronouns ?? 'They']
  });
}

/** A verb that agrees with the pronoun: `verb('goes', 'go')` is "goes" for she and he, "go" for they. */
export const verb = (singular: string, plural: string) => (baby.plural ? plural : singular);

/** "she" → "She", for the start of a sentence. */
export const capital = (word: string) => word[0].toUpperCase() + word.slice(1);
