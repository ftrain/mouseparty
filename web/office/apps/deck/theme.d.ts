export interface DeckTheme {
    name: () => string;
    /** Playful rather than businesslike: listed apart. */
    fun?: boolean;
    /** Light words on a dark slide: a document shown on it gets a white card. */
    dark?: boolean;
    paper: string;
    ink: string;
    /** A title slide's subtitle, the footnotes. */
    muted: string;
    /** Bullets, icons. */
    accent: string;
    /** Links, where the accent is too faint to read as words. */
    link?: string;
    /** SVG drawn behind everything, for a page w by h (a slide is 960 by 600). */
    deco?: (w: number, h: number) => string;
}
/** The eleven themes, the plain one first; the key is what the header says. */
export declare const THEMES: Record<string, DeckTheme>;
export declare const themeOf: (id?: string) => DeckTheme;
/** The colours a deck's icons can be, besides the theme's accent: the header says the name ("color: red"). */
export declare const ICON_COLORS: Record<string, {
    name: () => string;
    hex: string;
}>;
/** WCAG contrast between two hex colours. */
export declare function contrast(a: string, b: string): number;
