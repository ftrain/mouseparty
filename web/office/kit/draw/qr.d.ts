/**
 * A QR code from bytes: the standard construction (byte mode, error correction level L, the smallest
 * version that fits, the best mask), after Project Nayuki's reference. Returns the modules, row by row.
 * There is no native API for this.
 */
export declare const QR_MAX_BYTES = 2953;
export declare function qrCode(bytes: Uint8Array): boolean[][];
/** The code as SVG, with the quiet zone the standard asks for. */
export declare function qrSvg(bytes: Uint8Array, px?: number): string;
