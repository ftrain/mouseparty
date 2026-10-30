/**
 * Motion's templates: Blank is the app's own page; these are the rest, each a real motion written by the
 * kernel (so each is canonical and round-trips byte for byte): the shapes as Draw writes them, the keys as
 * the editor does. Each starts on a moment worth seeing, because the home page's preview is the first frame.
 * templates.md says what each is for.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
