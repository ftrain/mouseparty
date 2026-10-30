/**
 * <to-link-pop>: the bubble under a link when the caret is in it: the
 * address, Open, Edit, Remove. `ask()` opens it with a box for the address
 * (making a link, or changing one). A manual popover (nothing dismisses it
 * but the editor), placed from the visual viewport so it sits above a
 * phone's keyboard. A tap outside it and outside its editor (the element
 * it sits in) hides it. Events: link-set (detail: the address, '' to
 * remove), link-remove, link-cancel (Escape in the address box: the editor
 * takes the focus back).
 */
import { LitElement } from 'lit';
export declare class ToLinkPop extends LitElement {
    static properties: {
        href: {
            state: boolean;
        };
        editing: {
            state: boolean;
        };
        shown: {
            state: boolean;
        };
    };
    href: string;
    editing: boolean;
    shown: boolean;
    private rect;
    constructor();
    createRenderRoot(): this;
    get pop(): HTMLElement;
    get input(): HTMLInputElement | null;
    /** The bubble for a link the caret is in. */
    show(rect: DOMRect, href: string): void;
    /** The bubble with a box for the address, for a link to make or change. */
    ask(rect: DOMRect, href: string): void;
    private reveal;
    /** A tap on neither the box nor its editor: the box goes (the selection may well not move, a margin is not selectable). */
    private onOutside;
    hide(): void;
    private place;
    private set;
    private open;
    private onKey;
    disconnectedCallback(): void;
    render(): import("lit-html").TemplateResult<1>;
}
