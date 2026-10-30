/**
 * A page's frame: what holds a column the visible window's height, for the site's chrome (<to-chrome>, kit/ui/chrome.ts)
 * and for a host's page alike (docs/library.md, A host's page), so the two keep one copy of it. The element it is
 * given (`.to-page`, page-frame.css) is the visual viewport's height, set as it resizes, and the window is put back at
 * its top whenever the browser slides it (iOS does, for a box it focused and a caret it finds under the keyboard); its
 * column's `main` scrolls by itself, and its height is `--to-col-h` on the frame, for what fills it (a canvas, a map).
 *
 * Under a finger a change of height is the keyboard: the frame is `gliding` while the column moves to it (the bar
 * fades, page-frame.css) and settles a fifth of a second later, or at once under reduced motion; the caret, where a box
 * being edited has it, is kept in sight once it has settled, never in flight. And while a box of the frame's (words, a
 * field) has the focus from the person's own tap or key, not the focus a page opens with (which raises no keyboard), the
 * frame is `editing`: under a finger the header steps aside but for the menu button, translucent in the corner. A hop
 * to the bar, a menu or a dialog and back is neither; a tap on the frame's header or menu button acts on the box in
 * hand without being a tap into it.
 *
 * A Lit element holds one by making it (`new PageFrame(this)`), as a controller; an element of another kind calls its
 * `hostConnected`, `hostUpdated` (once its column is drawn) and `hostDisconnected` itself.
 */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
/** What a box hands the focus to and back from without the person having left it: the bar, a menu, a popover, a dialog. */
export declare const ASIDE = "to-bar, to-context, [popover], dialog, to-dialog, to-link-pop, to-complete";
export interface FrameOpts {
    /** What scrolls: the column's `main`, `.to-column > main` inside the frame unless said. */
    main?: () => HTMLElement | null;
    /**
     * Told in the same frame as `editing` is worked out, before it: the element with the focus, whether it was typed in,
     * and whether the person touched or pressed a key within the second (the site's chrome works out `indoc` from them).
     */
    focused?: (at: Element | null, typed: boolean, recent: boolean) => void;
}
export declare class PageFrame implements ReactiveController {
    /** When the person last touched, clicked or pressed a key: a box focused by the page itself (a document opening) is not editing. */
    touched: number;
    private settleTimer;
    private sized;
    private readonly el;
    private readonly opts;
    constructor(el: HTMLElement & Partial<ReactiveControllerHost>, opts?: FrameOpts);
    /** The column: what scrolls. */
    get main(): HTMLElement | null;
    /** A box of the frame's has the focus from the person (page-frame.css: the header steps aside under a finger). */
    get editing(): boolean;
    hostConnected(): void;
    hostDisconnected(): void;
    /** The column's height, for what fills it (a canvas, a map): `--to-col-h`, watched from the first time the column is there. */
    hostUpdated(): void;
    /** The frame the visible window's height (the layout viewport's while a desktop's pinch has zoomed in), the window at its top. */
    private fit;
    /**
     * The frame and its column hold still: only `main` scrolls. The browser scrolls any box to bring a focused element
     * into view, a hidden one too (a bar's button, focused while the bar is away under the column's foot, scrolled the
     * chrome up by the header's height: the walks found it); so as the window is pinned (scroll.ts pinWindow), these are.
     */
    private pinSelf;
    /** The column moving (a keyboard's height, the bar arriving or leaving): `gliding` until it settles. */
    glide(): void;
    /** The column settled: the bar back, and the caret (where a box has it) kept in sight of what is left above the keyboard. */
    private settle;
    /** The caret, where a box being edited has it, inside what can be seen of the column (scroll.ts revealCaret, the one rule), and drawn afresh there (redrawCaret: iOS leaves its own where it first drew it). */
    private keepCaret;
    /**
     * The window slid (iOS slides it to bring a box it focused, or a caret it finds under the keyboard, into sight: a
     * scroll of the window, which the visual viewport's own `scroll` does not always tell) is put back at its top, and the
     * caret is brought into sight the column's way instead (Paul, 2026-10-11: "I keep losing my cursor in Outline
     * because it's below the keyboard"). While the column glides, it is kept once it settles.
     */
    private pin;
    private onGlided;
    private onPerson;
    /**
     * A box took the focus or left it. Taken in a person's own gesture (a tap, a key), or typed in, it is editing; the
     * focus a page is opened with is not (iOS raises no keyboard for it), so the header stays until the first tap.
     * A hop to the bar, a menu or a dialog and back is neither.
     */
    private onFocus;
}
