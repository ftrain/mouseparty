// What the viewer page has that isn't ours: what viewer.html sets, the vendored
// hls.js (a global, from hls.min.js) and pdf.js (pdf.min.mjs, imported by URL),
// as much of each as host.ts uses, and the browsers' own prefixed names.

export {};

declare global {
    interface Window {
        MOUSEPARTY_BASE: string; // /<session key>, set by viewer.html
        Hls?: HlsStatic;
    }
    interface Document {
        webkitFullscreenElement?: Element | null;
    }
    interface HTMLVideoElement {
        webkitPresentationMode?: string; // Safari's
    }
}

// ---------- hls.js ----------
export interface HlsStatic {
    new (config: Record<string, number | boolean>): Hls;
    isSupported(): boolean;
    Events: { MANIFEST_PARSED: string; ERROR: string };
    ErrorTypes: { MEDIA_ERROR: string };
}
export interface Hls {
    latency: number | null;
    targetLatency: number | null;
    loadSource(url: string): void;
    attachMedia(video: HTMLMediaElement): void;
    on(event: string, listener: (event: string, data: { fatal: boolean; type: string }) => void): void;
    recoverMediaError(): void;
    destroy(): void;
}

// ---------- pdf.js ----------
export interface PdfJs {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(source: { url: string; isEvalSupported: boolean }): PdfLoading;
}
export interface PdfLoading {
    promise: Promise<PdfDocument>;
    destroy(): void;
}
export interface PdfDocument {
    numPages: number;
    getPage(number: number): Promise<PdfPage>;
}
export interface PdfViewport {
    width: number;
    height: number;
}
export interface PdfPage {
    getViewport(opts: { scale: number }): PdfViewport;
    render(opts: { canvas: HTMLCanvasElement; viewport: PdfViewport }): { promise: Promise<void>; cancel(): void };
}
