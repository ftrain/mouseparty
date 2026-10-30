import type { Block } from '../../doc/index.ts';
import type { Sel } from './textops.ts';
/**
 * The words selected in the editor, as a comment keeps them (Quote): the words, and where they begin, its block and
 * its place there as the editor counts (a selection over several blocks, their words a line each). Null with no
 * selection, or one with no words in it. What pinComments finds a comment by.
 */
export interface Quote {
    quote: string;
    block: number;
    offset: number;
}
export declare function quoteAt(text: {
    model: readonly Block[];
    sel: Sel | null;
}): Quote | null;
