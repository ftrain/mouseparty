/**
 * <to-avatar>: a person drawn small on a host's page (docs/library.md, The kit's small pieces): their initials
 * (kit/ui/initials.ts `initial`) in a disc of a hue of their own (`hueOf`), the same for the same name on a Board's
 * card, in a typed table's person cell and here, with their name for a screen reader and as the disc's title. A page
 * draws one beside a lead's owner, a document's people, a task's assignee.
 *
 * - `name`: the person's. `href`: where the disc opens (a link); without it, a plain disc. `size`: `s` (1.5rem, a
 *   table's), `m` (1.75rem, the default) or `l` (2.5rem, a page's header); a page may set `--to-av-size` instead.
 * - A few in a row (a document's people) go in a `.to-avatars`, each overlapping the one before it a little.
 */
import { LitElement } from 'lit';
export declare class ToAvatar extends LitElement {
    static properties: {
        name: {};
        href: {};
        size: {
            reflect: boolean;
        };
    };
    name: string;
    href: string;
    size: 's' | 'm' | 'l';
    constructor();
    createRenderRoot(): this;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-avatar': ToAvatar;
    }
}
