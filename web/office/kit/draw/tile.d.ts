/** The inks a tile (and Draw's pixel mode) may use, by letter. Their names are the editor's (through t()). */
export declare const TILE_INKS: Record<string, string>;
/** The sides a grid may have. */
export declare const TILE_SIDES: readonly [8, 16, 32, 64];
export declare const TILE_MIN = 2;
export declare const TILE_MAX = 64;
export interface Tile {
    /** Squares along each edge. */
    n: number;
    /** n rows of n letters, "." for a clear square. */
    rows: string[];
}
/** A tile with every square clear. */
export declare const blankTile: (n: number) => Tile;
/** Rows as written (any length, any letters) as a tile of side n, squared off. */
export declare const tileOf: (n: number, rows: string[]) => Tile;
/** The field read: null for what is no tile. */
export declare function parseTile(ref: string): Tile | null;
/** The tile as its field is written. */
export declare const tileRef: (t: Tile) => string;
/** Whether any square is inked. */
export declare const tileFilled: (t: Tile) => boolean;
/** The tile as an SVG <pattern> for a page's <defs>: fill="url(#id)" repeats it every `side` px. */
export declare const tilePattern: (t: Tile, id?: string, side?: number) => string;
/** One tile as a complete SVG document, `side` px square (the file "Use as background" gives, and what the PNG is drawn from). */
export declare const tileSvg: (t: Tile, side?: number) => string;
/** The tile as a CSS background for an HTML page: a data URL, repeating every `side` px. */
export declare const tileCss: (t: Tile, side?: number) => string;
