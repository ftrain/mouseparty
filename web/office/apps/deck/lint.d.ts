import type { Found } from '../../lint.ts';
export declare function lintDeck(text: string): Found[];
/** One slide as the layout set it: the sizes it chose, the lines it wrapped to, and what it left out. */
export interface SlideMeasure {
    slide: number;
    layout: string;
    title: {
        px: number;
        lines: number;
        smallest: boolean;
        cut: number;
    };
    body: {
        px: number;
        lines: number;
        smallest: boolean;
        over: number;
    };
    /** Lines written on the slide; on a slide that shows a document, none of them is drawn. */
    bullets: number;
    hidden: number;
    /** The document the slide shows, by its app ('table' for a table); '' for none. */
    shows: string;
    notes: number;
}
export declare function measureDeck(text: string): SlideMeasure[];
