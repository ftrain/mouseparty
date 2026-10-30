/**
 * <to-find>: Find in this document (Mod+F). A small bar beside the app's bar, on the column's side of it (under it
 * on a wide screen, over it where the bar is at the column's bottom, a phone's): the words to find, how many
 * there are and which is in hand, previous and next, Close. Every word of the search is found (search.ts's
 * terms: words, "phrases in quotes", case and accents aside). Where the app shows words, they are marked
 * through the browser's own highlights (the CSS Custom Highlight API: nothing in the page is changed), the
 * one in hand stronger, brought into view in the column (kit/ui/scroll.ts). An editor whose words are not text on
 * the page (a sheet's cells are inputs) finds them itself: it has a `find(terms)` (Findable) that counts and goes
 * to each. Closed, the focus goes back where it was (Escape takes it on to the match in hand, where there is one).
 */
import { LitElement } from 'lit';
/** What an editor found: how many, and a way to show the one in hand. */
export interface Found {
    count: number;
    go(i: number): void;
    /** The marks taken away (before a new search, or as the bar closes). */
    clear?(): void;
    /** The bar closed by Escape: the focus goes to the match in hand. */
    leave?(): void;
}
/** An editor that finds in its own way. */
export interface Findable {
    find(terms: string[]): Found;
}
/** Where the terms are among the words shown under `root`, in the order they are read (an editor that shows only its matching rows marks them with these too). */
export declare function rangesIn(root: Element, terms: string[]): Range[];
export declare const highlights: () => HighlightRegistry | null;
export declare class ToFind extends LitElement {
    static properties: {
        open: {
            type: BooleanConstructor;
            reflect: boolean;
        };
        query: {
            state: boolean;
        };
        at: {
            state: boolean;
        };
        count: {
            state: boolean;
        };
    };
    open: boolean;
    query: string;
    /** The match in hand, from 0; -1 for none. */
    at: number;
    count: number;
    /** Where to look: the editor. */
    target: Element | null;
    /**
     * Placed by the target alone (`find`, on a page that is not the site): at the top of what of the target is in view,
     * under its bar where it draws one, at its right edge. Otherwise placed by the site's page (its column, its header).
     */
    near: boolean;
    private found;
    /** What had the focus when the bar opened. */
    private from;
    constructor();
    createRenderRoot(): this;
    get input(): HTMLInputElement | null;
    /** Opened (or, open, the words chosen again to type over); the words selected in the page are what it looks for. */
    show(): Promise<void>;
    close(): void;
    /** Beside the app's bar, on the column's side of it: under it at the column's top, over it at the column's bottom (a phone's). */
    private place;
    /** By the target (`near`): under its bar, or at its top, as far as either is in view; at its right edge. */
    private placeNear;
    /** Look again (the document may have changed) and show the `i`th. */
    private run;
    next: () => void;
    prev: () => void;
    private onKey;
    render(): import("lit-html").TemplateResult<1>;
}
/**
 * Find in `target` (an editor a page mounted) on a page that is not the site: the page's one <to-find> for it, made
 * the first time and put at the end of the page's body (or in `into`), opened over the target and placed by it alone,
 * never by the site's bar, column or header. Mod+F is the page's to bind (the editors leave it to the page); it calls
 * this. The bar, open.
 */
export declare function find(target: Element, into?: Element): Promise<ToFind>;
declare global {
    interface HTMLElementTagNameMap {
        'to-find': ToFind;
    }
}
