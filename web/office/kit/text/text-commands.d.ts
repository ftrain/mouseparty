import { type Command } from '../core/commands.ts';
import type { ToText } from './text.ts';
export declare const BOLD: Command<ToText>;
export declare const ITALIC: Command<ToText>;
export declare const UNDERLINE: Command<ToText>;
export declare const STRIKE: Command<ToText>;
export declare const HIGHLIGHT: Command<ToText>;
export declare const CODE: Command<ToText>;
export declare const LINK: Command<ToText>;
export declare const FOOTNOTE: Command<ToText>;
export declare const BULLETS: Command<ToText>;
export declare const NUMBERS: Command<ToText>;
export declare const OUTDENT: Command<ToText>;
export declare const INDENT: Command<ToText>;
/**
 * Comment on the words selected, first in the bubble, where a host takes comments: an element around the words marked
 * `data-comments`, which hears "text-comment" (bubbling from the <to-text>, its detail the words selected as a comment
 * keeps them, kit/text/quote.ts Quote, or null) and opens its own box; not inside the words of that box
 * (`data-comment-box`), where a comment is being written.
 */
export declare const COMMENT: Command<ToText>;
/** Every command of the words, in the order the bubble and the shortcuts dialog list them. */
export declare const TEXT_COMMANDS: Command<ToText>[];
export declare const CHANGE_KEYS: Command<ToText>[];
