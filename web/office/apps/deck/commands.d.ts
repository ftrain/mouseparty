import { type Command } from '../../kit/core/commands.ts';
import type { ToDeckEditor } from './editor.ts';
type D = ToDeckEditor;
/** The show's keys (while presenting, heard on the window), and the rest. */
export declare const SHOW: Command<ToDeckEditor>[];
export declare const EDIT: Command<ToDeckEditor>[];
declare const _default: Command<D>[];
export default _default;
