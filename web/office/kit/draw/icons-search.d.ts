/**
 * Search and suggestion over the icon library, with no DOM and no Lucide (it runs under node). Each
 * starter icon (kit/draw/icons.ts LIBRARY) carries a few keywords; a slide's own words are matched against them
 * to suggest icons, and the picker's search box does the same with what is typed. The rest of Lucide joins
 * through addIconNames once the picker (icons-picker.ts, imported lazily) has it: searched by name and tag, grouped by
 * Lucide's categories.
 */
export declare const KEYWORDS: Record<string, string>;
/** Crude stemmer: enough to make "launching", "launched" and "launches" meet "launch". */
export declare function stem(word: string): string;
/** The rest of the library, once it has loaded: every icon by name, with its tags (searched like keywords) and categories (how the picker groups them). */
export declare function addIconNames(names: string[], meta?: Record<string, [string[], string[]]>, cats?: Record<string, string>): void;
/** The library's categories, with how many icons each holds; only those with any, by name. */
export declare function iconCategories(): {
    id: string;
    name: string;
    count: number;
}[];
/** The icons in one category, the starter set's first. */
export declare const iconsIn: (category: string) => string[];
/** How many icons can be searched right now. */
export declare const iconCount: () => number;
/** Icons that suit some words, best first: the headline's count three times as much as the rest's. [] when nothing rings a bell. */
export declare function suggestIcons(title: string, bullets?: string[], limit?: number): string[];
/** Icons matching what was typed, best first: every word must begin a word of the icon's name or one of its keywords. Nothing typed gives the starter set. */
export declare function searchIcons(query: string, limit?: number): string[];
/**
 * Best first, for a completion (":ca" typed in words, kit/ui/complete.ts): a name that is what was typed, then a name
 * with a word that is, then a name that starts with it, then a name with a word that does, then a tag that does;
 * ties by the shorter name, then by name. Typed hyphens part words ("thumbs-up"). With `alias`, a keyword that is
 * what was typed counts as a word of the name: an emoji's CLDR name is a description ("automobile") and its
 * keywords are what people call it (":car:"), where an icon's name is already short and its tags are loose.
 * The matches come back as their indexes.
 */
export declare function rankMatches(query: string, entries: readonly {
    nameWords: string[];
    keywords: string[];
}[], limit: number, alias?: boolean): number[];
/** Icons for a completion, best first (rankMatches): the starter set until the rest of Lucide has joined. */
export declare const completeIcons: (query: string, limit?: number) => string[];
