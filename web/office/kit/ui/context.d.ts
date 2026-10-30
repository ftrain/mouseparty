/**
 * <to-context>: the small bar that comes up beside the thing in hand (a shape chosen on a canvas, a run of
 * rows, some words selected) with what can be done to it right there, and goes when the thing is let go.
 * It is a manual popover in the top layer, placed centred under its anchor (above it when there is no room
 * below), kept inside the visual viewport (above a phone's keyboard) and moved with the anchor as the page
 * scrolls. Its buttons never take the focus (an editor's selection stays, a phone's keyboard stays up), so a
 * host sets `items` and calls show(anchor) and hide(); the anchor is an element or a function giving a rect.
 * show(anchor, 'above') puts it above the anchor where there is room (below where there is not).
 *
 * On a phone (a coarse pointer) nothing floats: iOS draws its selection callout over whatever is near the words,
 * and no page can stop it over editable text (Paul, 2026-10-10: "Our menu keeps getting obscured under the native
 * copy paste menu"). So there the bar is a row of the bottom bar, `docked`: across the column's foot, where the app's
 * bar is, which slides away while it is up (`data-context-row` on the root; page.css) and back when it goes, with the
 * chrome's glide. `hint` is a line under the row (Paste refused: use the keyboard's).
 */
import { LitElement, type TemplateResult } from 'lit';
import type { IconNode } from '../draw/icons.ts';
export interface ContextItem {
    label: string;
    icon?: IconNode;
    /** A colour shown as a dot in the icon's place. */
    swatch?: string;
    /** Words shown on the button instead of an icon ("S", "M", "L"). */
    text?: string;
    /** Given, the button is a state: aria-pressed. */
    pressed?: boolean;
    disabled?: boolean;
    /** The keys, for the tooltip: "Mod+D". */
    keys?: string;
    does(): void;
}
/** A gap between groups. */
export declare const SEP = "|";
export type ContextEntry = ContextItem | typeof SEP;
type Anchor = HTMLElement | (() => DOMRect | null);
export declare class ToContext extends LitElement {
    static properties: {
        items: {
            attribute: boolean;
        };
        label: {};
        hint: {};
    };
    items: ContextEntry[];
    label: string;
    /** A line under the buttons ('' for none); cleared when the bar goes. */
    hint: string;
    /** Its items edit nothing (a read-only editor's Comment, kit/text/text.ts): it comes up inside a read-only editor too. */
    reads: boolean;
    private anchor;
    private side;
    private soon;
    constructor();
    createRenderRoot(): this;
    disconnectedCallback(): void;
    private get pop();
    get isOpen(): boolean;
    /** Up beside the anchor; called again, it moves to a new anchor. */
    show(anchor: Anchor, side?: 'below' | 'above'): void;
    hide(): void;
    /** A row of the bottom bar (on a phone): the app's bar steps aside for it (page.css reads the root's attribute). */
    private dock;
    /** Put it where the anchor is now. */
    refresh: () => undefined;
    private refreshSoon;
    private watch;
    private unwatch;
    protected updated(): void;
    private renderItem;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-context': ToContext;
    }
}
export {};
