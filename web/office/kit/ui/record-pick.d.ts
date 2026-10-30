/**
 * A record picked from the host's own search, for a typed table's record cell (kit/ui/table.ts) and a record field
 * (kit/ui/field.ts) alike: a field (`role=combobox`) whose records are the column's or the field's `search(q, signal)`
 * (table-model.ts RecordSearch), asked for '' as the picker opens and then a moment after the last key, the question
 * before let go (its `signal` aborted); the records found in a popover under the field (menu.ts `place`), Down and Up
 * through them; and it says Searching…, that the search failed, or that nothing was found, as the search box does.
 * The host keeps the keys that mean something of its own (Enter, Tab, Escape, leaving) and what a choice does.
 *
 *   private pick = new RecordPicking(this);
 *   this.pick.begin(col.search);                   // opened: asked for ''
 *   this.pick.type(field.value);                   // typed: asked a moment after the last key
 *   this.pick.move(1);                             // Down (and -1, Up)
 *   const chosen = this.pick.held;                 // Enter: the record in hand, once the search has answered
 *   this.pick.end();                               // let go
 *   render: html`<input role="combobox" aria-activedescendant=${this.pick.active(uid)} …/>${this.pick.list(uid, label, choose)}`
 *   updated(): this.pick.place(field);             // the popover under the field, inside the screen
 */
import { nothing, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit';
import type { RecordOption, RecordSearch } from './table-model.ts';
/** A picker while it is open: the words typed, what the search answered, and the record in hand (-1, none). */
export interface Picking {
    q: string;
    options: RecordOption[];
    status: 'loading' | 'done' | 'error';
    at: number;
}
export declare class RecordPicking implements ReactiveController {
    private host;
    /** The picker's state while it is open; null, closed. */
    state: Picking | null;
    private search;
    private asking;
    private timer;
    constructor(host: ReactiveControllerHost & HTMLElement);
    hostDisconnected(): void;
    /** The record in hand: the option Down and Up reached, once the search has answered; null for none. */
    get held(): RecordOption | null;
    /** The option's id for the field's `aria-activedescendant`, or nothing. */
    active(uid: string): string | typeof nothing;
    /** Opened for a search (or none: nothing to offer), and asked for '' at once. */
    begin(search: RecordSearch | undefined): void;
    /** The words typed: asked a moment after the last key, the question before let go. */
    type(q: string): void;
    /** The record in hand moved `by` (1 down, -1 up), round the ends; from none, Down takes the first and Up the last. */
    move(by: number): void;
    /** Closed: nothing more asked, the popover gone. */
    end(): void;
    /** The popover shown under `anchor` (the field), as wide as it at least, inside the screen: from the host's `updated()`. */
    place(anchor: HTMLElement | null): void;
    private get pop();
    private set;
    private ask;
    private stop;
    /** The popover: the records found as options (`${uid}-o${i}`, the list `${uid}-pick`), and what the search says; `choose` is told the one clicked. */
    list(uid: string, label: string, choose: (option: RecordOption) => void): TemplateResult;
}
