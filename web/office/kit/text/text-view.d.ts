/**
 * The text layer (src/doc/text.ts, kit/text/text-layer.ts) drawn as plain HTML: h1 to h4, paragraphs with their marks,
 * lists (a task's state said before its words, its box drawn and kept from the reader), tables with their column
 * heads, fences as written, a document held in this one as a section of
 * its own, the footnotes, and a rule between pages. Nothing styled but by the kit's tokens: the person's size, the
 * theme's colors, reflowed (kit.css .to-display-text).
 *
 * The Display Link (kit/core/shell.ts) puts it first, for a screen reader, the pages after it hidden from one; its Text
 * button shows it instead of the pages. A web page made of a document (kit/file/exports.ts htmlOf) carries it the same
 * way. A link is a plain <a>, asked about by the link guard (kit/ui/link-guard.ts) like every other.
 */
import { type TextNode } from '../../doc/index.ts';
/** The text layer as HTML: what goes inside its box (the Display Link's .to-display-text, a web page's article). */
export declare const textHtml: (nodes: TextNode[]) => string;
