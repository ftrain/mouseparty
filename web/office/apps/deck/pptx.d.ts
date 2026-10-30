/**
 * The deck as PowerPoint: a slide for each, the headline and the words as real text in the theme's
 * colours, the icons, the theme's decoration and any document on a slide as pictures drawn in the browser
 * first (raster), each placed where the layout puts it. Keynote is stricter than PowerPoint about what a
 * presentation holds, so the parts PowerPoint always writes are written too. No DOM but the pictures,
 * which are asked for and may be none (under node they are).
 */
import type { ExportContext } from '../../kit/core/app.ts';
import { type Doc } from '../../doc/index.ts';
import { type Slide } from './model.ts';
import { type Look } from './view.ts';
/** The pictures PowerPoint needs drawn: the theme's decoration, each icon used, and each document shown on a slide. */
export declare function pictures(doc: Doc, slides: Slide[], look: Look): Record<string, {
    svg: string;
    w: number;
    h: number;
}>;
/** The deck as a .pptx. `png` holds the pictures by key (drawPictures); the slides' words are text either way. */
export declare function deckToPptx(text: string, ctx: ExportContext, png?: Record<string, Uint8Array>): Uint8Array;
/** The deck as a .pptx with its pictures drawn first (in a browser), as the Download menu asks. */
export declare function buildPptx(text: string, ctx: ExportContext): Promise<Uint8Array>;
