import type { AppDef, Page } from '../core/app.ts';
import type { Block } from '../../doc/index.ts';
export declare const QR_LANG = "qr";
/** The link of the document on the page now: the shell's, after every change. */
export declare const setSelfLink: (link: string) => undefined;
/** A QR fence: this document's own code. */
export declare const qrBlock: () => Block;
/** The code of `link` as a page: the code on white, a line under it. Too long for a code, or no link yet: a sentence instead. */
export declare function qrPage(link: string, caption?: string): Page;
/** How the lookup knows a QR fence: enough of a definition for the hosts to draw it. */
export declare const qrPicture: AppDef;
