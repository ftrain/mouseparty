/**
 * The Emoji set of the icon picker: the native characters, by name and keyword, in Unicode's groups
 * (emoji-data.ts, written by scripts/emoji.ts from Unicode's and CLDR's data). No DOM and no fonts: an
 * emoji is drawn by the system, as words are. Loaded with the picker, never before.
 */
import { EMOJI_GROUPS } from './emoji-data.ts';
export { EMOJI_GROUPS };
/** The emoji in one group (an index into EMOJI_GROUPS), in Unicode's order. */
export declare const emojiIn: (group: number) => string[];
/** An emoji's name ("automobile"), '' for a character that is not one. */
export declare const emojiName: (char: string) => string;
/** Emoji matching what was typed, best first (a word of the name before a keyword): every word typed must begin a word of either. Nothing typed gives nothing. */
export declare function searchEmoji(query: string, limit?: number): string[];
/** Emoji for a completion, best first (icons-search.ts rankMatches over the name and the keywords, a keyword typed whole counting as a name). */
export declare const completeEmoji: (query: string, limit?: number) => string[];
/** The emoji whose name is this, written with hyphens ("red-heart" is ❤️), or '' for none. */
export declare const emojiNamed: (name: string) => string;
