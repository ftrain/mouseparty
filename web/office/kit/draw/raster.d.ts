/** A picture that did not come out (a canvas the browser refused, or none at all) is a failed file, never an empty one. */
export declare function drawn<T>(bytes: T | null | undefined): T;
/** Draw SVG markup as a PNG. `scale` trades sharpness for size; `paper` is painted under it first, or nothing when null (a tile keeps its clear squares). */
export declare function raster(svg: string, w: number, h: number, scale?: number, paper?: string | null): Promise<Uint8Array | null>;
/** Draw SVG markup on a canvas of w by h, over the paper: a frame for the video encoder (kit/file/webm.ts). */
export declare const canvas: (svg: string, w: number, h: number, paper?: string | null) => Promise<HTMLCanvasElement | null>;
/** Draw SVG markup as RGBA pixels (w by h, four bytes each): a frame for the GIF encoder. */
export declare function pixels(svg: string, w: number, h: number, paper?: string | null): Promise<Uint8ClampedArray | null>;
/** Draw SVG markup as a JPEG (over the paper, which a JPEG cannot leave clear): a page of the .pdf file. */
export declare function jpeg(svg: string, w: number, h: number, scale?: number, quality?: number): Promise<Uint8Array | null>;
