/**
 * <to-review-panel>: who did what in a document several people write, as a list beside its words (docs/library.md,
 * Tracked changes and comments for a host): every change the tracking found (kit/text/changes.ts `changesOf`), by
 * author, each author in their color with how many of theirs wait for this reader, each change in words ("Put in “45”
 * for “30”.") with where it stands for the reader, and Accept and Reject: one change, or all of one person's at once.
 * The panel draws and asks; the host decides. Accepting and rejecting are the host's (a rejection is an edit of its own:
 * kit/text/reject.ts `rejectOps`), so the panel says what was asked in an event and changes nothing:
 *
 * - "review-accept" and "review-reject", bubbling, `{ ids }` (ReviewAsk): the changes to accept or reject;
 * - "review-show", bubbling, `{ id }`: a change chosen in the list, for the host to bring its words into view.
 *
 * What it is given, in the shapes a host's server gives them (kit/text/review.ts): `changes`, `people` (Person: each
 * one's id as the versions name them, their name, and a color of their own if the host keeps one; otherwise their
 * place among `people`, kit/text/redline.ts colorAt), and where each change stands for `me`: from the host's `reviews`
 * (Review, as its server keeps them), or the host's own `standing`; a change accepted or rejected says by whom where the
 * reviews say ("Accepted by Lee": their `by`, named as `people` name them). `canReview` draws Accept and Reject: Accept on a
 * change of someone else's waiting for this reader, Reject on any change still open. `current` marks the change a
 * lozenge named ("text-ghost": `show(id)` brings it into view and gives it the focus).
 */
import { LitElement, type TemplateResult } from 'lit';
import type { Change } from '../text/changes.ts';
import { type Review, type Standing } from '../text/review.ts';
/** Someone who writes, comments or reviews, as a host names them: their id (Step's `author`, a comment's `by`), name, color. */
export interface Person {
    id: string;
    name: string;
    color?: string;
}
/** What "review-accept" and "review-reject" carry: the changes. */
export interface ReviewAsk {
    ids: string[];
}
/** A change in words, as the panel says it: what it put in, took out or restyled ("Put in “45” for “30”."). */
export declare function changeWords(c: Change): string;
/**
 * Who gave a change the verdict it stands at, by name: the live reviews of it (or of its version whole) that accepted
 * it where it is settled, that rejected it where it is rejected, each reviewer once, named as `people` (or the
 * assistant, `also`) name them; none for a change still open, or where the host gave no reviews.
 */
export declare function reviewersOf(reviews: readonly Review[], id: string, standing: Standing, people: readonly Person[], also?: Person | null): string[];
/** The colors of `people` by id: each one's own, or their place's. */
export declare const colorsOf: (people: readonly Person[]) => (who: string) => string;
/**
 * One change as a list draws it (the panel's, and a reply's changes in the margin, kit/ui/comments.ts): its words,
 * where it stands, and Accept and Reject where the reader may give them, each telling `ask`.
 */
export declare function changeRow(c: Change, standing: Standing, canReview: boolean, ask: (verdict: 'accept' | 'reject', ids: string[]) => void, show?: () => void, current?: boolean, by?: string[]): TemplateResult;
export declare class ToReviewPanel extends LitElement {
    static properties: {
        changes: {
            attribute: boolean;
        };
        people: {
            attribute: boolean;
        };
        reviews: {
            attribute: boolean;
        };
        standing: {
            attribute: boolean;
        };
        me: {};
        canReview: {
            type: BooleanConstructor;
            attribute: string;
        };
        current: {};
    };
    changes: Change[];
    people: Person[];
    /** The host's reviews, as its server keeps them: where each change stands is read from them, unless `standing` is given. */
    reviews: Review[];
    /** Where a change stands for the reader, the host's own answer; null to read it from `reviews`. */
    standing: ((c: Change) => Standing) | null;
    /** Who reads, as the versions name people. */
    me: string;
    canReview: boolean;
    /** The change a lozenge named, marked in the list. */
    current: string;
    constructor();
    createRenderRoot(): this;
    /** The change `id` marked, brought into view and given the focus (a lozenge opened: "text-ghost"). */
    show(id: string): Promise<void>;
    private standingOf;
    private ask;
    private nameOf;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-review-panel': ToReviewPanel;
    }
}
