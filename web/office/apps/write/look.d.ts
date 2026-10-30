/**
 * Write's looks: the type a document is set in, named in its head (`look: serif`) and worn everywhere it is
 * drawn: the editor (a data-look on the page, style.css), the pages (view.ts: print, PDF, pictures,
 * previews), the web page (CSS), Word (font names) and RTF (the font table). Absent means `sans`, the site's
 * own type. The sans, the serif and the mono are IBM Plex, the site's own files (src/styles/fonts.css), each with the
 * system's stack behind it for a page read without the site; the narrow face is the system's.
 *
 *   sans     the site's sans throughout
 *   serif    a serif throughout
 *   mono     a monospace throughout, ragged right, a typewriter's page
 *   mixed    serif headings over a sans body
 *   inverse  sans headings over a serif body
 *   book     serif, justified, each paragraph indented with no gap before it, headings in small caps
 *   news     a narrow serif headline over a sans body, set in two columns on paper
 */
import type { Doc } from '../../doc/index.ts';
export type Face = 'sans' | 'serif' | 'mono' | 'narrow';
export type LookId = 'sans' | 'serif' | 'mono' | 'mixed' | 'inverse' | 'book' | 'news';
/** The stacks, as CSS and SVG name them. */
export declare const STACKS: Record<Face, string>;
/** How wide each face sets beside the sans the page's widths are estimated in (kit/draw/draw.ts textWidth): Plex Serif and Plex Mono beside Plex Sans, measured. */
export declare const WIDTH: Record<Face, number>;
/** The face a word processor names, for .docx and .rtf: one font each, the one most systems have. */
export declare const NAMED: Record<Face, {
    name: string;
    rtf: 'fswiss' | 'froman' | 'fmodern';
}>;
export interface Look {
    id: LookId;
    name: () => string;
    /** The two lines the Look menu shows, in the look's own type. */
    sample: () => string;
    head: Face;
    body: Face;
    /** Lines set flush on both sides. */
    justify?: boolean;
    /** Each paragraph after the first indented, no gap between them. */
    indent?: boolean;
    /** Headings (not the title) in small capitals. */
    caps?: boolean;
    /** The body in two columns on paper. */
    columns?: 2;
}
export declare const LOOKS: Record<LookId, Look>;
export declare const LOOK_IDS: LookId[];
/** The look the head names, else sans. */
export declare const lookOf: (doc: Doc) => Look;
