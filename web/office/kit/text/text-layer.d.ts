/**
 * A document's text layer as its app gives it (src/doc/text.ts): the app's own where its model is spatial
 * (AppDef.text), else the kernel's from its blocks; a document fenced inside it read by its own app the same way.
 * No DOM: the API and the command line read it too (src/api.ts `text`); kit/text/text-view.ts draws it.
 */
import { type TextNode } from '../../doc/index.ts';
import { type AppDef, type Doc } from '../core/app.ts';
export declare function textLayer(def: AppDef, doc: Doc): TextNode[];
