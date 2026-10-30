export interface PdfPage {
    /** Size in px; a px becomes 0.75pt, so a 960px slide is a 10in page. */
    w: number;
    h: number;
    /** Pixel size of the JPEG, which may be finer than w by h. */
    pw: number;
    ph: number;
    jpeg: Uint8Array;
}
export declare function pdf(pages: PdfPage[], title?: string): Uint8Array;
