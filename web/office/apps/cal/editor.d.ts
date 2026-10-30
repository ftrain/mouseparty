/**
 * <to-cal-editor>: the Calendar app. A month of days (or the year at a glance, or the same items as a
 * schedule), every span drawn on the days it covers. A tap on a day, or a drag across several, starts a
 * span; a tap on a span opens it. Either way the span is edited in a native dialog that works on a draft:
 * Done writes it into the document as one operation, Escape throws it away. On the schedule a bar is dragged
 * to move it and by its end to make it longer; Tab nests a task under the one above, Alt+arrows move it.
 *
 * All-day spans are floating dates, the same in every country. A timed span is an instant, written in the
 * document's zone and shown in whichever zone the viewer picks (the globe in the bar). Every change is
 * operations on the document's list items (model.ts); the one bar holds where you are, the view, Insert ▾,
 * the colour new spans take, the zone, undo and redo.
 *
 * The month is a grid of days (docs/editing.md §8: a tap on an entry opens its dialog): the arrows walk the days,
 * PageUp/PageDown the months, Shift+arrows sweep a run of days that Enter makes a span over. A focused entry is the
 * thing in hand: Delete takes it out, Mod+D makes another, Mod+C/X/V copy, cut and paste it as TLO and our HTML.
 * The schedule's tasks are rows (§6, the kit's rows.ts): their words are typed in place and behave as an outline's
 * (Enter makes the next task, Backspace at the start joins), a tap on the grip chooses a task, and chosen tasks have
 * the contextual bar; Mod+Alt+Left/Right move a task a day, Alt+Enter opens its dates. An undo puts back the
 * caret, the chosen tasks or the month of what changed.
 */
import { type PropertyDeclarations } from 'lit';
import { type Block, type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry, type Picked } from '../../kit/core/element.ts';
import { Rows } from '../../kit/text/rows.ts';
import { type CalView, type Draft, type Item } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/dialog.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/text/text.ts';
import '../../kit/ui/context.ts';
import './style.css';
export declare const tag = "to-cal-editor";
type Mode = 'month' | 'year';
/** The span in the dialog: what it was (null for a new one), the draft, where a new task goes, the colour's name as typed. */
interface Editing {
    item: Item | null;
    d: Draft;
    block: Block;
    after?: Item;
    legend: string;
}
export declare class ToCalEditor extends DocElement<CalView> {
    static properties: PropertyDeclarations;
    mode: Mode;
    /** The month on view (or the year, which is its year). */
    shown: {
        y: number;
        m: number;
    };
    /** A day tapped on the year, marked in its month. */
    picked: number;
    /** The zone times are shown in: the viewer's own until they pick another. */
    zone: string;
    /** The colour new spans take: whoever is adding dates picks theirs. */
    ink: string;
    editing: Editing | null;
    /** Days being dragged across on the month. */
    drag: {
        from: number;
        to: number;
        moved: boolean;
    } | null;
    /** A bar being dragged on the schedule: by how many days so far. */
    bar: {
        at: number;
        how: 'move' | 'size';
        x0: number;
        days: number;
        id: number;
    } | null;
    /** The schedule's scroll, in days from its first. */
    scrolled: number;
    /** The task the schedule's keys act on: its block. */
    cur: number;
    /** The day the month's arrows are on (the one day button in the tab order); -1 for today or the month's first. */
    focusDay: number;
    /** Days swept by Shift+arrows on the month, for Enter to make a span over. */
    sweep: {
        from: number;
        to: number;
    } | null;
    /** Where the focus goes back to when the dialog closes. */
    private opener;
    /** One array per task block, so a row's words see the same `blocks` until the task changes. */
    private wordBlocks;
    /** The schedule's tasks as rows chosen whole: the kit's one implementation (keys, grip, drag, clipboard, the bar). */
    readonly rows: Rows<number>;
    private week0;
    private zones;
    /** A drag just ended: the click that follows it is not a tap. */
    private dragged;
    constructor();
    protected read(doc: Doc): CalView;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** While the dialog is open its draft is the thing being edited: the document's history waits (a field keeps its own undo). */
    private onHistory;
    /** Every edit carries where the selection was: the chosen tasks, or the caret in a task's words. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    private markNow;
    /** After an undo: the chosen tasks or the caret back as they were; else the task, or the month, of what changed. */
    protected undone(entry: Entry, redo: boolean): void;
    protected willUpdate(changed: Map<PropertyKey, unknown>): void;
    private todayDay;
    private showDay;
    private shiftMonth;
    setMode(mode: Mode | 'gantt'): void;
    /** The zone repeats keep their time of day in: the document's, or, with none named, this reader's own. */
    private get repeatZone();
    /**
     * The dialog over a draft. The focus comes back on close to what had it (a day, an entry, a task), or, when a tap
     * on something that takes no focus opened it, to `back`: the day's button, the entry, the task's grip.
     */
    private openDraft;
    private open;
    /** A new span over these days (in the colour new spans take), or a new task after the current one. */
    create(from: number, to?: number): void;
    createTask(): void;
    /** The dialog closed (Done, Delete, Escape, the backdrop): the draft goes and the focus goes back where it came from. */
    private onDialogClose;
    private patch;
    private close;
    private done;
    private removeDraft;
    /** The draft as another span or task beside it (the one it came from as it was): the dialog's Duplicate, for a finger as for keys. */
    private duplicateDraft;
    private showMonthOf;
    private onLabelOps;
    private fields;
    /** A date field and a time field as the draft counts them: a day, or for a timed span a minute in the viewer's zone. */
    private at;
    private setStart;
    private setEnd;
    private setAllDay;
    /** How the draft repeats: every so often, for ever, so many times, or until a day (never before its first). */
    private setRepeat;
    private dayAt;
    private onCellDown;
    private onGridMove;
    private onGridUp;
    private onCellClick;
    /**
     * Read-only, an entry activated is picked (kit/core/element.ts): its item's block and when it starts, in the viewer's
     * zone (the day, and the time of a timed one: a repeat's own time, the one tapped); a task on the schedule says its row.
     */
    protected pickOf(el: Element): Picked | null;
    /** A task's row on the schedule, from the first; nothing on the month. */
    private rowOf;
    private zoom;
    private onBarDown;
    private onBarMove;
    private onBarUp;
    /** The tasks on screen as the rows controller takes them: each with its row and its family's blocks. */
    private taskRows;
    private item;
    /** Where a person starts: today's day in the month (else the month's first), the first task's words in a Gantt chart, today in the year. */
    focusFirst(): Promise<void>;
    /** The caret into a task's words (at the end, or at `offset`). */
    private focusWords;
    private caretIn;
    private blocksFor;
    /** Chosen tasks taken away, families and all; the caret to the task before (or after). */
    private removeTasks;
    /** An edit of the chosen tasks that keeps them chosen, where it put them. */
    private rangeEdit;
    private duplicateRange;
    /** A task carried by its grip onto another: under it (the right half of the row) or after its family. */
    private dropTask;
    /** Chosen tasks a day earlier or later (the schedule's columns are days: Mod+Alt+Left/Right), or their dates (commands.ts). */
    private dayItems;
    nudgeChosen(by: 1 | -1): void;
    datesChosen(): void;
    private nudge;
    private openTask;
    private onWordsOps;
    private onWordsEnter;
    private onWordsExit;
    /** Keys in a task's words (commands.ts; the rows controller has had Shift+arrows, Escape and the range's keys): what the task's block `here` gets. */
    taskKey(what: 'nest' | 'move' | 'step' | 'duplicate' | 'tick' | 'earlier' | 'later' | 'dates', e?: Event): boolean;
    /** What a key is on, while the commands answer it (commands.ts): a task's block, a day, an entry. */
    here: {
        at?: number;
        day?: number;
        el?: HTMLElement;
    } | null;
    private onKey;
    /** Enter over a sweep of days: an event over them. */
    makeSweep(): void;
    /** The month's days: arrows by a day and a week, PageUp/PageDown by a month, Home/End the week's ends; with Shift a sweep, which Enter makes a span over. */
    walkDay(e: KeyboardEvent): boolean;
    private goToDay;
    /** The day the month's arrows start from: the one last walked to, else today, else the month's first. */
    private rovingDay;
    /** A focused entry (on a day or in the month's list): Delete takes it out, Mod+D makes another; the focus stays near. */
    entryKey(what: 'delete' | 'duplicate'): boolean;
    /** Blocks as the clipboard holds them: TLO text, and our HTML with the generator's mark. */
    private clip;
    /** What was pasted, as blocks: our HTML or plain text read as TLO, HTML from elsewhere as blocks. */
    private blocksOf;
    /** Pasted onto chosen tasks (in their place), after a task (`at`), or onto the month (on `day`, or on their own dates). */
    private pasteData;
    /** Lines or list items pasted into a task's words are tasks after it, on its first day unless they say their own. */
    private onWordsPaste;
    /**
     * Copy, cut and paste of the thing in hand that the rows controller (chosen tasks) and the words do not take: a focused
     * entry on the month is copied as its item; a paste onto a focused day lands there, onto an entry or the page keeps
     * its dates; lines or list items pasted into a task's words are tasks after it.
     */
    private onClipboard;
    /** The schedule's first day: two before the earliest task. */
    private ganttFrom;
    private scrollDays;
    /** Insert ▾ Event: on the day picked, else today where it is shown, else the month's first. */
    createEvent(): void;
    /** Back (-1) or on (1): a week of the schedule, a year, a month. */
    page(by: -1 | 1): void;
    /** Today on view (and, in a month, no day picked). */
    toToday(): void;
    private nav;
    private monthName;
    openZones: () => Promise<void>;
    render(): import("lit-html").TemplateResult<1>;
    private chipTime;
    private renderMonth;
    /** What the colours in use stand for. */
    private renderLegend;
    /** When a span is, in words, in the viewer's zone. */
    private whenWords;
    /** The month as a list: each time of each span in it, in order; a tap opens it. */
    private renderAgenda;
    /** Twelve small months, a day tinted with the colour of what it holds; a month's name opens it, a day too. */
    private renderYear;
    /** The same items as a schedule: the tasks down the side, their bars on days that scroll sideways. */
    private renderGantt;
    /** A task as a row: its grip (a tap chooses it, a drag moves it), its words typed in place, its tick. */
    private renderTask;
    /** The dialog over the calendar; its body is drawn while it is open. */
    private renderDialog;
    private renderFields;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-cal-editor': ToCalEditor;
    }
}
export {};
