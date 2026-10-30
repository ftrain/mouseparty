/**
 * <to-field>: one fact of a host's record changed where it is shown (docs/library.md, The kit's small pieces): a
 * person's title, a company's size, a lead's close date. It reads as words (a link where it has `href`), and a click on
 * its words (not on a link), or on its pencil, makes it a field of its type: words, a number or an amount, a date or a
 * moment, one of its `options`, an email, an address, a phone number, lines of words (`multiline`), or another of the
 * host's records (`record`: a person's company, a task's assignee). Enter keeps it (Shift+Enter is a new line in
 * lines), the focus leaving keeps it, Escape lets it go; words where a number belongs are not kept, and the field says
 * so. A record is picked, not typed: the field searches the host's records as a typed table's record cell does
 * (kit/ui/record-pick.ts), `search(q, signal)` the host's own answer, Down and Up through those found, Enter chooses
 * (the field emptied, none), Escape or leaving lets it go.
 *
 * An edit is shown at once and told in `fieldchange`, cancelable, `{ value, before, wait }` (FieldChange), as a typed
 * table's "rowchange" is (kit/ui/table.ts): a page that refuses it calls `preventDefault()`, or hands `wait` a promise
 * that rejects or comes back false (a server's answer), and the words go back. A kept edit is shown until the page gives
 * `value` again, which is then the truth. Its words are a table cell's (kit/ui/table-model.ts `cellWords`): money in its
 * `currency` with its `decimals`, a date in the page's language, an option's label.
 *
 * - `value`, `type` (FieldType), `label` (its name: the pencil's "Edit Title", the field's name), `placeholder` (what it
 *   says when empty), `href` (where its words open), `options` (an enum's), `currency` and `decimals` (money's),
 *   `multiline`, `search` (a record's: RecordSearch), and `readonly` (words alone, no pencil). A record's `value` is
 *   `{ id, label, href? }` (RecordValue) or an id alone; its change is told with the id as `value` and the record
 *   chosen as `record`.
 */
import { LitElement, type PropertyValues, type TemplateResult } from 'lit';
import './menu.ts';
import { type EnumOption, type RecordSearch, type RecordValue } from './table-model.ts';
/** What a field holds, and so how it is shown and edited. */
export type FieldType = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'enum' | 'email' | 'url' | 'tel' | 'record';
/** A change made in a field, told to the page to keep or refuse ("fieldchange", cancelable). */
export interface FieldChange {
    /** What it holds now: words, a number, a day ("2027-03-01"), a moment, an option's value, a record's id; null for empty. */
    value: unknown;
    before: unknown;
    /** A record's: the record chosen, as the search offered it, or null where the field was emptied. */
    record?: RecordValue | null;
    /** The page's answer, when it comes later: a promise that rejects, or comes back false, puts the words back. */
    wait(answer: Promise<unknown>): void;
}
export declare class ToField extends LitElement {
    static properties: {
        value: {
            attribute: boolean;
        };
        type: {};
        label: {};
        placeholder: {};
        href: {};
        options: {
            attribute: boolean;
        };
        currency: {};
        decimals: {
            type: NumberConstructor;
        };
        multiline: {
            type: BooleanConstructor;
        };
        search: {
            attribute: boolean;
        };
        readonly: {
            type: BooleanConstructor;
            reflect: boolean;
        };
        editing: {
            state: boolean;
        };
        choosing: {
            state: boolean;
        };
    };
    value: unknown;
    type: FieldType;
    label: string;
    placeholder: string;
    href: string;
    options: EnumOption[];
    currency: string;
    decimals: number | undefined;
    multiline: boolean;
    /** A record's search: the host's records for the words typed. */
    search: RecordSearch | undefined;
    readonly: boolean;
    /** The field is open. */
    editing: boolean;
    /** A choice's menu open: drawn only while it is, so the field's words are its words alone. */
    choosing: boolean;
    readonly uid: string;
    /** An edit shown while the page has not given its value again. */
    private kept;
    /** A record's picker (kit/ui/record-pick.ts), open while a record field is edited. */
    private picker;
    constructor();
    createRenderRoot(): this;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    /** What is shown: the edit kept, else the page's value. */
    get shown(): unknown;
    /** The field, while it is open. */
    get field(): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    /** The field as a typed table's column, whose words and parsing it shares. */
    private column;
    private row;
    /** The field opened, its words chosen to type over; a choice's options as the kit's menu beside the words. */
    edit(): Promise<undefined>;
    /**
     * A choice's options as the kit's menu beside the words (header), the one held checked, a swatch where an option has
     * a colour; one picked is kept at once, and Escape gives the words back. Never the browser's dropdown, which drops
     * only where a script may open it (Paul, 2026-10-24, of a status: "a select box should pop up. I have to click
     * twice now"; "Let's be consistent").
     */
    private choose;
    private choiceItems;
    /** Where the focus goes once the field closes: the words, which are the control; the pencil, where the words are a link. */
    private refocus;
    /** Kept (`keep`) or let go, and the focus back on the pencil. */
    private end;
    /** The edit kept: a value, or for a record its id with the record chosen (the words shown; null, emptied). */
    private commit;
    private onKey;
    /** Leaving keeps the words; a record, kept only by being chosen, is let go. */
    private onBlur;
    private onWordsClick;
    private input;
    /** A record clicked in the picker: kept and the field closed, the focus back on the words (or the pencil of a link). */
    private commitPicked;
    /** Enter or Space on the words opens the field, as a click does. */
    private onWordsKey;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-field': ToField;
    }
}
