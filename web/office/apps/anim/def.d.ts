import { type Doc } from '../../kit/core/app.ts';
export declare const titleOf: (doc: Doc) => string;
export declare const retitle: (doc: Doc, title: string) => Doc;
/** The video: the GIF's frames, each drawn on a canvas at the stage's size and held 1/fps of a second; one round of the motion. */
export declare function animWebm(doc: Doc): Promise<Uint8Array | null>;
declare const _default: import("../../kit.ts").AppDef;
export default _default;
