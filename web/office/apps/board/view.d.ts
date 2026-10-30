/**
 * A board drawn, with no DOM: its lanes as columns side by side, each with its name and how many cards it holds, its
 * cards under it, each card its title and its fields as the Spreadsheet shows its cells (money in its currency, a date
 * as a date, a formula's value, "'007" as 007), as the model reads them (model.ts `boardOf`, the one place that rule is
 * kept, so the editor's cards and these say the same words). A print, a PDF, a PNG and the Display Link get landscape
 * Letter pages, four lanes to a page and the lanes after them on further pages, each page as tall as its longest lane
 * needs, and every card whole: its title and each of its fields wrapped to the card's width, none cut, since a page is
 * what a board is read from away from the screen. Drawn small (on a slide, in a text) or as a thumbnail, it is the
 * gist: one landscape page of the first four lanes, each card its title's first line, as many as fit. And the board as
 * words, for a screen reader and the API: lane by lane, card by card. The drawing is the kit's (`rect`, `text`,
 * `wrapText`, its colors), as every app's in the suite is, so a board's page looks like theirs.
 */
import { type Doc, type TextNode } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
import { type Card, type Field } from './model.ts';
/** A card's fields as drawn: those that show something (a formula that works out to nothing shows nothing). */
export declare const shownFields: (c: Card) => Field[];
/**
 * The board's pages: four lanes to a landscape Letter page, the rest on further pages, each page as tall as its longest
 * lane; small (or a thumbnail), one landscape page of four by three holding the first lanes and the titles that fit.
 * A board with no lanes is one page saying it has no cards.
 */
export declare function boardPages(doc: Doc, small?: boolean): Page[];
/** The board as words, lane by lane: each lane's name, then its cards, each its title and its fields. A document with no board is its own words. */
export declare function boardText(doc: Doc): TextNode[];
