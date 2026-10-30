import { type ExportContext, type Page } from '../../kit/core/app.ts';
import { type Doc } from '../../doc/index.ts';
/** A page placed inside another at x, y, within w by h, keeping its shape. */
export declare function place(page: Page, x: number, y: number, w: number, h: number): string;
/** The address a document held in a fence opens at: on the site the text was shared from, else the fragment alone. */
export declare function fenceLink(lang: string, body: string, site?: string): string;
/** The text laid out on pages of its paper, in its look's type. `still`: drawn where nothing can move (print, a picture, a thumbnail), so a document placed in it is too. */
export declare function pages(textOrDoc: string | Doc, small?: boolean, still?: boolean): Page[];
/** The text as a standalone web page, the words still words. */
export declare function docToHtml(doc: Doc, ctx: ExportContext): string;
/**
 * The text as Markdown anyone reads: its footnotes in the reference form, [^1] with "[^1]: the note" at the end; a
 * host-kept picture as Markdown's own picture line at the host's address, or its words alone where none keeps it.
 */
export declare const docToMarkdown: (doc: Doc, ctx?: Pick<ExportContext, 'image'>) => string;
/** The text as RTF: paragraphs, headings, lists, a table as a table, links, a host-kept picture (its bytes where the host gives them, else its words), footnotes as marks with the notes at the end. */
export declare function docToRtf(doc: Doc, ctx: ExportContext): string;
/**
 * The text as a Word document (.docx): the smallest WordprocessingML that Word, LibreOffice and Pages all
 * open. Paragraphs, the title and headings as styles, the marks, lists bulleted or numbered to three
 * levels (each numbered list starting at 1), links, alignment, the paper from the header, a table block as
 * a table of its worked-out values, another document as a link to it, a host-kept picture as the picture (its
 * bytes, where the host gives them, in word/media) or its words. Footnotes are marks in the text and the notes as small
 * paragraphs at the end (Word's own notes are deep).
 */
export declare function docToDocx(doc: Doc, ctx: ExportContext): Uint8Array;
