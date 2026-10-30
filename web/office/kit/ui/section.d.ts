/**
 * <to-section>: one part of a host's page (docs/library.md, The kit's small pieces): a heading with how many things
 * it holds, the page's own actions beside it (Add, a menu), and the things themselves, the page's children, drawn
 * under them; or, with nothing in it, the words the page gives for that. A person's projects, a lead's meetings, a
 * company's people, each a section of a record's page, in one look.
 *
 * - `heading`: its name. `count`: how many it holds, drawn after the name; null for none said. `level`: the
 *   heading's (2). `empty`: what an empty section says ("No meetings yet"), drawn where `count` is 0, or where the
 *   section has no child of its own (a child given with a `slot` is not one).
 * - Slot (kit/ui/slots.ts): `actions`, at the heading's end (a button, a menu). Everything else the page puts in the
 *   section is its body, left where the page put it, under the heading: a <to-table>, a list, anything.
 */
import { LitElement } from 'lit';
export declare class ToSection extends LitElement {
    static properties: {
        heading: {};
        count: {
            type: NumberConstructor;
        };
        level: {
            type: NumberConstructor;
        };
        empty: {};
    };
    heading: string;
    count: number | null;
    level: number;
    empty: string;
    readonly uid: string;
    private slots;
    private watch;
    /** Whether the body had a child of its own when it was last drawn. */
    private had;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** Whether the page gave the section a body: a child of its own, beside what is drawn here and the slots. */
    get has(): boolean;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-section': ToSection;
    }
}
