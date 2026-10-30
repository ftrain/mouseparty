/**
 * The page's own commands (the registry's 'kit' scope, kit/core/commands.ts): undo and redo passed to the editor, find,
 * keep, share, download, print, the shortcuts, the size of everything and the search for anything (the drawer's). The shell answers their
 * keys (pageKey, which it listens with on the window, so every scope inside has answered first); the drawer draws
 * Share, Download and Find in this document from them; every bar ends with Undo and Redo
 * (DocElement.undoTools), and under a finger Undo and Redo are pinned there, outside the bar's scroll, so a phone always
 * has Undo on screen (the review of 2026-10-11).
 *
 * The keyboard shortcuts dialog (Mod+/, and found by the drawer's search) is the registry as it stands: the open
 * app's commands that have keys, then the words' (kit/text/text-commands.ts), then the page's, each key written the way
 * this device writes it (keysText: ⌘ on a Mac, Ctrl elsewhere).
 */
import { type TemplateResult } from 'lit';
import type { AppDef } from './app.ts';
import { type Command } from './commands.ts';
/** What Undo and Redo act on: the editor (the shell's, or a bar's own). */
export interface HasEditor {
    editor: Element | null;
}
/** What the page's keys act on: the shell. */
export interface Page extends HasEditor {
    /** The link made current: a key with Alt or Mod may leave the page or the document (Back, a new tab). */
    flush(): void;
    print(): void;
    shortcuts(): void;
    find(): void;
    keep(): void;
    /** The Share dialog; the drawer with its Download table open. */
    share(): void;
    download(): void;
    /** The drawer, its search focused (Mod+K). */
    search(): void;
    /** A document is open (Mod+P), and for editing, not as its pages (Mod+F, Mod+S). */
    doc: boolean;
    editing: boolean;
}
export declare const UNDO: Command<HasEditor>;
export declare const REDO: Command<HasEditor>;
export declare const SHARE: Command<Page>;
export declare const DOWNLOAD: Command<Page>;
/**
 * The size of everything (kit/ui/zoom.ts), from the drawer's stepper and its search, with no keys: Ctrl+=, Ctrl+- and Ctrl+0
 * are the browser's own zoom, and a keyboard keeps them.
 */
export declare const LARGER: Command<unknown>;
export declare const SMALLER: Command<unknown>;
export declare const NORMAL_SIZE: Command<unknown>;
/** Mod+K: the drawer with its search focused, which finds an app, a document, a template or a command (kit/ui/drawer.ts). */
export declare const SEARCH: Command<Pick<Page, "search">>;
/** The page's commands, in the order the dialog lists them. */
export declare const KIT_COMMANDS: Command<Page>[];
/** The groups the dialog shows: the app's own first when there is an app, then the words', then the page's. */
export declare function shortcutGroups(def?: AppDef): {
    heading: string;
    keys: Command[];
}[];
/** The dialog's body: a table a group. */
export declare function renderShortcuts(def?: AppDef): TemplateResult;
/**
 * The page's keys: the kit's commands, answered last (from the window), so the words and the app have answered
 * theirs first and a key one of them took is not the page's. A key with Alt or Mod makes the link current first. Undo
 * and redo are the editor's (the kernel's history): the keys are only passed on, and only from the editor itself (or
 * from nowhere, the page's body). Typed in a dialog, a popover, the header, the link or note box, or a field of the
 * kit's own, Mod+Z is that place's own; during an IME composition it is the IME's.
 */
export declare function pageKey(e: KeyboardEvent, page: Page): void;
