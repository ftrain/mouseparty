/**
 * Every document as a file, by one mechanism: a format is one object (app.ts Export) that says what it is (its
 * extension, type and words), whether the browser shows it, whether it is drawn still, and how it builds its bytes
 * from the document alone. formatsOf(def) is the one list: the kit's six (KIT_FORMATS: the pages as a PDF, a picture
 * and a web page through pdfOf, picture and htmlOf, the web page its text layer first; Markdown; the text; the
 * kernel's document as JSON) less any the app makes its own way, then the app's own. The Download table, the
 * ".<ext>" route, exportAs and the share sheet read that list and nothing else, so nothing here asks which extension
 * it holds. (It replaced special cases in exportAs beside placeholder builders that
 * returned empty bytes, with a second place deciding what the browser shows and a third what gets a link.)
 *
 * Print is not a format: the browser's dialog, through a hidden srcdoc frame with @page at the page's size, which
 * saves a PDF too. A file is handed over by showSaveFilePicker where there is one, the share sheet on a phone, and
 * <a download> everywhere else.
 */
import type { AppDef, Doc, Export, ExportContext, Page } from '../core/app.ts';
import type { MenuItem } from '../ui/menu.ts';
export { slug, utf8 } from '../draw/draw.ts';
export { raster } from '../draw/raster.ts';
/**
 * Hand a file to the person: the browser's own "save as" where it has one (the File System Access API),
 * the share sheet on a phone (which has Save to Files) unless `share` is false (the Download menu has a Share of
 * its own beside it), and a download everywhere else or when refused.
 */
export declare function saveFile(name: string, mime: string, data: Uint8Array | string, share?: boolean): Promise<void>;
/** The whole document as one picture. */
export declare function picture(pages: Page[]): Promise<Uint8Array | null>;
/**
 * A document as a standalone web page, with the tags link previews read: its text layer first (kit/text/text-view.ts
 * textHtml, `text`), for a screen reader, then its pages as pictures, hidden from one, as the Display Link has them.
 */
export declare function htmlOf(pages: Page[], title: string, link?: string, text?: string): string;
/**
 * A document as a page for the browser to print, which is also how it becomes a PDF: a page per picture,
 * each at its own size with no margin (@page), the text in the SVG still text.
 */
export declare function printHtml(pages: Page[], title: string): string;
/** Print the pages: a hidden frame holds them, and the browser's dialog does the rest (it saves a PDF too). */
export declare function printPages(pages: Page[], title: string): Promise<void>;
/** The document in hand: what every format builds from. */
export interface Current {
    doc: Doc;
    ctx: ExportContext;
}
/**
 * The formats every app has: the .pdf file, a picture, a web page, Markdown, the text, the JSON. Each builds its own bytes
 * through the pages (pdfOf, picture, htmlOf). Markdown is the document's own text (TLO is Markdown), its footnotes in
 * the reference form other readers know; a .tlo carries its app (kit/core/plain.ts), and so does a .json, the kernel's
 * document as JSON (src/doc/json.ts; its schema is packages/doc/schema/tlo.schema.json).
 */
export declare const KIT_FORMATS: readonly Export[];
/**
 * The one list of what a document of this app can become: the kit's formats less the ones the app makes its own way
 * (write's HTML is the words, not pictures of its pages), then the app's own. The Download table, the ".<ext>" route,
 * exportAs and the share sheet all read it; nothing anywhere asks which extension it is holding.
 */
export declare function formatsOf(def: AppDef): Export[];
/**
 * The app's formats that ask whether this browser can make them (a WebM wants its encoder), asked: once a session
 * each, so formatsOf lists those that can. The shell asks as an app opens and draws the Download table again after.
 */
export declare function formatsReady(def: AppDef): Promise<void>;
/** The app's format with this extension, if it has one. */
export declare const formatOf: (def: AppDef, ext: string) => Export | undefined;
/** A document made into a file: its name, its type and its bytes. */
export interface Made {
    name: string;
    mime: string;
    data: Uint8Array | string;
}
/** The document built as a file of this format: every icon it names drawn first, and every host-kept picture's bytes in hand. */
export declare function fileOf(format: Export, { doc, ctx }: Current): Promise<Made>;
/** Save the document as one of its app's formats: find it, build it, hand it over. The file's name, or null when the app has no such format. */
export declare function exportAs(ext: string, current: Current, share?: boolean): Promise<string | null>;
/**
 * A ".<ext>" link's view, once the document is up: the file in one of its app's formats (formatsOf) downloads; ".print"
 * prints. Any other extension does nothing (the document opens plainly).
 */
export declare function viewAs(view: string, current: () => Current): Promise<void>;
/** Print the document (not a format: the browser's dialog, which saves a PDF too), drawn still. */
export declare function printDoc({ doc, ctx }: Current): Promise<void>;
/**
 * The Download menu's items: Print first; then a row per format in formatsOf, its words the format's label, each with
 * View (where the format `shows`), Share (where the device's share sheet takes it),
 * Download, and Copy link (the link that downloads it as it opens, "#/v1/<app>.<ext>/<payload>"); then the
 * hand-offs to apps that exist. `def` is the app's, so drawing the menu reads nothing; `current` (which brings the
 * link up to the document, kit/core/shell.ts flushLink) is read only when an item is chosen.
 */
export declare function exportItems(def: AppDef, current: () => Current): MenuItem[];
