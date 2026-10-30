import board from './apps/board/def.ts';
import './apps/board/editor.ts';
export { board };
export * from './apps/board/model.ts';
export type { CardLook, LaneEvent, LaneEvents, LaneTone, PickedCard, ToBoardEditor } from './apps/board/editor.ts';
/** The Board put beside the suite's apps. Once: a second call does nothing. */
export declare function registerBoard(): void;
/** `registerBoard`, by the name the Board's own package gave it. */
export declare const install: typeof registerBoard;
