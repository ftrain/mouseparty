import { type Command } from '../../kit/core/commands.ts';
import { type Loop } from './model.ts';
import type { ToAnimEditor } from './editor.ts';
type A = ToAnimEditor;
/** A repeat, named. */
export declare const loopName: (l: Loop) => string;
declare const _default: Command<A>[];
export default _default;
