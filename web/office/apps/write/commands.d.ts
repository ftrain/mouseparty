import { type Command } from '../../kit/core/commands.ts';
import type { ToWriteEditor } from './editor.ts';
type W = ToWriteEditor;
/** The bar under a card in hand (§6's order), and its keys. */
export declare const CARD: Command<W>[];
/** The icon the Align menu shows: the alignment the block in hand has. */
export declare const alignIcon: (w: W) => import("lucide").IconNode;
declare const _default: Command<W>[];
export default _default;
