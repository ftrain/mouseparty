/**
 * A locked document placed in another, opened in an editor (kit/share/locked.ts holds the fence and the card).
 *
 *   unlockForm(o)      the unlock dialog's form: one password field and Unlock, a wrong password said so.
 *                      The shell's own unlock dialog draws it too, so there is one.
 *   openPlaced(body)   a locked fence's document opened: by a password already given this visit, or the
 *                      unlock dialog; its text kept for the visit (never written into the outer document).
 *   <to-locked-doc>    the card in an editor: the locked card, a tap asks for the password; opened, the
 *                      document drawn small. With `caption`, its name and app under it.
 */
import { LitElement, type TemplateResult } from 'lit';
import type { Locker } from '../share/crypt.ts';
import './dialog.ts';
/** Said on the window when a placed document is opened, so every card of it draws it open. */
export declare const OPENED_EVENT = "to-locked-open";
/** The unlock dialog's form: the field, Unlock (Opening… while it works), and a wrong password said so. */
export declare function unlockForm(o: {
    wrong: boolean;
    busy: boolean;
    submit: (e: Event) => void;
    input: () => void;
}): TemplateResult;
type Opened = {
    app: string;
    payload: string;
    text: string;
    locker: Locker;
};
/** A locked fence's document, opened: by a password given this visit, else the unlock dialog. Null when it is not opened. */
export declare function openPlaced(body: string): Promise<Opened | null>;
/** The card of a locked document in an editor: locked, a button that asks for the password; opened, the document. */
export declare class ToLockedDoc extends LitElement {
    static properties: {
        ref: {
            attribute: boolean;
        };
        caption: {
            type: BooleanConstructor;
        };
    };
    /** The locked fence's body: the sealed link. */
    ref: string;
    caption: boolean;
    constructor();
    createRenderRoot(): this;
    private redraw;
    connectedCallback(): void;
    disconnectedCallback(): void;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-locked-doc': ToLockedDoc;
    }
}
export {};
