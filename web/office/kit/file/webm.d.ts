/**
 * A WebM video from frames: the frames the GIF is made of (the Animator's, the Deck's film), each a canvas held for
 * its length, encoded by the browser's own WebCodecs VideoEncoder (VP9 where it can, else VP8) and muxed here, by
 * hand, the way gif.ts writes GIF89a. Browsers have no muxer: MediaRecorder on canvas.captureStream() does write
 * WebM, but records in real time with the clock's jitter (a ten-second animation takes ten seconds and frames land
 * late) and Safari's records MP4; WebCodecs gives exact frame times and finishes as fast as the encoder runs.
 *
 * The file is Matroska as WebM has it: the EBML header, then a Segment of a SeekHead, Info (milliseconds, the
 * duration), Tracks (one video track), Clusters of SimpleBlocks (a cluster from each key frame) and Cues at the key
 * frames. Every size is written once its length is known (the parts are built first, then the bytes), never the
 * "unknown size" a live recorder writes, so it plays and seeks in every browser and in VLC. No audio. muxWebm touches
 * no DOM (test/webm.test.ts reads its files under node); webmOf and webmReady need a browser's encoder.
 */
/** A frame to encode: a canvas, drawn, and how long it stays. */
export interface WebmFrame {
    canvas: CanvasImageSource;
    ms: number;
}
/** An encoded frame: its bytes, its start, and whether it stands alone. */
export interface WebmChunk {
    data: Uint8Array;
    ms: number;
    key: boolean;
}
/** The one track: the codec as Matroska names it, and the size. */
export interface WebmTrack {
    codec: 'V_VP9' | 'V_VP8';
    w: number;
    h: number;
}
/** The file: the chunks in order (the first a key frame), the whole length in milliseconds. */
export declare function muxWebm(track: WebmTrack, chunks: WebmChunk[], durationMs: number): Uint8Array;
/** Whether this browser can make a WebM at this size: a format's `available` (kit/core/app.ts Export). */
export declare const webmReady: (w: number, h: number) => Promise<boolean>;
/** Said where no encoder is (the API and the CLI, under node). */
export declare const WEBM_IN_BROWSER = "WebM is made in the browser: open the link and save it from Download.";
/** The frames, encoded and muxed: a WebM of w by h, or null where the browser cannot make one. (`bitrate` is the test's, to compare.) */
export declare function webmOf(frames: AsyncIterable<WebmFrame>, w: number, h: number, bitrate?: number): Promise<Uint8Array | null>;
