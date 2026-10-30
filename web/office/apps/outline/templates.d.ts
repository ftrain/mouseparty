/**
 * Outline's templates: Blank is the app's own page; these are the rest, each a real outline written by the
 * kernel (so each is canonical and round-trips byte for byte, and the corpus test holds every one). The
 * everyday ones come first (a list to pack, a choice, a plan, a talk), then the work of school and study,
 * then the shapes another app draws (a novel, a book, a company and a family, each handed off), and last the
 * trees you walk by answering yes or no. What each is for is in templates.md.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
