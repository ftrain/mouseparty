import type { AppDef, ExportContext, Page } from '../core/app.ts';
import type { FenceBlock } from '../../doc/model.ts';
import { IMAGE_LANG, imageBlock, imageOf, type Image } from '../../doc/index.ts';
export { IMAGE_LANG, imageBlock, imageOf };
/**
 * Every picture a document names, its bytes asked of the host and kept inline, where the host gives bytes; each asked
 * once a visit. A host that gives none, or a picture that does not come, leaves the address, which a raster's fetch
 * may still bring (kit/draw/raster.ts inlineImages, an https address only).
 */
export declare function readyImages(text: string): Promise<void>;
/** Where a picture is drawn from: the context's answer, else the bytes readyImages kept, else the host's address; null where no host keeps it. */
export declare function imageHref(ref: string, ctx?: Pick<ExportContext, 'image'>): string | null;
/** A picture's bytes as a file that writes them in takes them (a .docx's media, an RTF's pict). */
export interface ImageData {
    mime: string;
    bytes: Uint8Array;
    /** Its size in pixels, as the fence says it or the bytes do; absent where neither does. */
    w?: number;
    h?: number;
}
/**
 * A picture's bytes where they are in hand, for a file that writes them in: the context's answer or the bytes
 * readyImages kept (`images.bytes`), as a data: URL read back; null where none are (a host that gives no bytes, a
 * picture that did not come), and the file says the picture's words instead.
 */
export declare function imageData(im: Image, ctx?: Pick<ExportContext, 'image'>): ImageData | null;
/** The address a picture is shown at in a page that may fetch (an editor, a web page): the host's, never the bytes; null where no host keeps it. */
export declare const imageUrl: (ref: string) => string | null;
/** Whether this page keeps pictures: the one question Insert ▾ asks before offering one. */
export declare const imagesKept: () => boolean;
/** A picture's page: the picture whole inside its box; or, where no host keeps it, a card saying so with its words. */
export declare function imagePage(im: Image, opts?: {
    ctx?: Pick<ExportContext, 'image'>;
    w?: number;
    h?: number;
}): Page;
/** Who chooses the file: the device's picker, unless a test (which cannot work a native picker) puts a chooser of its own here. */
export declare const picker: {
    choose(): Promise<File | null>;
};
/** A picture file chosen for Insert ▾ Picture; null when none was. */
export declare const chooseImageFile: () => Promise<File | null>;
/**
 * A file put to the host, as every editor does it: refused with a word where it is too heavy (host `maxBytes`), its
 * size read here where the host did not say it. The fence to put in the document, or null.
 */
export declare function putImage(file: Blob, name?: string): Promise<FenceBlock | null>;
/** How the lookup knows an image fence: enough of a definition for the hosts to draw it. */
export declare const imagePicture: AppDef;
