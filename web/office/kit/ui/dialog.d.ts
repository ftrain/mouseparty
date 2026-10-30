/**
 * <to-dialog>: a native <dialog>, modal, with a heading and a close button. Escape closes it, a click on
 * the backdrop too, and focus goes back where it was (the browser's own doing, and this element's where the browser's
 * finds nothing: a frame whose page had it). Give it `body`, a
 * template, and call show(); the body is drawn only while it is open. `describedby`, the ids of elements in the body,
 * is the dialog's description: what a screen reader says after its name as it opens (the link guard's host).
 *
 * One modal at a time (Paul, 2026-10-10: "the outer one hands over"): a dialog opened from a control inside another is
 * never stacked on it. A task with a step of its own (Share's Password…) steps aside with handOver() and comes back as it
 * was; a menu (the drawer, kit/ui/drawer.ts) closes first and names the way back with handBack().
 */
import { LitElement, nothing, type TemplateResult } from 'lit';
/**
 * The focus given back to `from` when a dialog over it closes: to the button of the menu `from` was in if that menu has
 * closed meanwhile, and to the document's column where nothing it names can take it. (The drawer's too: kit/ui/drawer.ts.)
 */
export declare function focusBack(from: HTMLElement | null): void;
/**
 * A menu's row that opens a dialog: the menu (`close`) closes first, the focus is put on `back` (the button the menu
 * was opened from), and `open` opens the dialog. The dialog's way back is then `back`: the browser's own, and a
 * <to-dialog>'s `from`, are where the focus was as it opened. The menu does not come back.
 */
export declare function handBack(close: () => void, back: HTMLElement | null, open: () => unknown): unknown;
export declare class ToDialog extends LitElement {
    static properties: {
        heading: {};
        describedby: {};
        body: {
            attribute: boolean;
        };
        open: {
            state: boolean;
        };
    };
    heading: string;
    describedby: string;
    body: TemplateResult | typeof nothing;
    open: boolean;
    readonly uid: string;
    constructor();
    createRenderRoot(): this;
    get dialog(): HTMLDialogElement;
    /** What had the focus when it opened: it has it again when it closes. */
    private from;
    /** Stepped aside for another (handOver): closed, its body (and so its scroll) and its `from` kept, no to-close said. */
    private aside;
    show(): Promise<void>;
    /**
     * A step of this dialog's task in a dialog of its own (`next`, opened from `back`, a control in this one): this one
     * closes and `next` opens, one modal at a time; when `next` closes (its Cancel, Escape, or the thing done) this one is
     * open again as it was, nothing drawn again (what was typed, chosen and scrolled kept), the focus on `back`.
     */
    handOver(next: ToDialog, back: HTMLElement): Promise<void>;
    close(): void;
    private onClose;
    render(): TemplateResult<1>;
}
