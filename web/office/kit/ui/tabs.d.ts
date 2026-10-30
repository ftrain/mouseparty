/**
 * <to-tabs>: a page's views named along a row, one of them current (docs/library.md, The kit's small pieces): a
 * project's Overview, Graph, Model and Documents; a company's People and Model. Each tab is a link to its view's
 * address (`href`), or a button where the page has none; the current one is marked `aria-current` ("page" on a
 * link, "true" on a button), and a count may follow its words. A tab taken is told in `tabpick`, bubbling and
 * cancelable, `{ value, tab }`: a page that routes itself prevents the link and goes there its own way; either way
 * the tab is shown current at once, and a page that keeps the choice elsewhere gives `value` again.
 *
 * - `tabs`: `{ value, label, href?, count?, icon? }` each (Tab), in order. `value`: the current one's. `label`: the
 *   row's name for a screen reader ("Views of this project").
 * - It is a `<nav>` of links, not a tab list: each view has an address of its own and a reader moves between them
 *   with Tab, as between links.
 */
import { LitElement, type TemplateResult } from 'lit';
import { type IconNode } from '../draw/icons.ts';
/** One tab: the value it stands for, its words, where it opens, how many its view holds, an icon before its words. */
export interface Tab {
    value: string;
    label: string;
    href?: string;
    count?: number;
    icon?: IconNode;
}
export declare class ToTabs extends LitElement {
    static properties: {
        tabs: {
            attribute: boolean;
        };
        value: {};
        label: {};
    };
    tabs: Tab[];
    value: string;
    /** The row's name, for a screen reader. */
    label: string;
    constructor();
    createRenderRoot(): this;
    private tab;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-tabs': ToTabs;
    }
}
