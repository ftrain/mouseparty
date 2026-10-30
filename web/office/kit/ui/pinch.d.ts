export interface Pinch {
    /** The spread now over the spread when the second finger came down. */
    scale: number;
    /** The midpoint between the fingers, in the viewport's coordinates. */
    x: number;
    y: number;
    /** Where the fingers came down. */
    targets: Element[];
}
export interface PinchHandlers {
    /** False declines the gesture: no move or end follows. */
    start?(p: Pinch): void | boolean;
    move(p: Pinch): void;
    end?(p: Pinch): void;
}
export interface ZoomHandlers {
    /** The frame that scrolls the picture (the `data-spatial` element); null when there is none to pinch. */
    frame(): HTMLElement | null;
    /** The picture the zoom scales: measured to keep the point under the fingers. */
    picture(): Element | null;
    /** The zoom as shown now. */
    zoom(): number;
    /** The second finger is down: whatever the first began is let go. */
    start?(): void;
    /** The zoom drawn while the fingers are down, unrounded (the canvas holds it to its range); resolves once drawn. */
    set(z: number): unknown;
    /** The fingers lifted: the zoom rounded to the canvas's step and kept; resolves once drawn. */
    end(z: number): unknown;
}
/** A spatial canvas's pinch: on `host`, for gestures begun in its frame. Returns what stops it. */
export declare function pinchZoom(host: HTMLElement, h: ZoomHandlers): () => void;
/** The kit's pinch: the size of everything, outside the spatial canvases. Once per page. */
export declare function pinchSizes(): void;
