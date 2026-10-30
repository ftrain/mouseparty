/**
 * The mark: a sheet of paper with its corner turned down and a link on it, drawn as Lucide draws its icons (24 by
 * 24, a 2px stroke, round caps) so it sits among them (Paul, 2026-10-10: "a logo that looks like a piece of paper";
 * 2026-10-11: "folded paper with a link"). The link is Lucide's chain at two fifths of its size, two loops crossing on the
 * diagonal, so it reads as a link at 32px and as a marked sheet at 16. The one drawing is the menu button, the
 * drawer's head, the favicon and app icons (scripts/icons.ts) and the cards (scripts/make-cards.ts).
 */
export declare const markPaths: string[];
/** The mark as an SVG element, `size` sixteenths of its scale square (--i, kit.css), in the colour of the words around it. */
export declare function mark(size?: number, cls?: string): string;
