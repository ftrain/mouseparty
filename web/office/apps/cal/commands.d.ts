import { type Command } from '../../kit/core/commands.ts';
import type { ToCalEditor } from './editor.ts';
type C = ToCalEditor;
export declare const AT: (at: string) => Command<ToCalEditor>[];
declare const _default: Command<C>[];
export default _default;
