/** What the normal size draws at: at 100% a rem (and the nav's em) is this many times 16px. */
export declare const BASE = 1.3;
export declare const SIZE_MIN = 0.7;
export declare const SIZE_MAX = 2;
/** The most the nav grows to: past it a larger size enlarges the document alone. */
export declare const NAV_MAX = 1.2;
/** Within 70%–200%, and free of float dust. */
export declare const clampSize: (n: number) => number;
/** Where a size starts on an iPhone from the body text style's size in px (17 at the device's normal text size): to the nearest 5%. */
export declare const deviceStart: (px: number) => number;
/**
 * Where a page keeps the size of everything: on the device under its own `key`, or, null, nowhere (memory, for the
 * visit). Called before anything asks for the size (before `setup`); the site's own key, "tinyoffice.size", is the
 * default.
 */
export declare function keepSizeAt(key: string | null): void;
/** The size chosen: 1 is the normal size. */
export declare function size(): number;
/** The size the nav is drawn at: the size, up to 120%. */
export declare const navSize: () => number;
/** The size, on the page: the two scales on the root (`--to-doc`, `--to-nav`), and nothing else. Says so with a `to-size` event on the window. */
export declare function applySize(): void;
/** A size drawn while fingers are on the screen: applied now, not kept. */
export declare function pinchSize(n: number): number;
/** A size kept, rounded to the nearest 5% (where a pinch leaves it). */
export declare function keepSize(n: number): number;
/** The step from `n`: up to the next ten above (+1), down to the next below (-1), or back to normal (0). */
export declare function stepFrom(n: number, by: -1 | 0 | 1): number;
/** A step larger (+1) or smaller (-1), or back to normal (0), kept. */
export declare const stepSize: (by: -1 | 0 | 1) => number;
/**
 * A pixel of the document's own, on the screen: a sixteenth of a rem, at the size of everything now (as drawn, so
 * BASE × the size once applied). For what keeps lengths of its own and draws them in rem (a sheet's column widths, a
 * chart's days): a length measured on the screen is divided by this to be one of them again.
 */
export declare const remScale: () => number;
