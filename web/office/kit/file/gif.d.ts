/**
 * An animated GIF from RGBA frames: GIF89a, one local colour table per frame (median cut to 256 colours),
 * transparency for see-through pixels, and the Netscape loop so it plays forever. Hand-rolled on purpose:
 * the browser has no GIF encoder of its own (WebCodecs and ImageEncoder stop at stills and video), and the
 * whole of it is shorter than a dependency's README. The Deck's film of itself and Motion's export both
 * come through here. No DOM.
 */
export interface GifFrame {
    /** RGBA, width*height*4 bytes. */
    data: Uint8ClampedArray | Uint8Array;
    delayMs: number;
}
/**
 * Quantize RGBA to at most 256 colours by median cut. Returns the
 * palette as RGB triples and one index per pixel. Pixels with alpha below
 * 128 are left out of the palette and get the index one past its end.
 */
export declare function quantize(data: Uint8ClampedArray | Uint8Array): {
    palette: Uint8Array;
    indices: Uint8Array;
};
/** Encode RGBA frames of one size as an animated GIF: looping for ever by default; `loop` repeats it that many times after the first play, and false leaves the loop block out (it plays once). */
export declare function encodeGif(width: number, height: number, frames: GifFrame[], opts?: {
    loop?: number | false;
}): Uint8Array;
