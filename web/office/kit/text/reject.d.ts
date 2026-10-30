/**
 * The edit that rejects a change, for a host whose documents several people write (docs/library.md, Tracked changes
 * and comments for a host): given what kit/text/changes.ts tracked (`track`, `trackOn`), the editor's blocks as they
 * are now and the changes to reject (a lozenge's `edit:` ids, or a Change's `id`), the kernel's operations that take
 * back exactly those: the words they put in taken out, the words they took out put back where they were with their
 * marks, and a word's marks, a block's kind or look, or a field of the head as they were. The host applies them as an
 * edit of its own, like any other, and the tracking sees a rejection. The Contract Editor made it (its review.ts); a
 * host had made its own meanwhile, with a longest common subsequence of its own to pair the blocks, which is the
 * kit's `diffLines` (kit/text/diff.ts, served beside this).
 *
 * - The tracked blocks still standing are paired with the editor's where their words read the same, as the ghosts
 *   pair them (kit/text/redline.ts).
 * - A block taken out is put back before the next block standing; one put in is taken out; a card (a table, a rule,
 *   another document) changed is put back whole as it was before the changes open on it, all of them; a block
 *   restyled is given its kind and look back, its words as they are.
 * - In a block of words: words put in are taken out, unless a restoring put them back and the taking out it undid is
 *   rejected too; words taken out go back together where they were taken from, with their marks as they were; words
 *   restyled get their marks back, where every restyling above the one rejected is rejected too.
 * - The edits are made from the end backwards, so each one's place is as it was found.
 *
 * Null when the change cannot be put back from what is tracked (its words have moved, or a restyling over it
 * stands), or when it is a change no part of the tracking could place (OTHER), which only an edit by hand undoes.
 * Pure: no DOM, nothing kept between calls.
 */
import type { Block, Op } from '../../doc/index.ts';
import { type Tracked } from './changes.ts';
/**
 * The operations that reject the changes `ids` of `tracked` (track's blocks), made against `blocks`, the editor's
 * blocks as they are now (the document the host's versions end in, or the words being typed): null where they cannot
 * be made (the header). Rejecting every change of a version gives back the version before it; rejecting some leaves
 * the others' words as they are, but on a card, which is put back whole.
 */
export declare function rejectOps(tracked: readonly Tracked[], blocks: readonly Block[], ids: readonly string[]): Op[] | null;
