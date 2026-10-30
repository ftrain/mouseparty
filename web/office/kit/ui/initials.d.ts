/**
 * A person as a page draws them small (docs/library.md, The kit's small pieces): their initials, and a hue of their
 * own, the same for the same name wherever it is drawn, so the Board's cards, a typed table's person cells and a
 * page's <to-avatar> (kit/ui/avatar.ts) show one person one way. No DOM: the Board's model tests and a host's server
 * use them alike (src/apps/board/fields.ts serves them to the Board under its own names).
 */
/** A person's initials: the first letter of their first and last words ("Maya Patel" MP, "Leo" L), as a reader writes them. */
export declare function initial(name: string): string;
/** A hue of a person's own, 0 to 359, the same for the same name (case and spaces aside) wherever it is drawn. */
export declare function hueOf(name: string): number;
