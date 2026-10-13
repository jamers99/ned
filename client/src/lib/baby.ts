/**
 * Who the app is about. Constants for now; when Settings gains a name and pronouns, read them from there.
 * UI text goes through these rather than spelling out "Kennedy" or "she".
 */
export const baby = { name: 'Kennedy', they: 'she', their: 'her', theyre: "she's" };

/** "she" → "She", for the start of a sentence. */
export const capital = (word: string) => word[0].toUpperCase() + word.slice(1);
