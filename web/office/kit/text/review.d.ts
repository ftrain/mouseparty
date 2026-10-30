/**
 * Who reviewed what, and who said what about it, as a host keeps them (docs/library.md, Tracked changes and comments
 * for a host): the verdicts on changes (Review) and the comments in threads (Comment), in the shapes and the names a
 * host's server gives them (its `reviews` and `comments` rows), so its rows are
 * handed in as they come, and what the tracking and the drawing ask of them read back: whether a change had been
 * rejected or reviewed by a version (`track`'s `rejectedBy` and `reviewedBy`), whether it is settled (drawn plain), and
 * where it stands for a reader (Standing), for the review panel (kit/ui/review-panel.ts); and the comments as threads,
 * for the margin (kit/ui/comments.ts). Pure: no DOM, nothing kept between calls.
 *
 * A change is named as the tracking names it, `<hash>:<n>`; a review may name a version's changes whole, `<hash>:*`
 * (`covers`). A review taken back (`undone_at`) still closed what it reviewed, as the server's runs are closed by it,
 * and no longer settles or rejects anything. Settled is accepted by anyone: whoever may review a document reviews it for
 * everyone, so everyone sees one redline (the kit's choice; a host that wants another gives its own `settled`).
 */
/** A verdict on a change, as a host keeps it. Times as the host gives them (an ISO string, or a Date). */
export interface Review {
    id?: string;
    /** The change it is on (`<hash>:<n>`, a Change's id), or a version's changes whole (`<hash>:*`). */
    change_id: string;
    /** Who gave it, as the versions name people (Step's `author`). */
    by: string;
    verdict: 'accepted' | 'rejected';
    /** The host's version when it was given (Step's `seq`): it closes the changes it names from the next one on. */
    at_seq: number;
    why?: string | null;
    /** Taken back, and when. */
    undone_at?: string | Date | null;
}
/** Where a change stands for a reader: accepted (drawn plain), rejected, theirs, reviewed by them, or waiting for them. */
export type Standing = 'settled' | 'rejected' | 'yours' | 'reviewed' | 'waiting';
/** Whether a review naming `reviewed` is of the change `id`: the same change, or its version's changes whole. */
export declare const covers: (reviewed: string, id: string) => boolean;
/** What the tracking, the drawing and the panel ask of a host's reviews, answered from them. */
export interface Reviewed {
    /** For `track`: whether a live rejection of the change was given before version `seq`. */
    rejectedBy(id: string, seq: number): boolean;
    /** For `track`: whether any review of it was given before version `seq` (one taken back too: it still closed it). */
    reviewedBy(id: string, seq: number): boolean;
    /** For the drawing: whether it is accepted, by anyone, and so drawn as plain words. */
    settled(id: string): boolean;
    /** Where the change stands for `me`, whose it is being `author`. */
    standing(id: string, author: string, me: string): Standing;
    /** The live reviews of the change (or of its version's changes whole), in the order given. */
    of(id: string): Review[];
}
/** A host's reviews read for the tracking, the drawing and the panel (Reviewed). */
export declare function reviewsOf(reviews: readonly Review[]): Reviewed;
/**
 * A comment, as a host keeps it: on the words it quotes as they read when it was made (none: on the whole document),
 * in a thread (the first comment's id; a reply's `parent_id` the comment it answers), by someone, saying something.
 * Times as the host gives them. `to_assistant` is a comment that asks the host's assistant (the margin's Ask), whose reply
 * may carry the changes it made in answer (`change_ids`, which the margin offers to accept or reject). `block` and
 * `offset` say where the quote was taken from (quoteAt), so pinComments finds that one where the words read twice.
 */
export interface Comment {
    id: string;
    thread_id?: string;
    parent_id?: string | null;
    quote?: string;
    block?: number;
    offset?: number;
    by: string;
    text: string;
    to_assistant?: boolean;
    change_ids?: string[];
    resolved_at?: string | Date | null;
    created_at?: string | Date;
    deleted_at?: string | Date | null;
}
/** A thread: its first comment (gone when it was deleted), every comment in it in the order written, its quote, whether resolved. */
export interface Thread {
    id: string;
    first: Comment | undefined;
    comments: Comment[];
    quote: string;
    resolved: boolean;
}
/**
 * The comments as threads, in the order they began, each thread's in the order written; a deleted comment left out,
 * its replies kept in its thread. A comment's thread is its `thread_id`, or the first comment up its `parent_id`s.
 */
export declare function threadsOf(comments: Iterable<Comment>): Thread[];
