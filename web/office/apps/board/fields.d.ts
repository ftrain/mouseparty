/** An amount in a currency (a code, USD, or a symbol, $), its cents shown only where it has some. */
export declare function moneyShort(v: number, currency?: string, lang?: string): string;
/** A day (a serial day, as a table works one out, or "2026-12-15") short: its month and day, its year where it is not `now`'s. Null where it is no day. */
export declare function dayShort(v: unknown, lang?: string, now?: Date): string | null;
/**
 * A person's initials and a hue of their own are the kit's (kit/ui/initials.ts), the same on a card, in a typed table's
 * person cell and in a page's <to-avatar>: served here under the Board's names.
 */
export { hueOf, initial as initials } from '../../kit/ui/initials.ts';
