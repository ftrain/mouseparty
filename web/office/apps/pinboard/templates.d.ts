/**
 * The Pinboard's templates: Blank is the app's own (the board's empty table); these are the rest, each a real board
 * with real sample content, written by the kernel so each is canonical and round-trips byte for byte. templates.md
 * says what each is for. Their names and blurbs are the reader's language; their notes are English, as the suite's
 * templates are. No template holds a picture: the site keeps none, and a template is the site's as much as a host's.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
