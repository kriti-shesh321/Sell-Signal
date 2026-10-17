/** Franchise / national-network brands common in home services. A name match means the location isn't independently owned. */
const FRANCHISE_BRANDS: Array<[string, RegExp]> = [
  ['Benjamin Franklin Plumbing', /\bbenjamin franklin plumbing\b/i],
  ['Mr. Rooter', /\bmr\.?\s*rooter\b/i],
  ['Roto-Rooter', /\broto[\s-]?rooter\b/i],
  ['One Hour Heating & Air', /\bone hour (?:heating|air)\b/i],
  ['Mister Sparky', /\bmister sparky\b/i],
  ['Aire Serv', /\baire serv\b/i],
  // "ARS" only as a standalone capital word, so names like "Cars" or "Stars" don't match
  ['ARS / Rescue Rooter', /\bARS\b|\b[Rr]escue [Rr]ooter\b/],
  ['Service Experts', /\bservice experts\b/i],
  ['Mr. Electric', /\bmr\.?\s*electric\b/i],
  ['Kinetico', /\bkinetico\b/i],
  ['Culligan', /\bculligan\b/i],
];

/** The franchise brand a company name matches, if any. */
export function franchiseBrand(company: string | null | undefined): string | null {
  if (!company) return null;
  return FRANCHISE_BRANDS.find(([, re]) => re.test(company))?.[0] ?? null;
}
