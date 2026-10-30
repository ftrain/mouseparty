/**
 * Diagram's templates, kind by kind: each kind's blank page first, named by its kind alone ("Mind map"; the lists add no
 * Blank of their own, def.ts's blankInTemplates), then two to four real ones. Each is canonical
 * TLO, as the kernel writes it, so it round-trips byte for byte (the corpus test holds every template).
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
