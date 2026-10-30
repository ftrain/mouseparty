/**
 * The Deck's templates: Blank is the app's own page; these are the rest, each a real deck or printed thing
 * in TLO with real words, canonical as the kernel writes it so each round-trips byte for byte (the corpus
 * test holds every one). The decks people make most come first (a talk, a status, a proposal, a pitch, a
 * lesson), then the occasions (a conference talk with its notes, a quarterly review, a workshop, a launch,
 * a town hall, a quiz, a wedding); then the printed things, two of each format. Every theme
 * a deck uses is a different one where it can be, so the list shows what the Look menu does. One line a
 * template on what it is for: templates.md.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
