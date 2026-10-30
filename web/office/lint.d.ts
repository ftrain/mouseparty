import { measureDiagram } from './apps/diagram/lint.ts';
import { measureDeck } from './apps/deck/lint.ts';
import { measureSheet } from './apps/sheet/lint.ts';
/** One thing the eye would have seen: the block it is about, what kind of finding, the words that say it, what to do. */
export interface Found {
    block: number;
    kind: string;
    words: string;
    fix: string;
}
/** A finding as the API gives it: with the app whose document it is in, and where that is ("slide 3", "block 4"). */
export interface Finding extends Found {
    app: string;
    at: string;
}
/** The longest link that pastes everywhere: some chat apps cut a link past about 2,000 characters. */
export declare const LINK_MAX = 2000;
/** The findings of a document in an app, its fenced documents' too; `url`, its link, is held to LINK_MAX. */
export declare function lint(app: string, text: string, url?: string): Finding[];
/** A finding as one line: app · where · the finding · what to do. */
export declare const findingLine: (f: Finding) => string;
/** The numbers the layouts chose for a document: per slide or per diagram, per table its formulas, and its fenced documents', with the link's length. */
export interface Measure {
    app: string;
    length: number;
    /** Whether the link fits in a short link (kit/share/short.ts SHORT_LINK_MAX), and by how many characters it does not. */
    short: {
        fits: boolean;
        over: number;
    };
    slides?: ReturnType<typeof measureDeck>;
    diagram?: ReturnType<typeof measureDiagram>;
    /** Each table, by its block: its formulas, and the ones whose value is an error. */
    tables?: ReturnType<typeof measureSheet>;
    /** The words a reader hears in it and the headings they can move between: its text layer's (src/doc/text.ts). */
    words: number;
    headings: number;
    /** The documents fenced in it, each where it is and as its app measures it. */
    fences?: ({
        at: string;
        block: number;
        app: string;
    } & Omit<Measure, 'app' | 'length' | 'short' | 'fences' | 'words' | 'headings'>)[];
}
export declare function measure(app: string, text: string, url?: string): Measure;
