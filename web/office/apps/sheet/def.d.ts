import { type Doc } from '../../kit/core/app.ts';
/** The document's name: its title head field. */
export declare const titleOf: (doc: Doc) => string;
/** The document with this name: one head op, written back. */
export declare const retitle: (doc: Doc, title: string) => Doc;
declare const _default: import("../../kit.ts").AppDef;
export default _default;
