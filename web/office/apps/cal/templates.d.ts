/**
 * Calendar's templates: Blank is the app's own page (an empty calendar on this month); these are the rest,
 * each a real calendar in TLO, canonical as the kernel writes it so each round-trips byte for byte (the
 * corpus test holds every one). The order is the dropdown's: the household first, then groups of people,
 * then the year's seasons, then the work, then the events. templates.md says what each is for.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
