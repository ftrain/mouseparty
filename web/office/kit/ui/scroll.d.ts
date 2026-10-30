/**
 * Scrolling, in one place. The page is never taller than the visible window (kit/ui/chrome.ts): the document sits in a
 * column, `.to-main`, that scrolls by itself, and nothing scrolls the window. So every scroll-to in the kit and the
 * apps (the caret kept above a phone's keyboard, a match found, a note, a completion, a card or a stop brought into
 * view, a row dragged to the column's edge, a pinch keeping the words under the fingers) goes through here and moves
 * the boxes that scroll, from the nearest out, by just what it takes. (Were the window to scroll, the bar stuck to its
 * top would have to be measured into place under Safari's keyboard after events that come late or never.)
 *
 *   scrollerOf(el)        the nearest box that scrolls the way `el` would be scrolled (the column, a list's own box)
 *   reveal(el, opts)      `el` (or a rect over it, such as the caret's) brought inside what can be seen
 *   revealCaret(box, o)   the caret in `box` brought inside what can be seen of the column, above the bar: the one rule
 *                         for a caret, after an edit, a focus moved, the column settled or the window put back; after an
 *                         edit (`middle`), a caret below the middle is brought to it, as a typewriter keeps its line
 *   seen()                what can be seen: the visible window
 *   room()                where a menu, the context bar, the link box or the completion list may sit: the page's
 *                         frame (.to-page: <to-chrome>, or a host's, kit/ui/page-frame.ts) within what can be seen
 *   pinWindow()           the window put back at its top, should the browser have slid it (iOS does, for a box focused
 *                         and for a caret it finds under the keyboard); true when it had to
 *   gliding()             the column is moving for a phone's keyboard (kit/ui/page-frame.ts): the caret is kept in sight once it settles
 *
 * test/scroll.test.ts fails if any other module reads `window.scrollY` or scrolls the window.
 */
/** A box on the screen: top, left, bottom and right in the page's CSS pixels. */
export interface Box {
    top: number;
    left: number;
    bottom: number;
    right: number;
}
/**
 * The nearest box that scrolls vertically (or sideways, `axis: 'x'`) and has more than it shows, from `el` out; else
 * the column, if `el` is in one; else the document's own scroller (an editor drawn without the shell, in a test).
 */
export declare function scrollerOf(el: Element | null, axis?: 'x' | 'y'): HTMLElement;
/** What can be seen: the visual viewport (above a phone's keyboard, inside a pinch). */
export declare function seen(): Box;
/** Where something placed over the page may sit: the column's box within what can be seen (all of it, outside the shell). */
export declare function room(): Box;
export interface Reveal {
    /**
     * Where in what can be seen: as little as it takes (the default), the middle, or the top; or `middle`: at the middle
     * when it is below it, and as little as it takes otherwise (the caret as you type: kit/text/text.ts).
     */
    block?: 'nearest' | 'center' | 'start' | 'middle';
    /** A part of `el` to bring in rather than all of it (a caret's rect, a range's). */
    rect?: Box;
    /** Room to leave between it and the edge, in CSS pixels. */
    margin?: number;
    /** Sideways too, as little as it takes. */
    inline?: boolean;
}
/**
 * `el` (or `opts.rect` over it) brought into view: each box that scrolls round it, the nearest first, moved by what it
 * takes, and nothing else. The window itself is never scrolled.
 */
export declare function reveal(el: Element | null | undefined, opts?: Reveal): void;
/**
 * The caret in `box` (a `<to-text>`, a field) brought inside what can be seen of the column, above a phone's bar and
 * keyboard. A caret in a block with no words yet (the row or the paragraph Enter just made) has no rect of its own:
 * its block stands in for it, the element the caret sits in, never the whole box (a document's box is the document,
 * and revealing it scrolled to the top: Paul, 2026-10-11, "the cursor goes beneath the nav"). Nothing when the
 * selection is not in `box`.
 *
 * After an edit (`middle`), a caret below the middle of what can be seen is brought to the middle, and one above it is
 * only kept in sight (Paul, 2026-10-12: "enough padding at the end of a document we are editing that the cursor stays
 * roughly in the middle of the screen unless we scroll"); the room below the last line is the column's padding
 * (page.css). A click, an arrow key or Find never asks for it, so the person's own scroll is never undone.
 */
export declare function revealCaret(box: Element, opts?: {
    middle?: boolean;
}): void;
/**
 * The caret drawn again where the words are. iOS draws the caret of a box it has focused itself, where the box's
 * selection was when the keyboard rose, and leaves it there after the page puts the window back (pinWindow) or the
 * header steps aside under the words (chrome.ts editing): a caret standing in the dark above the first line, until
 * the next key (Paul, 2026-10-13: "There's a big black area the cursor is in it. Then it focuses"). The same selection
 * written again makes it draw the caret afresh, where the words now are. True when it was written.
 */
export declare function redrawCaret(box: Element): boolean;
/** The window back at its top: the page is the visible window and the column scrolls, so the window never should. True when it had slid. */
export declare function pinWindow(): boolean;
/** The column is gliding to a keyboard's height (kit/ui/page-frame.ts): where the caret should be kept is known once it settles, and it is kept then. */
export declare const gliding: () => boolean;
