/**
 * Calendar's document, read and edited (docs/kernel.md §3). A span of time is a list item: when it is, then
 * what, the words rich text:
 *
 *   ---
 *   zone: America/New_York
 *   green: Sam
 *   ---
 *   - 2027-03-01: Launch                                a day: a floating date, the same everywhere
 *   - 2027-03-01 to 2027-03-03: Offsite {color=green}   several days
 *   - 2027-03-10 09:00-10:30: Retro {every=week}        a time, in the head's zone (the reader's without one)
 *   - 2027-03-10 22:00 to 2027-03-11 01:00: Party       a time that runs past midnight
 *
 * A timed span is an instant: written as the clock reads in the document's zone, read back to the same
 * instant, shown in whichever zone the viewer picks. A document that names no zone is read in its reader's: a
 * template's 17:30 is half past five in the evening wherever it is opened. A span may have a colour (`color=green`; the head says
 * what a colour stands for, "green: Sam", "indigo: Paul" for the default) and may repeat: `every=day`,
 * `week`, `month` or `year`, with `times=9` or `until=2027-06-01`, else for ever. A timed repeat keeps its
 * time of day in the document's zone across a clock change.
 *
 * The same items are a schedule (`view: gantt` in the head): an item's depth nests it under the task above,
 * `{done=40%}` says how far along it is and `- [x]` that it is done; a task with parts under it spans them.
 *
 * `readCal` is the view, a pure function of the document; every command gives operations (`Op[]`), so undo
 * sees primitives only. Days are counted from 1970-01-01, as the kernel counts them; a timed span's start is
 * minutes since 1970 UTC. Nothing here touches the DOM.
 */
import { type Block, type Doc, type Op, type Run } from '../../doc/index.ts';
export type Li = Extract<Block, {
    k: 'li';
}>;
export type Every = 'd' | 'w' | 'm' | 'y';
export interface Repeat {
    every: Every;
    /** How many times in all, the first included. */
    count?: number;
    /** The last day a time of it may start on. Neither this nor `count`: for ever. */
    until?: number;
}
export interface Span {
    kind: 'd' | 't';
    /** 'd': a day counted from 1970. 't': minutes since 1970 UTC. */
    start: number;
    /** 'd': whole days, at least 1. 't': minutes, at least 0. */
    dur: number;
    /** A key of CAL_COLORS; '' for the default. */
    color: string;
    repeat?: Repeat;
}
/** A span as the dialog holds it: what an item is made of. */
export interface Draft extends Span {
    label: Run[];
    /** How far along, 0 to 100. */
    done: number;
}
export interface Item extends Draft {
    /** The item's block index in the document. */
    at: number;
    block: Li;
    depth: number;
    /** The label in plain words. */
    words: string;
}
export interface CalView {
    /** The document's zone, '' when it has none. */
    zone: string;
    /** The zone its times are read and written in: the document's own, else its reader's. */
    tz: string;
    /** What each colour stands for, by key. */
    legend: Record<string, string>;
    items: Item[];
    /** Drawn as a schedule: `view: gantt`. */
    gantt: boolean;
}
/** The colours a span may take: the key a span carries in the view, the word the document writes. */
export declare const CAL_COLORS: Record<string, {
    word: string;
    name: () => string;
    hex: string;
}>;
/** Each repeat as the document writes it. */
export declare const EVERY: Record<Every, string>;
export declare const everyText: (e: Every) => string;
/** A repeat in words: "Every week", "Every week, 9 times", "Every week until 2027-06-01". */
export declare function repeatText(r: Repeat): string;
/** The deepest a task nests in a schedule. */
export declare const MAX_DEPTH = 3;
/** "2027-03-01" as a day counted from 1970, or null. */
export declare function dayOf(s: string | undefined): number | null;
/** The minute (since 1970 UTC) a clock in `zone` reads h:min on a day. */
export declare function clockMinutes(day: number, h: number, min: number, zone: string): number;
export declare const spanStartMs: (s: Span) => number;
export declare const spanEndMs: (s: Span) => number;
/** The first and last civil days a span covers; a timed span's are taken in `zone`. */
export declare function spanDays(s: Span, zone: string): [number, number];
/**
 * When a span is, as written at the start of its item, and how many characters that took (the ": " after it
 * included): "2027-03-01", "2027-03-01 to 2027-03-03", "2027-03-10 09:00", "2027-03-10 09:00-10:30",
 * "2027-03-10 22:00 to 2027-03-11 01:00". A time that ends before it starts ends the next day.
 */
export declare function readWhen(text: string, zone: string): {
    kind: 'd' | 't';
    start: number;
    dur: number;
    used: number;
} | null;
/**
 * The spans of a document: its list items that start with a date, in order; every other block is left alone. A
 * document with no zone of its own is read in `reader`'s, this device's unless another is named.
 */
export declare function readCal(doc: Doc, reader?: string): CalView;
/**
 * Every time a span happens between two days (both included): the span itself, or, when it repeats, the
 * copies its rule makes, each starting on its own day. A timed span repeats at the same time of day in `zone`.
 */
export declare function occurrences<S extends Span>(s: S, fromDay: number, toDay: number, zone: string): S[];
/** Today by this device's clock, as a day counted from 1970. */
export declare function today(now?: Date): number;
/** The day whose month a calendar opens on: the next thing still to come (a repeat's next time), else the last, else today. */
export declare function openingDay(v: CalView, zone: string, nowMs?: number): number;
/**
 * The zone an edit writes its times in: the document's; else, when nothing in it is timed yet, the viewer's (and the
 * head says so); else, its times being its reader's, the reader's.
 */
export declare function writeZone(v: CalView, viewer: string, except?: Item): {
    zone: string;
    ops: Op[];
};
/** An item's block from a draft: the "when" first, then the label; the attributes this app does not own kept. */
export declare function itemBlock(d: Draft, zone: string, base?: Li, depth?: number): Li;
/** The draft an item is, for the dialog. */
export declare const draftOf: (i: Item) => Draft;
/** A new span over some days, in a colour. */
export declare const newDraft: (from: number, to?: number, color?: string) => Draft;
/**
 * The draft written into the document: over `item`, or as a new item — after the family of `after` (a
 * schedule's task added under another), else in date order.
 */
export declare function putItem(doc: Doc, v: CalView, item: Item | null, d: Draft, viewer: string, after?: Item): Op[];
/** An item moved by days (dragged on the schedule), or made a number of days long. */
export declare function moveItem(v: CalView, i: Item, days: number): Op[];
export declare function resizeItem(v: CalView, i: Item, days: number): Op[];
/** An item taken out; the parts under it (on a schedule) come out a level. */
export declare const removeSpan: (doc: Doc, i: Item) => Op[];
/** Say what a colour stands for ("Sam"), or nothing. */
export declare const nameColor: (key: string, name: string) => Op[];
/** Drawn as a schedule, or as a calendar. */
export declare const setGantt: (v: CalView, on: boolean) => Op[];
export interface Bar {
    item: Item;
    /** The first day it covers, counted from 1970. */
    start: number;
    days: number;
    done: number;
    /** Has parts under it: spans them, and is as done as they are. */
    parent: boolean;
}
/** Each task's bar as drawn: a task with parts under it covers them all, and counts as done as far as they are. */
export declare function ganttBars(v: CalView): Bar[];
/** The first day and one past the last that the bars cover, or null when there are none. */
export declare function ganttRange(bars: Bar[]): {
    from: number;
    to: number;
} | null;
/** Blocks [from, to): a task with its family, or a run of them. */
export interface BlockSpan {
    from: number;
    to: number;
}
/** Where block i is after these operations, or -1 when they took it away. */
export declare function mapAt(ops: Op[], i: number): number;
/** The span moved past the task (with its family) before it (-1) or after it (1) at its first task's level: one move; null when there is none. */
export declare function moveTasks(doc: Doc, s: BlockSpan, by: 1 | -1): Op[] | null;
/** The span indented under the task before it (1) or brought out a level (-1), at most MAX_DEPTH deep; null when it cannot go. */
export declare function shiftTasks(doc: Doc, s: BlockSpan, by: 1 | -1): Op[] | null;
/** The span's blocks again right after it; the copy starts at `at`. */
export declare const duplicateTasks: (doc: Doc, s: BlockSpan) => {
    ops: Op[];
    at: number;
};
/** The span's blocks as a clipboard holds them: the shallowest task at the margin. */
export declare function copyTasks(doc: Doc, s: BlockSpan): Block[];
/** An item's words replaced (typed in place), its "when" and attributes kept. */
export declare function setLabel(v: CalView, i: Item, label: Run[]): Op[];
/** Ticked when it is not done, else not done at all: Mod+Enter and the tick on the row. */
export declare const toggleDone: (v: CalView, i: Item) => Op[];
/**
 * Enter in a task's words (§3): at the start a new empty task above (the task is pushed down); at the end the next task
 * (the first part of it when it has parts); in the middle the words split. Says where the caret goes.
 */
export declare function enterTask(doc: Doc, v: CalView, i: Item, offset: number): {
    ops: Op[];
    at: number;
    offset: number;
};
/**
 * Backspace at the start of a task's words ('back') or Delete at their end ('forward'): an empty task goes (its parts
 * come out a level); else its words join the task before it, or the next task's words join it (its parts staying where
 * they are). Null at either end.
 */
export declare function joinTask(doc: Doc, v: CalView, i: Item, dir: 'back' | 'forward'): {
    ops: Op[];
    at: number;
    offset: number;
} | null;
/**
 * Pasted blocks as items: a dated item keeps its "when" (moved to start on `day` with the rest of the paste when a day
 * is given), any other words become an item on `day` (else the first pasted date, else `fallback`). On a schedule
 * (`target` given) they go in place of the span at its depth (or `depth`), in their order; on a calendar each goes in date order.
 */
export declare function pasteItems(doc: Doc, v: CalView, blocks: Block[], target: BlockSpan | null, fallback: number, day?: number, depth?: number): {
    ops: Op[];
    from: number;
    to: number;
} | null;
