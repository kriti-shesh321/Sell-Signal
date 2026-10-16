/** The 8 key fields behind the completeness percentage. */
export const COMPLETENESS_FIELDS = [
  'phone',
  'email',
  'domain',
  'street',
  'city',
  'state',
  'yearFounded',
  'ownerName',
] as const;

type Completable = { [K in (typeof COMPLETENESS_FIELDS)[number]]: unknown };

/** Share of the key fields that are filled, 0–100. */
export function completeness(lead: Completable): number {
  const filled = COMPLETENESS_FIELDS.filter((f) => lead[f] !== null && lead[f] !== undefined).length;
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}

/** Mean completeness across leads, 0–100. */
export function averageCompleteness(leads: Completable[]): number {
  if (!leads.length) return 0;
  return Math.round(leads.reduce((sum, l) => sum + completeness(l), 0) / leads.length);
}
