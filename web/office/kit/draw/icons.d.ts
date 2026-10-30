/**
 * Icons: Lucide's, as inline SVG. UI is the set the kit and the bars reach for; an app's own icon is a
 * Lucide node too (see AppDef.icon). (A dependency, where native has nothing: there is no icon API.)
 *
 * A document may name any Lucide icon; the starter set draws at once, the rest after one lazy load.
 * LIBRARY is the starter set (":rocket Launch" in a drawing, ":rocket:" in words), by short name, drawn
 * under node as well as in a browser; the rest of Lucide joins it from one lazy import (icons-full.ts, which
 * the picker brings too; in the built site, part of the app file) under Lucide's own kebab-case names. loadIcons()
 * imports it once;
 * onIcons() tells whoever drew a name it did not know yet (<to-text> draws again); ensureIcons(names) is
 * what a caller awaits before drawing a view or an export that names an icon the starter set lacks
 * (iconNames(doc) lists what a document names). A view itself stays synchronous.
 */
import { type TemplateResult } from 'lit/html.js';
import { type IconNode } from 'lucide';
export type { IconNode };
export declare const UI: {
    readonly alignCenter: IconNode;
    readonly alignJustify: IconNode;
    readonly alignLeft: IconNode;
    readonly alignRight: IconNode;
    readonly bold: IconNode;
    readonly calendar: IconNode;
    readonly check: IconNode;
    readonly down: IconNode;
    readonly up: IconNode;
    readonly keys: IconNode;
    readonly minus: IconNode;
    readonly play: IconNode;
    readonly copy: IconNode;
    readonly download: IconNode;
    readonly open: IconNode;
    readonly view: IconNode;
    readonly insert: IconNode;
    readonly text: IconNode;
    readonly folder: IconNode;
    readonly globe: IconNode;
    readonly device: IconNode;
    readonly heading1: IconNode;
    readonly heading: IconNode;
    readonly highlight: IconNode;
    readonly image: IconNode;
    readonly outdent: IconNode;
    readonly indent: IconNode;
    readonly info: IconNode;
    readonly help: IconNode;
    readonly italic: IconNode;
    readonly language: IconNode;
    readonly home: IconNode;
    readonly link: IconNode;
    readonly list: IconNode;
    readonly listOrdered: IconNode;
    readonly menu: IconNode;
    readonly moon: IconNode;
    readonly pen: IconNode;
    readonly plus: IconNode;
    readonly print: IconNode;
    readonly qr: IconNode;
    readonly redo: IconNode;
    readonly search: IconNode;
    readonly share: IconNode;
    readonly shield: IconNode;
    readonly icon: IconNode;
    readonly strike: IconNode;
    readonly sun: IconNode;
    readonly auto: IconNode;
    readonly footnote: IconNode;
    readonly table: IconNode;
    readonly trash: IconNode;
    readonly underline: IconNode;
    readonly undo: IconNode;
    readonly unlink: IconNode;
    readonly close: IconNode;
    readonly lock: IconNode;
    readonly unlock: IconNode;
    readonly private: IconNode;
    readonly key: IconNode;
    readonly upload: IconNode;
    readonly compare: IconNode;
    readonly code: IconNode;
    readonly mail: IconNode;
    readonly post: IconNode;
};
/**
 * The icons a document may name, by short name: the starter set, with keywords in icons-search.ts so they
 * can be suggested; every other Lucide icon joins under its own name once the full library has loaded.
 */
export declare const LIBRARY: Record<string, IconNode>;
/** More icons by name (the full library, once loaded); a name already taken keeps its icon. */
export declare function addIcons(more: Record<string, IconNode>): string[];
/** Called by icons-full.ts once the whole of Lucide has joined LIBRARY: everyone waiting draws again. */
export declare function fullJoined(): void;
/** Whether the whole of Lucide has joined (a name unknown now is unknown for good). */
export declare const iconsComplete: () => boolean;
/** The whole of Lucide, imported once (lazily); resolves when it has joined, never rejects (where it cannot come, the names stay names). */
export declare function loadIcons(): Promise<void>;
/** Told once the whole of Lucide has joined; returns the way to stop listening. */
export declare function onIcons(f: () => void): () => void;
/** Every name known, loading the rest of Lucide first when one is not: resolves at once when they all are. */
export declare function ensureIcons(names: Iterable<string>): Promise<void>;
/**
 * The icon names a document's text holds, each once: ":name:" in words, ":name" at the start of a label (a
 * drawing's shape). A colon after a letter or digit ("10:30", "a:b") is not one. Generous on purpose: a word
 * read as a name only costs a lazy load.
 */
export declare function iconNames(doc: string): string[];
/** Whether what the picker gave is an icon's name ("car-front") rather than an emoji's character. */
export declare const isIconName: (s: string) => boolean;
/** The icon a document names, or undefined while nothing goes by that name. */
/** (Its own names alone: a document naming ":constructor:" names no icon, rather than an Object's.) */
export declare const iconNamed: (name: string) => IconNode | undefined;
export declare const iconInner: (node: IconNode) => string;
export declare function icon(node: IconNode, size?: number, cls?: string): TemplateResult;
/** An icon drawn into a picture (an SVG page), at x, y, `size` wide. A large one is drawn with a finer line. */
export declare const iconGlyph: (node: IconNode, x: number, y: number, size: number, color: string) => string;
/** An icon by name, drawn into a picture; '' for a name nothing goes by. */
export declare const glyphNamed: (name: string, x: number, y: number, size: number, color: string) => string;
