/**
 * A PDF of words rather than of pictures: a title, sections, and bullets
 * under them, set in Helvetica, code in Courier (two of the fonts every PDF reader has, so
 * nothing is embedded), wrapped to the page, broken across Letter pages,
 * the words selectable, linked words clickable, each section a bookmark in
 * the reader's outline, the pages numbered. Helvetica's own widths are below, so lines break
 * where the reader will draw them. It writes Windows-1252: a character
 * outside it (beyond Western European letters) shows as "?".
 */
import type { Run } from '../../doc/index.ts';
export interface TextBlock {
    /** 'title' at the top; 'h' a section, a bookmark; 'li' a bullet, `depth` levels in (0 the first); 'p' plain words. */
    kind: 'title' | 'h' | 'li' | 'p';
    runs: (Run & {
        sup?: boolean;
    })[];
    depth?: number;
}
/** Width in points of text at a size, bold or not; code (`mono`) in Courier, 600 thousandths a character. */
export declare function measure(s: string, size: number, bold?: boolean, mono?: boolean): number;
export declare function textPdf(blocks: TextBlock[], title?: string): Uint8Array;
