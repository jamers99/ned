// Shared with tools/nara-import, so both produce the same Guid for the same food.

export const settingsGuid = '5e771465-0000-4000-8000-000000000001';

const foodNamespace = '3f6b2c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f';

/** Both phones derive the same Guid for "Mango" and "mango", so offline adds upsert one row. */
export function foodGuid(name: string): Promise<string> {
  return uuidV5(name.trim().toLowerCase(), foodNamespace);
}

/** A name-based (SHA-1) UUID, so the same name in the same namespace always gives the same Guid. */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = namespace.replace(/-/g, '').match(/../g)!.map(h => parseInt(h, 16));
  const data = new Uint8Array([...namespaceBytes, ...new TextEncoder().encode(name)]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
