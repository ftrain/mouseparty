/**
 * Shared editing: several people, and programs, edit one document at once (docs/kernel.md §12). One server puts their
 * operations in one order. A client sends an operation with the version of the document it was made against; the
 * server transforms it over every operation appended since, appends it, and tells every client; a client transforms
 * its own operations the server has not yet told back over each one it is told of (rebase). Every replica applies the
 * server's order, so all end with one document; the transformation is what keeps an op meaning what its author meant
 * once others land before it. A single order asks one property of it, which test/doc/sync.test.ts holds for every pair
 * of ops: for a and b made against one document, a then transform(b, a, 'right') is b then transform(a, b, 'left').
 *
 * transform(a, b, side) is a as it applies once b has. `side` is a's place in the order: the server transforms an op it
 * receives as 'right' over each it appended after the op's version; a client transforms the server's op as 'left' over
 * its own. Where the two set one thing, the right one (the later) wins; where both put something in at one place, the
 * left one's comes first. Null means b took away what a acts on (its block, its rows, columns or cells, a move's
 * blocks, the blocks a splice replaces), and a is dropped. Blocks have no ids, so everything is by index: blocks,
 * characters (an icon or a footnote counts one), rows and columns.
 *
 *   head × head        another key: independent. The same key: the right's value stands, and the left becomes a write
 *                      of that value, which leaves the key as the right set it.
 *   an op on a block   (text, cells, rows, cols, col) × splice: after the splice's span it moves by the blocks put in
 *                      less those taken out; inside the span it is null (the block was taken out, or replaced).
 *                      × move: it follows its block. Ops on different blocks are independent.
 *   text × text        on one block. Each is a range [from, to) of characters replaced by its runs. The right op's ends
 *                      are carried over the left's: an end before the left's range stays, one after it shifts, one
 *                      strictly inside it goes to the left's new words (a start to their end, an end to their start),
 *                      one at an edge of it stays outside it, and a start where the left only inserted goes after what
 *                      it inserted. So the right op replaces the left's words when its range held the left's whole
 *                      range, and otherwise puts its words beside them with its range clipped to the characters still
 *                      there. The left op is what brings the other order to the same words: nothing (an empty op)
 *                      when the right's range held its own; else the characters of its range outside the right's,
 *                      with its words where the right op put them (before the right's, or after); and where those
 *                      characters lie on both sides of the right's words (the right's range strictly inside its own),
 *                      its range takes the right's words in and its runs put them back after its own. Two insertions
 *                      at one offset: the left's first. Disjoint ranges only shift.
 *   splice × splice    the same, over blocks: a splice is a range of blocks replaced by its blocks, and the left one
 *                      whose span the right's held is null.
 *   splice × move      a splice that only puts blocks in sits at a place between blocks: one inside the moved span goes
 *                      with it, one elsewhere (its edges too) stays among the rest, and where the span lands, side
 *                      decides. A splice that takes blocks out follows them: inside the moved span, with it; holding
 *                      the span where it lands among the splice's own blocks, as it was (and the move is null: its
 *                      blocks are gone); apart from it, as they close up and open again.
 *   move × splice      the moved span takes in what a splice put inside it and loses what one took out of it (null
 *                      when nothing is left); its target moves with the rest, and a splice putting blocks in where
 *                      the span lands: side decides.
 *   move × move        the same span: the right's target (the left does nothing). One span inside the other: the inner
 *                      goes with the outer, and the outer moves what is left of itself, or the whole when the inner
 *                      lands inside it. Apart: each follows the other's blocks; a span that lands inside the other's
 *                      goes along with it. A move that moves nothing moves nothing after anything.
 *   cells × cells      on one table, different cells: independent. The same cell: a forced write beats one that is not
 *                      (an undo is forced: invert in ops.ts), else the right wins; the loser drops the cell where it
 *                      ends a row of its rectangle and writes the winner's value where it does not.
 *   cells × rows/cols  the rectangle follows: rows or columns put in before it move it, put in inside it open a gap
 *                      (a row of nothing; a column of '', which a new column holds already); rows or columns taken out
 *                      drop their cells (null when none is left). Its formulas move as the table's do (remapRefs).
 *   rows × rows        as a splice of rows, except that rows put in strictly inside rows taken out are null (one op
 *   cols × cols        cannot take out rows on both sides of others), and the taking out grows over them. Two puts at
 *                      one place: the left's first. Rows put in carry their formulas as the table's move.
 *   rows × cols        rows put in follow the columns: a cell put in where a column is, taken out where one goes.
 *   col × cols         its column follows; null when it is taken out. col × col on one column: the right wins.
 *   force              on cells, kept.
 *
 * Two orders of one pair still differ in two places, which no transformation of the ops can reach: the head's keys,
 * written in the order they were put in (two keys put in at once, or one taken out while another sets it), and a range
 * in a formula or a table's lock that ends in rows (columns) one op takes out, beside rows (columns) the other puts in
 * at their edge: apply's remapping grows a range over rows put in inside it and closes it over rows taken out of its
 * end, the two do not commute there, and one order's range takes in the rows put in where the other's stops short of
 * them, that end apart by as many rows as were put in. What index transformation cannot know is left to rules the
 * server and its clients keep (docs/kernel.md §12):
 *
 *   1. Crossing spans. A splice that takes out some of a moved span's blocks and some others, or into whose span a
 *      moved span lands, and two moves whose spans overlap without one holding the other, or that each land inside the
 *      other, cannot be brought together by one op on each side: transform throws Conflict. The server refuses the
 *      later op and tells its author, whose client takes the server's document again and drops its pending ops.
 *   2. A table's columns. Two ops can together take out every column of a table, or put it past Z: the second throws
 *      where it is applied, in either order, and the server refuses it alike.
 *   3. No lock in the head. A sheet keeps its lock in the head for its first table, rows and columns move it there,
 *      and which table is first is the document's to say, not an op's: a shared document keeps its lock on its table's
 *      attributes, and the server refuses an op on the head's `lock`. The kernel has no check of this one: the
 *      server keeps it (rules 1 and 2 are transform's Conflict and apply's RangeError; rule 4 is the client's).
 *   4. The server's order is the document. A client keeps the server's document as far as it has been told (the
 *      ordered edits applied) and shows it with its pending ops applied (rebase); applying the server's op, transformed
 *      over its pending ones, to what it shows gives the same but for the two places above, so a client that does that
 *      takes the server's with its pending ops where they differ, and every client ends with the server's document.
 */
import { type Op } from './ops.ts';
import type { Doc } from './model.ts';
/** An operation as a client sends it: who made it, and the version of the document (the count of ops before it) it was made against. */
export interface Edit {
    id: string;
    author: string;
    base: number;
    op: Op;
}
/** An edit as the server appended it, transformed to apply after everything before it: its place in the order, from 1. */
export type Ordered = Edit & {
    seq: number;
};
/** Two ops whose spans cross (rule 1 above): no one op on each side brings the two orders to one document. */
export declare class Conflict extends Error {
    constructor(a: Op, b: Op);
}
type Side = 'left' | 'right';
/** `a` as it applies once `b` has, both made against one document; null when `b` took away what `a` acts on. Throws Conflict where their spans cross, and a TypeError for an op of no kind the kernel has. */
export declare function transform(a: Op, b: Op, side: Side): Op | null;
/**
 * Ops made one after another on a document (`mine`: a client's pending ops, an undo's) and others made on the same
 * document (`theirs`: the server's, in its order): mine as they apply after theirs, and theirs as they apply after
 * mine, to be carried on. Each of mine is transformed as 'right' over each of theirs, and theirs as 'left' over the
 * one of mine before it moves on to the next, so the later of mine meet it at the indices their own predecessors
 * left; one of mine that comes out null is dropped, and theirs still passes over it; one of theirs that comes out
 * null passes the rest unchanged, and is left out. Throws Conflict as transform does.
 */
export declare function cross(mine: Op[], theirs: Op[]): [Op[], Op[]];
/** A client's pending ops (made one after another on its own view) once the server's ops (in the server's order) have been applied before them: `cross`'s first half. */
export declare const rebase: (pending: Op[], over: Op[]) => Op[];
/** The document after the edits, in order: a snapshot and the ordered edits after it give the document now. */
export declare const applyEdits: (doc: Doc, edits: Edit[]) => Doc;
export {};
