/**
 * The calculator's templates: Blank is the app's own page (an empty tape); these are the rest, each a real
 * piece of working in TLO, canonical as the kernel writes it so each round-trips byte for byte (the corpus
 * test holds every one). The everyday sums first, then the ones about money over time and the body, then the
 * graphs. A line of words ending in a period or a colon is a note on the tape (model.ts, isNote): the dose
 * template says plainly that it is arithmetic, not advice. What each is for: templates.md.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
