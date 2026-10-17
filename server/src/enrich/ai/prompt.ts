import { z } from 'zod';

/** Visible text of one fetched page, as the model sees it. */
export interface PageText {
  /** "website:/about-us/" */
  source: string;
  text: string;
}

export interface AiInput {
  company: string | null;
  pages: PageText[];
}

/** What the model must return. Every value comes with a verbatim quote so it can be checked against the page. */
export const AiAnswer = z.object({
  ownerName: z.string().nullable(),
  ownerRole: z.enum(['owner', 'founder']).nullable(),
  ownerQuote: z.string().nullable(),
  foundedYear: z.number().int().nullable(),
  foundedQuote: z.string().nullable(),
  familyOwned: z.boolean().nullable(),
  familyQuote: z.string().nullable(),
});
export type AiAnswer = z.infer<typeof AiAnswer>;

const nullable = (type: 'string' | 'integer' | 'boolean', description: string, extra: object = {}) => ({ type: [type, 'null'], description, ...extra });

/** JSON Schema for the provider's structured output (same shape as AiAnswer). */
export const AI_ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ownerName: nullable('string', 'Full name of the current owner or the founder, exactly as written on the page.'),
    ownerRole: nullable('string', 'owner = owns or runs the business now (including someone who bought or took it over); founder = started it.', {
      enum: ['owner', 'founder', null],
    }),
    ownerQuote: nullable('string', 'The exact sentence from the page that names the owner or founder.'),
    foundedYear: nullable('integer', 'Four-digit year the business was founded or established.'),
    foundedQuote: nullable('string', 'The exact sentence from the page that states the founding year.'),
    familyOwned: nullable('boolean', 'True only if the page says the business is family-owned, family-run or run by family members.'),
    familyQuote: nullable('string', 'The exact sentence from the page that says it is family-owned.'),
  },
  required: ['ownerName', 'ownerRole', 'ownerQuote', 'foundedYear', 'foundedQuote', 'familyOwned', 'familyQuote'],
} as const;

export const SYSTEM_PROMPT = [
  'You read the text of a small US trade business website (plumbing, HVAC, electrical, roofing) and pull out three facts.',
  'Only use what the text says. Never guess, never use outside knowledge.',
  'For each fact, copy the supporting sentence exactly as it appears in the text (same words and spelling) into the matching quote field.',
  'If a fact is not stated, return null for it and for its quote.',
  'ownerName: a person (first and last name) described as the owner, founder, president or proprietor of this business. Not a staff member, customer or reviewer.',
  'If the business changed hands, prefer the current owner over the founder.',
  'foundedYear: the year the business was founded, established or opened. Ignore copyright years.',
  'familyOwned: true only if the text says the business is family-owned, family-run or run by members of one family.',
].join('\n');

const PAGE_CHARS = 5000;

export function userPrompt(input: AiInput): string {
  const pages = input.pages.map((p) => `--- ${p.source} ---\n${p.text.slice(0, PAGE_CHARS)}`).join('\n\n');
  return `Business: ${input.company ?? 'unknown'}\n\nWebsite text:\n\n${pages}`;
}
