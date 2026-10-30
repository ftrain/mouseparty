/**
 * Write's templates: Blank is the app's own page; these are the rest, each the shape of a document and a hint at
 * each part (Paul, 2026-10-11: "just little summaries and hints to what they might say rather than the content
 * themselves"). The shape is the headings in order, the address block's lines, the date line, the greeting and
 * sign-off, the title's attributes, the page breaks, one footnote where a template teaches footnotes; every
 * paragraph of prose is one hint in italics, saying what goes there. The numeric parts keep their numbers: the
 * invoice's lines, the recipe's scaling, the thesis's table, the grant's budget, the newsletter's dates, the
 * minutes' sums. Each is canonical as the kernel writes it, so it round-trips byte for byte (the corpus test holds
 * every one). The invoice is a text whose fields are head fields and whose lines are a table
 * block the formula engine works out in place: Amount is =Qty×Price and locked, the blank row under the lines is
 * inside the subtotal's reach so a line added there is summed, and the tax rate sits in its own row's Qty cell,
 * where a formula can read it.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
