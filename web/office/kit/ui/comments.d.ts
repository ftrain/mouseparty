/**
 * <to-comments>: the margin, the comments of a document several people write beside its words (docs/library.md,
 * Tracked changes and comments for a host). Each open thread whose words are found is a note beside them, at their
 * height (kit/text/redline.ts `pinComments`), a note that would meet the one above it moved down under it, placed again
 * whenever the words move: an edit here or another's ("docchange", "docremote"), who did what drawn again
 * ("text-redline", kit/text/redline.ts `drawChanges`), a scroll, a width. Where there is no room beside the words (the
 * frame the margin and the words share under 760px wide, or a page's `--to-comments-beside: 0`), the margin is a sheet
 * over the page's foot (`data-sheet`), opened by a button that says how many threads are open, the notes in the order
 * their words read; the button sits at the foot's end, or its start (`anchor`), or where `--to-comments-toggle-x` and
 * `--to-comments-toggle-y` put it.
 *
 * - A note opens its thread: the words it is about, every comment (by whom, in their color, and when), the box to
 *   reply (kit/ui/comment-box.ts, with "@" for the host's people), Resolve, and Close (or Escape). A reply of the
 *   host's assistant that made changes in answer (a Comment's `change_ids`) lists them, each in words, where it stands,
 *   and Accept and Reject for whoever reviews (kit/ui/review-panel.ts `changeRow`).
 * - The words' bubble has Comment while the margin is given the editor's words (`words`) and the reader may comment
 *   (`canComment`: the margin marks the editor `data-comments`), and a box opens beside the words selected for a new
 *   thread on them (kit/text/quote.ts Quote); New comment, at the top, one on the whole document.
 * - Threads whose words are no longer there are listed under "On words since changed", threads on the whole document
 *   under their own heading, resolved threads folded under Resolved.
 * - `ask`, the host's assistant, is offered first by "@", and each box has Ask beside Comment: a comment that
 *   asks says so (`to_assistant`), and until a comment of the assistant's answers it the thread says it is answering.
 * - `plain`: a thread on what has no words to pin to (a record's: a lead's, a row's of a model), in a box of the same
 *   kind. No words and no quotes, never a sheet: the threads in a column, each a note that opens, and the box to
 *   write a new one at the foot where the reader may comment, with no New comment button and no heading for the
 *   whole document.
 *
 * Storage is the host's: the margin is given the comments as its server keeps them (kit/text/review.ts Comment, made
 * into threads by `threadsOf`), its people (Person), who reads (`me`), and for a reply's changes the tracked changes and
 * the reviews; and it tells what is asked, bubbling, changing nothing itself:
 *
 * - "comment-send" (CommentSend): words for a new thread on `quote` (null: on the whole document) or a reply to
 *   `parent_id`, whether they ask the assistant, whom they name, and `done(ok)`, which the host calls once it has kept
 *   them (the box is emptied) or refused them (the words stay);
 * - "comment-resolve" `{ thread_id, resolved }`, "comment-delete" `{ id }` (a reader's own comment, or any the page's
 *   `canDelete(comment)` allows);
 * - "review-accept" and "review-reject" `{ ids }`, as the review panel tells them, for a reply's changes.
 */
import { LitElement, type PropertyValues } from 'lit';
import type { Change } from '../text/changes.ts';
import { type Pinned } from '../text/redline.ts';
import type { Quote } from '../text/quote.ts';
import { type Comment, type Review, type Standing, type Thread } from '../text/review.ts';
import type { ToText } from '../text/text.ts';
import './comment-box.ts';
import { type Person } from './review-panel.ts';
/** What "comment-send" carries (the header). */
export interface CommentSend {
    text: string;
    ask: boolean;
    mentions: string[];
    parent_id: string | null;
    quote: Quote | null;
    done(ok?: boolean): void;
}
/** A new thread being written: on the words of `quote`, or, null, on the whole document. */
type Draft = {
    quote: Quote | null;
};
export declare class ToComments extends LitElement {
    static properties: {
        comments: {
            attribute: boolean;
        };
        people: {
            attribute: boolean;
        };
        ask: {
            attribute: boolean;
        };
        words: {
            attribute: boolean;
        };
        changes: {
            attribute: boolean;
        };
        reviews: {
            attribute: boolean;
        };
        standing: {
            attribute: boolean;
        };
        me: {};
        canComment: {
            type: BooleanConstructor;
            attribute: string;
        };
        canReview: {
            type: BooleanConstructor;
            attribute: string;
        };
        canDelete: {
            attribute: boolean;
        };
        plain: {
            type: BooleanConstructor;
            reflect: boolean;
        };
        anchor: {
            reflect: boolean;
        };
        prefix: {};
        open: {
            state: boolean;
        };
        draft: {
            state: boolean;
        };
        pins: {
            state: boolean;
        };
        sheet: {
            state: boolean;
        };
    };
    comments: Comment[];
    people: Person[];
    /** The host's assistant, whom a comment may ask; null for none. */
    ask: Person | null;
    /** The editor's words the notes are placed by (a mounted Word Processor's: `wordsOf`); null with none. */
    words: ToText | null;
    /** The tracked changes and the host's reviews (or its own `standing`), for the changes a reply made in answer. */
    changes: Change[];
    reviews: Review[];
    standing: ((c: Change) => Standing) | null;
    me: string;
    canComment: boolean;
    canReview: boolean;
    /** Whether the reader may delete a comment (Delete drawn on it); null: their own alone. An asker may delete the assistant's reply to them, say. */
    canDelete: ((comment: Comment) => boolean) | null;
    /** A record's thread: no words, no quotes, never a sheet, the box at the foot. */
    plain: boolean;
    /** Where the phone's sheet button sits along the page's foot: at its `end` (the default) or its `start`, clear of a host's own button. */
    anchor: 'start' | 'end';
    /** The highlights' prefix for the comments' words (redline.ts PREFIX unless a page holding two documents names one apart). */
    prefix: string;
    /** The thread open, or ''. */
    open: string;
    draft: Draft | null;
    pins: Pinned[];
    /** On a phone: the sheet is open. */
    sheet: boolean;
    private frame;
    private watched;
    private resizing;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** The threads, as the host's comments make them. */
    get threads(): Thread[];
    /** Thread `id` opened, as a click on its note does: the focus in its box to reply, or on Close where there is none. */
    show(id: string): Promise<void>;
    /** A new thread begun on `quote` (null: on the whole document), its box open beside the words. */
    write(quote: Quote | null): Promise<void>;
    /**
     * Whether there is room for the notes beside the words: where the page says (`--to-comments-beside`, 1 or 0, on the
     * margin or round it), that; else whether the frame the margin and the words share (their nearest common ancestor;
     * the margin's parent, with no words) is at least 760px wide. The margin's own container decides, not the viewport.
     */
    get beside(): boolean;
    /** The element the margin and the words are laid out in: their nearest common ancestor, or the margin's parent. */
    private frameOf;
    private unwatch;
    private watch;
    /** Placed again a frame from now, once however often it is asked meanwhile: the words drawn first. */
    private schedule;
    /** Each open thread's words found again, and the draft's, and where each note goes from the top of the notes. */
    private repin;
    protected updated(changed: PropertyValues<this>): void;
    /** The notes at their pins, each below the one above it, beside the words; in their order where there is no room. */
    private layout;
    private send;
    private tell;
    private onKey;
    private nameOf;
    private when;
    render(): import("lit-html").TemplateResult<1>;
    private box;
    /** A thread: a note to open, or, open, everything in it; at `top` when pinned. */
    private thread;
    private comment;
    /** The changes a reply made in answer, each with where it stands and its Accept and Reject. */
    private made;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-comments': ToComments;
    }
}
export {};
