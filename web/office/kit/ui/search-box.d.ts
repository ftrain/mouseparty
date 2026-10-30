/**
 * <to-search>: one search across everything a host keeps (docs/library.md, A search box): its people, its companies,
 * its projects, its documents, whatever it calls a kind. The page gives the search, `search(q, signal)`, an async
 * function that answers with hits (SearchHit: a kind, an id, a title, and a subtitle, an icon and an address where it
 * has them); the box asks it as the person types, a moment after the last key (`delay`, 150ms), and lets go of a
 * question the next one replaces (its `signal` aborted, its answer never shown). The hits are drawn grouped by kind,
 * the kinds in the order `kinds` names them (each its words and its icon) with how many each has, then the actions the
 * page offers for what was typed (`create(q)`: "Add “Clea” as a company", the host's offer to make what it does not
 * know). While the answer is coming it says so, and an answer that fails says that.
 *
 * It is a combobox (ARIA's): the words in the field, Down and Up through the hits and the actions (around the ends),
 * Enter to choose, Escape to close the list and then to clear the field. A hit or an action chosen is told in
 * `searchpick`, cancelable, `{ query, hit }` or `{ query, action }` (SearchPick); a hit with an address is a link,
 * opened as a link is unless the page prevents it. A hit `disabled` is listed and never chosen: drawn quiet
 * (`aria-disabled`), passed over by Down, Up and Enter, a click on it nothing.
 *
 * Inline (the default) it is a field with the hits under it, for a page's header; `dialog` makes it a button that
 * looks like the field and opens the search in a dialog over the page. `hotkey` opens it (or puts the focus in the
 * field) from anywhere on the page with Mod+K; a page with one box sets it on that one.
 */
import { LitElement, type TemplateResult } from 'lit';
import { type IconNode } from '../draw/icons.ts';
/** A thing found: its kind (a key of the box's `kinds`), its id, its words, and where it opens. */
export interface SearchHit {
    kind: string;
    id: string;
    title: string;
    subtitle?: string;
    /** An icon (Lucide's), or a few letters or an emoji; else its kind's. */
    icon?: IconNode | string;
    href?: string;
    /** Listed but not chosen (a thing found with nowhere to open): drawn quiet, passed over by the keys, a click does nothing. */
    disabled?: boolean;
}
/** A kind of thing: its name as a group's heading ("People"), and its icon. */
export interface SearchKind {
    label: string;
    icon?: IconNode;
}
/** An action offered for what was typed ("Add “Clea” as a company"): its words, an id the page knows it by, an icon. */
export interface SearchAction {
    id: string;
    label: string;
    icon?: IconNode;
}
/** What was chosen: a hit, or an action, and the words typed. */
export type SearchPick = {
    query: string;
    hit: SearchHit;
    action?: undefined;
} | {
    query: string;
    action: SearchAction;
    hit?: undefined;
};
/** The page's search: the hits for the words, as a promise; `signal` aborted when a newer search replaces it. */
export type Searcher = (q: string, signal: AbortSignal) => Promise<SearchHit[]>;
export declare class ToSearch extends LitElement {
    static properties: {
        search: {
            attribute: boolean;
        };
        kinds: {
            attribute: boolean;
        };
        create: {
            attribute: boolean;
        };
        placeholder: {};
        label: {};
        delay: {
            type: NumberConstructor;
        };
        min: {
            type: NumberConstructor;
        };
        dialog: {
            type: BooleanConstructor;
        };
        hotkey: {
            type: BooleanConstructor;
        };
        query: {
            state: boolean;
        };
        hits: {
            state: boolean;
        };
        status: {
            state: boolean;
        };
        at: {
            state: boolean;
        };
        open: {
            state: boolean;
        };
    };
    search: Searcher | null;
    kinds: Record<string, SearchKind>;
    create: ((q: string) => SearchAction[]) | null;
    /** The words in the empty field ("Search people, companies, projects"); else Search. */
    placeholder: string;
    /** The field's name, for a screen reader; else Search. */
    label: string;
    /** How long after the last key the page is asked, in ms. */
    delay: number;
    /** The fewest letters that are asked about. */
    min: number;
    dialog: boolean;
    hotkey: boolean;
    query: string;
    hits: SearchHit[];
    /** Where the answer is: nothing asked, coming, come, or failed. */
    status: 'idle' | 'loading' | 'done' | 'error';
    /** The row in hand (an index into the hits and then the actions), -1 for none. */
    at: number;
    /** The results are shown (inline: the list under the field). */
    open: boolean;
    readonly uid: string;
    private timer;
    private asking;
    /** What had the focus as the dialog opened. */
    private from;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    get input(): HTMLInputElement | null;
    private get pop();
    private get modal();
    /** The hits by kind: the kinds `kinds` names, in its order, then any other in the order they came. */
    groups(): {
        kind: string;
        hits: SearchHit[];
    }[];
    /** The actions offered for the words typed. */
    private actions;
    /** Every row that can be chosen, in the order drawn: the hits, kind by kind, then the actions. */
    private rows;
    /** The search opened: the dialog shown, or the focus put in the field. */
    show(): Promise<void>;
    /** The list closed (the dialog with it); the words kept. */
    close(): void;
    /** The words, the hits and the question on its way, all let go. */
    clear(): void;
    private stop;
    /** The words changed: the question asked a moment after the last key, the one before it let go. */
    private onInput;
    private ask;
    /** A row chosen: told to the page, and a hit with an address opened as a link is, unless the page prevented it. */
    private choose;
    /** The next row that can be chosen from `from`, `by` 1 or -1 round the ends; -1 where none can. */
    private step;
    private onKey;
    /** Mod+K, from anywhere on the page: the search opened. */
    private onPageKey;
    private onFocusOut;
    protected updated(): void;
    private mark;
    private option;
    /** What the list says beside its rows: coming, failed, nothing found, or how many were. */
    private said;
    private list;
    private field;
    render(): TemplateResult<1>;
}
