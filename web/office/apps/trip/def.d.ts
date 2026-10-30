import { type Doc } from '../../kit/core/app.ts';
/** The document's own title ('' for none: a GPX or GeoJSON file falls back to the route's ends). */
export declare const titleOf: (doc: Doc) => string;
export declare const retitle: (doc: Doc, title: string) => Doc;
declare const _default: import("../../kit.ts").AppDef;
export default _default;
