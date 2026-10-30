/**
 * <to-toast>: the one voice. Anything on the page says something with toast('Link copied') (kit/core/say.ts); it is shown long enough to
 * read (`toastTime`: four seconds, more for more words) and held while a pointer is on it. What is shown and what is said
 * are two elements: the toast seen (aria-hidden) and a status region heard. While a modal dialog is open the page outside
 * it is inert, and a region there is never heard, so the words are said by an sr-only region inside the topmost modal
 * (made once per dialog), else by the page's own, chosen on the frame they are said (a dialog closed meanwhile is not
 * where the person is). A region is emptied, then given the words on the next frame, so the same words twice are said
 * twice.
 *
 * A toast with an action (say.ts) draws it as a button after the words, named by its label, and stays while the button
 * has the focus as while a pointer is on it; the button runs the action and the toast goes, as Escape inside it lets
 * it go. The words are still said by the region, and only the button is heard in the toast itself.
 */
import { LitElement } from 'lit';
import { type Action } from '../core/say.ts';
export declare class ToToast extends LitElement {
    static properties: {
        message: {
            state: boolean;
        };
        action: {
            state: boolean;
        };
    };
    message: string;
    /** What the toast offers beside its words, or null. */
    action: Action | null;
    private timer;
    /** What is left of the time shown while a pointer holds it (null: it is counting down). */
    private left;
    private ends;
    private frame;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** Every region that may hold words: the page's and each dialog's. */
    private regions;
    private onToast;
    /** Shows and says `words`, with an action beside them or none: what a toast() heard does. */
    say(words: string, action?: Action | null): void;
    private count;
    private gone;
    private hold;
    /** Let go when neither a pointer nor the focus is on it: what leaves, and where the focus goes (a focusout's next). */
    private go;
    private act;
    render(): import("lit-html").TemplateResult<1>;
}
/**
 * A page with no <to-toast> of its own still says what is said (kit/core/mount.ts `setup` listens): the first toast
 * said while there is none on the page puts one at the end of its body, and it says the words; from then on that one
 * hears them, as a page's own would. A page that draws its own is never given a second.
 */
export declare function toastAnywhere(): void;
declare global {
    interface HTMLElementTagNameMap {
        'to-toast': ToToast;
    }
}
