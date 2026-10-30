/**
 * Draw's templates: Blank is the app's own page; these are the rest, each a real drawing written by the
 * kernel (so each is canonical and round-trips byte for byte). Shapes first, the everyday ones before the
 * special, then pixels. templates.md says what each is for.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
