export type Method = 'JSON-LD' | 'microdata' | 'text' | 'tel: link' | 'mailto: link' | 'meta' | 'AI';

/** A value found on the site, with where and how it was found. */
export interface Found<T> {
  value: T;
  /** Page it came from, e.g. "website:/about-us/". */
  source: string;
  method: Method;
  /** Short quote (≤ 80 chars) that justifies the value. */
  evidence: string;
}

/** A person's name plus whether the page presents them as the owner or the founder. */
export interface FoundName extends Found<string> {
  role: 'owner' | 'founder';
}

export interface PostalAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface SiteSignals {
  familyOwned: Found<true> | null;
  /** Franchise / subsidiary / PE- or portfolio-owned / acquired. */
  franchise: Found<true> | null;
  /** Nonprofit or public body. */
  nonprofit: Found<true> | null;
  copyrightYear: Found<number> | null;
  hasViewport: boolean;
  https: boolean;
}

export interface SiteFacts {
  yearFounded: Found<number> | null;
  ownerName: FoundName | null;
  phone: Found<string> | null;
  email: Found<string> | null;
  address: Found<PostalAddress> | null;
  signals: SiteSignals;
}

/** One parsed page, as the extractors see it. */
export interface PageDoc {
  role: 'home' | 'about' | 'contact';
  /** "website:/about-us/" */
  source: string;
  html: string;
}
