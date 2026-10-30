import { type Command } from '../../kit/core/commands.ts';
import type { ToPinboardEditor } from './editor.ts';
type Pb = ToPinboardEditor;
type Icon = Command['icon'];
/** What a press on the board makes: nothing (Select), a thing of a kind, a stroke, or an arrow from one thing to another. */
export type Tool = 'select' | 'note' | 'text' | 'frame' | 'pen' | 'arrow';
export declare const TOOLS: {
    id: Tool;
    name: string;
    icon: Icon;
    key: string;
}[];
/** The keys on the canvas. */
export declare const CANVAS_KEYS: Command<ToPinboardEditor>[];
declare const _default: Command<Pb>[];
export default _default;
