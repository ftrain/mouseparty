/**
 * A picture a host keeps: a fence named "image" whose body is the host's own reference to the bytes, with the
 * words for it and its size among the fence's attributes:
 *
 *   ```image {alt="A cat on a mat" w=640 h=480}
 *   asset:7f3a…
 *   ```
 *
 * The reference is opaque to the kernel: a server's id, never a web address and never the bytes themselves (a
 * data: URL), so a document fetches nothing from another site and the link stays short. The site keeps no bytes
 * and so has no pictures (Paul, 2026-10-11); a page that keeps them turns the picture on through its host
 * (kit/core/host.ts `images`; Paul, 2026-10-19: "it shouldn't be there for the URL backend, but for this backend an
 * image module makes sense"). A fence needs no new block kind: the reader, the writer, the operations and their
 * transformation take it as any fence, and an attribute beyond these (a class a host writes, `class=thumb`) rides
 * through every edit untouched. `align=left`, `align=right` or `align=center` sets the picture at its own size (its
 * `w`, else a column's share) against that side, the words wrapping round it where they can; no `align` is the
 * picture at the column's width (Paul, 2026-10-29: "add image alignment to the image functions ... They're enormous
 * now"). `withAlign` writes it, every other attribute riding along. These helpers read one and make one, and list a document's references with no DOM,
 * for a server that collects what nothing names any more or asks who may see a picture.
 */
import { type Attrs, type Block, type Doc, type FenceBlock } from './model.ts';
/** The fence's language that names a host-kept picture. */
export declare const IMAGE_LANG = "image";
/** A picture as a document holds it: the host's reference, the words for whoever cannot see it, its size in pixels where known. */
export interface Image {
    ref: string;
    alt: string;
    w?: number;
    h?: number;
    /** Where the picture sits, at its own size; none is the column's width. */
    align?: Align;
}
/** The ways a picture is aligned (header). */
declare const ALIGNS: readonly ['left', 'center', 'right'];
export type Align = (typeof ALIGNS)[number];
/** The picture a block holds, or null: not an image fence, or one whose body is no reference a host would keep. */
export declare function imageOf(b: Block | undefined | null): Image | null;
/** An image fence aligned `align`, or at the column's width for null (header): every other attribute rides along. */
export declare function withAlign(b: FenceBlock, align: Align | null): FenceBlock;
/** Whether a block is an image fence, well formed or not (a lint names the malformed one). */
export declare const isImage: (b: Block) => boolean;
/** An image fence for a host's reference: its alt where there is one, its size where known; `a` carries any other attribute along. */
export declare function imageBlock(ref: string, alt?: string, w?: number, h?: number, a?: Attrs): FenceBlock;
/**
 * Every picture's reference in a document, each once, in order: its own image fences, and those of the documents
 * fenced inside it (a text on a slide), read as documents. A fence of no app (code) is read too, since the kernel
 * knows no app's name: a reference it names once too often costs a server a kept byte, where one it missed would
 * lose a picture.
 */
export declare function imageRefs(doc: Doc | Block[]): string[];
export {};
