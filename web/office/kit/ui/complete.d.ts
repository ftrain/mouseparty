/**
 * <to-complete>: the list under the caret while ":" and letters are typed in a <to-text> (":ca"): icons and
 * emoji whose names or tags begin with the letters, the best eight, the first one highlighted. The editor owns
 * it: it says what was typed (`show`), moves the highlight (`move`) and picks (`current`); a tap on a row says
 * `complete-pick` (detail: the Completion). A manual popover like the link box (kit/ui/link-pop.ts): placed from
 * the visual viewport, so it sits above a phone's keyboard and no card or scrolling host clips it; a tap
 * outside it and outside its editor says `complete-cancel`.
 *
 * The starter icons answer at once; the first ":" imports the rest of Lucide with its tags (the icon picker's
 * module) and the emoji table, and the list grows when they arrive. Where the editor holds no icon runs
 * (a shape's label, plain words) only emoji are offered. After "@" the rows are the people the editor's host offers
 * (kit/text/text.ts `mentions`), each a name with a line under it, its glyph an "@", and the list is named People.
 */
import { LitElement } from 'lit';
/** One row: an icon by name, an emoji's character with its name, or a person a host offers after "@" (a name, a line under it). */
export interface Completion {
    kind: 'icon' | 'emoji' | 'mention';
    value: string;
    name: string;
    detail?: string;
}
/** The rest of Lucide with its tags (the picker's module joins them to the search) and the emoji table, imported once; never rejects. */
export declare function loadCompletions(): Promise<void>;
/** The rows for what was typed after the ":": the best icons first and the best emoji after them, half each when both have enough. */
export declare function completions(query: string, icons: boolean): Completion[];
/** What ":name:" typed in full becomes: the icon by that name (where icons are offered), else the emoji by that name, else null. */
export declare function completeNamed(name: string, icons: boolean): Completion | null;
export declare class ToComplete extends LitElement {
    static properties: {
        items: {
            state: boolean;
        };
        active: {
            state: boolean;
        };
        shown: {
            state: boolean;
        };
    };
    items: Completion[];
    active: number;
    shown: boolean;
    /** The listbox's id, and its rows' prefix. */
    readonly uid: string;
    private rect;
    constructor();
    createRenderRoot(): this;
    get pop(): HTMLElement;
    /** The highlighted row. */
    get current(): Completion | undefined;
    /** The id of the highlighted row, for the editor's aria-activedescendant. */
    get activeId(): string;
    /** The rows for the words at `rect`; the highlight goes back to the first when the rows are new. */
    show(rect: DOMRect, items: Completion[]): Promise<void>;
    /** The highlight one row on (1) or back (-1), round from the last to the first. */
    move(by: 1 | -1): void;
    hide(): void;
    private onOutside;
    /** Under the words typed, or above them when there is no room below (a phone's keyboard), always inside the visual viewport. */
    private place;
    updated(): void;
    disconnectedCallback(): void;
    render(): import("lit-html").TemplateResult<1>;
}
