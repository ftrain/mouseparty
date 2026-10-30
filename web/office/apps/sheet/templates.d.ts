/**
 * Sheet's templates: Blank is the app's own page; these are the rest, each a real document written by the
 * kernel (so each is canonical and round-trips byte for byte, and the corpus test holds every one). The
 * everyday ones come first (money, habits, logs, lists), then the ones for work and groups, then the
 * calculators, and last the four models: flows of From | To | Amount drawn as a Sankey, the assumptions
 * beside them as named cells to play with, the formulas locked so a reader changes the numbers and not the
 * model, and a headline (`{big=…}`) drawn large. What each is for is in templates.md.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
