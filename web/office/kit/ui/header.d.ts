/**
 * <to-header>: a page's header in the site's look, for a page that is not the site and has no <to-shell>
 * (docs/library.md, A page's header): the way back up (breadcrumbs), the page's title, and room for the page's own
 * search and actions. On a narrow page the search takes a row of its own under the rest.
 *
 * - `heading`: the title. `editable`: the title is a field (Enter or leaving it keeps a new one, told in
 *   `titlechange`, `{ title }`; Escape puts the old one back). A `heading` the page gives while the field has the focus
 *   (a route changed under it) is the field's words from then on, and leaving it tells nothing of the words before.
 *   `level`: the heading's level (1).
 * - A long title wraps to two lines before it is cut short; a title that is a field, one line, is drawn smaller (to
 *   three quarters of its size) before it is. Beside the search, the search gives way first, down to its least.
 * - `crumbs`: the way back up, `{ label, href? }` each (Crumb), from the top. One with an address is a link; one without
 *   is a button. Either is told in `crumbpick`, cancelable, `{ index, crumb }`: a page that routes itself prevents the
 *   link and goes there its own way.
 * - Slots (kit/ui/slots.ts): `start` before the title (an icon, a back button), `search` (a <to-search>, say) and
 *   `actions` at the end (buttons, a menu).
 */
import { LitElement, type PropertyValues, type TemplateResult } from 'lit';
/** One step of the way back up: its words and, where it opens as a link, its address. */
export interface Crumb {
    label: string;
    href?: string;
}
export declare class ToHeader extends LitElement {
    static properties: {
        heading: {};
        editable: {
            type: BooleanConstructor;
        };
        level: {
            type: NumberConstructor;
        };
        crumbs: {
            attribute: boolean;
        };
    };
    heading: string;
    editable: boolean;
    level: number;
    crumbs: Crumb[];
    private slots;
    /** The title as it was when the field took the focus: what Escape puts back. */
    private was;
    /** The title the field last took (as it took the focus, or kept, or was given while it had it): a heading other than it was given by the page. */
    private took;
    private sized;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected updated(changed: PropertyValues<this>): void;
    /** A title that is a field drawn smaller where its words would be cut short, down to three quarters of its size. */
    private fit;
    /** The title's field, when it is editable. */
    get field(): HTMLInputElement | null;
    /** The title typed kept: told when it changed (and is not empty), else the field shows the title again. */
    private keep;
    private onKey;
    private crumb;
    render(): TemplateResult<1>;
}
