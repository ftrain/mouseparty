import { type Command } from '../../kit/core/commands.ts';
import { type Align, type Kind } from './model.ts';
import type { ToDrawEditor } from './editor.ts';
type Dr = ToDrawEditor;
/** 'f' draws by hand: a drag is a stroke, closed into a shape when it ends where it began. */
export type Tool = 'select' | Kind | 'f';
type Icon = Command['icon'];
/** How far a turn goes by the keys and the bar. */
export declare const TURN_STEP = 15;
/** The tools in the bar, a key each. */
export declare const TOOLS: {
    id: Tool;
    name: string;
    hint?: string;
    icon: Icon;
    key: string;
}[];
/** A text's three alignments: the bar's one button shows the one it has and goes on to the next; Mod+Shift+L, E and R set each (the Word Processor's keys, and every word processor's). */
export declare const ALIGNS: {
    al: Align | '';
    name: string;
    icon: Icon;
    key: string;
}[];
/** The pixel inks, by letter, named. */
export declare const PIXEL_INKS: {
    k: string;
    name: string;
}[];
/** Mod+Shift+L, E and R: the texts in hand (or the one being typed in) aligned. */
export declare const ALIGN_KEYS: Command<Dr>[];
/** The context bar while the words are typed: size and alignment | inks. */
export declare const TYPING: Command<ToDrawEditor>[];
/** The keys on the canvas, and in pixel mode. */
export declare const CANVAS_KEYS: Command<ToDrawEditor>[];
export declare const PIXEL_KEYS: Command<ToDrawEditor>[];
declare const _default: Command<Dr>[];
export default _default;
