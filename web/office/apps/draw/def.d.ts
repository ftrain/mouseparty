import { type Doc } from '../../kit/core/app.ts';
import { type Tile } from '../../kit/draw/tile.ts';
export declare const titleOf: (doc: Doc) => string;
export declare const retitle: (doc: Doc, title: string) => Doc;
/** The tile a drawing offers: its pixel grid in pixel mode, else the background it carries, else a clear one. */
export declare function tileOfDoc(doc: Doc): Tile;
declare const _default: import("../../kit.ts").AppDef;
export default _default;
