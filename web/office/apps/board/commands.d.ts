import { type Command } from '../../kit/core/commands.ts';
import type { ToBoardEditor } from './editor.ts';
type B = ToBoardEditor;
/** The items in the bar under chosen cards and their keys; the keys in a card's title. */
export declare const CHOSEN: Command<ToBoardEditor>[];
export declare const WORDS: Command<ToBoardEditor>[];
declare const _default: Command<B>[];
export default _default;
