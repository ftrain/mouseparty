/**
 * The command registry: every thing a person can do from a bar, a menu, a context bar, the drawer or a key, declared
 * once. A command is an id, its words (through t()), an icon, its keys, the scope it is bound in, where it is drawn,
 * when it is in force, and what it does to its scope's context: the shell for 'kit', a <to-text> for 'text', an app's
 * editor element for that app's id. The kit's are keys.ts, the words' text-commands.ts, the rows' rows-commands.ts,
 * an app's its own commands.ts beside its editor (reached through AppDef.commands). Everything else is drawn or
 * checked from these:
 *
 * - the bars (bar.ts `cmdTool`, `cmdBtn`), the menus (`cmdMenu`, its rows `drawnIn`), the context bars and the
 *   selection bubble (`contextOf`);
 * - the keys: each scope's element answers its own keydown with `runKey(e, its commands, its context)`, inner first
 *   (the words inside an app inside the page), and a key an inner scope took is not an outer one's;
 * - the shortcuts dialog and the drawer's search for anything (kit/ui/drawer.ts), which read the registry as the page runs;
 * - docs/editing.md's tables and the skill's list of commands (scripts/commands.ts, `npm run commands`);
 * - the graph lints (test/commands.test.ts): no key bound twice in one chain of scopes unless allowed, every bar
 *   command reachable by its keys or the bar's arrows, every label a message of en.ftl, every command run by a test;
 * - for a program rather than a page (src/commands.ts, `tinylittleoffice/commands`): the tools an assistant or an MCP
 *   server serves (`tools`), from what a command takes (`input`, a JSON Schema) and who may run it (`who`), and a page
 *   of documentation (`docsOf`). The site's commands carry none of these; a program's declare them.
 *
 * A command's words are a message's id (src/i18n/en.ftl), put through t() when drawn (a function of the context only where they say what
 * is in hand), and a scope declares its commands through its maker (`commandsOf`), terse, since an app's load with it.
 * Rows that are data rather than commands (themes, inks, a new document of each app) are `data: true`: drawn and found
 * by the drawer's search, left out of the generated tables. Menus whose rows are the document's data and not commands
 * stay hand-built and are not to be moved here: the sheet's column kinds and formula functions, the deck's
 * slide-document menu, the outline's line menu, the calendar's date and time-zone dialogs, and themes and inks wherever they are
 * not rows of a menu here already.
 *
 * Keys are written "Mod+Alt+Shift+Key" (Mod is ⌘ on Apple devices, Ctrl elsewhere), alternatives joined by " / ";
 * the key is a letter in capitals, a digit, a sign (".", ",", "[", "=", "/"), or a key's name (Enter, Escape, Tab,
 * Space, Delete, Backspace, ArrowUp…, Home, End, PageUp, PageDown, F2). keysText() is the one place they are spelled
 * for a person, a Mac's way or Windows'. Nothing here touches the DOM: the lints and the scripts read it under node.
 */
import type { IconNode } from 'lucide';
/** Words a command shows: a message's id, put through t() when drawn, or, where they say what is in hand, a function of the context. */
export type Words<C, R = string> = string | ((c?: C) => R);
/** Words drawn in this context (none in hand: undefined). */
export declare const say: <C, R extends string | undefined>(w: Words<C, R> | undefined, c?: C) => R | string | undefined;
/** A JSON Schema object (what an API, an assistant's tools and a fuzz read): what a command takes, or gives back. */
export type Schema = Record<string, unknown>;
/** Where a command is drawn: the app's bar, a menu of it (`menu:align`), the context bar, the drawer's This document, in the document itself (a row's number, a task's options), or nowhere (a key alone). */
export type Where = 'bar' | `menu:${string}` | 'context' | 'drawer' | 'in-doc' | 'keys-only';
export interface Command<C = any> {
    /** "write.title", "text.bold", "kit.undo": the scope, a dot, a name. */
    id: string;
    /** Its words: a message's id ('bar-bold'), or a function of the context where they say what is in hand ("Move slide up", "Pause"). */
    label: Words<C>;
    icon?: IconNode;
    /** A second line or a tooltip's longer words, through t() (none, given the context, where there is nothing to add). */
    hint?: Words<C, string | undefined>;
    /** The keys that run it, alternatives joined by " / ". */
    keys?: string;
    /** 'kit', 'text', or an app's id. */
    scope: string;
    /**
     * Where in its scope the key is answered: the canvas, a cell, the rail, the show, a card, an entry line. Two commands
     * of one scope may bind the same key at different places (the lints read it); none is everywhere in the scope.
     */
    at?: string;
    where: Where[];
    /** In force: drawn, offered by the drawer's search, answered by its keys. Absent: always. */
    when?: (c: C) => boolean;
    /** Drawn but not to be done now (dimmed; its keys go on to whatever else answers them). */
    disabled?: (c: C) => boolean;
    /** A state it shows (aria-pressed in a bar, a check in a menu). */
    pressed?: (c: C) => boolean;
    /** The context bar draws a gap between commands of different groups (§6's order: edit | copy, cut, paste | delete). */
    group?: string;
    /** In the context bar only while this holds too (the lists, over whole blocks of words), where the bar shows it always. */
    context?: (c: C) => boolean;
    /** A menu (the bar draws a <to-menu>): its items are the commands drawn in `menu:<this>`. */
    menu?: string;
    /** Words drawn on the button in the icon's place ("S", "M", "L": a text size). */
    letter?: Words<C>;
    /** A colour shown as a dot in the icon's place (a theme's, an ink's). */
    swatch?: (c?: C) => string;
    /** The heading a menu item sits under (Insert ▾'s "A new document"), through t(). */
    heading?: Words<C>;
    /**
     * In force only where a page holding the editor asks for it (the changes a host shows among the words), never on the
     * site: docs/editing.md lists it, saying so, and the skill's keys, which drive the site, leave it out.
     */
    host?: true;
    /** A row of data (a theme, an ink, a new document of each app), not a command a person learns: drawn and offered by the drawer's search, but left out of the generated tables. */
    data?: boolean;
    /** Needs nothing in hand: shown in the drawer's This document too, so a phone reaches it while the bar is away (reading). */
    document?: boolean;
    /** The key is the browser's (Copy, Cut, Paste raise their own events): listed and drawn, but never taken from a keydown. */
    native?: boolean;
    /** Takes the focus when tapped (a button that opens a dialog); others keep it where it is, so a phone's keyboard stays up. */
    takesFocus?: boolean;
    /** Under a finger, kept at the bar's inline end outside its scroll, always on screen (Undo, Redo: bar.ts, responsive.css). */
    pinned?: boolean;
    /** Done. `false`: it did not apply here after all (Tab where no item can move), and the key goes on. */
    does: (c: C, e?: Event) => unknown;
    /** What it takes, for a program that runs it (an API, an assistant): a JSON Schema object. */
    input?: Schema;
    /** What it gives back, for that program: a JSON Schema object. */
    output?: Schema;
    /** Who may run it from a program ("team", "assistant"): the whole of authorization. Absent: no one, a page's alone. */
    who?: readonly string[];
    /** It reads and changes nothing (a program need not log it). */
    reads?: true;
    /** One sentence saying what it does, for a tool's description and the documentation (its words, without one). */
    doc?: string;
}
/** A command typed for its context: an identity, for inference. */
export declare const command: <C>(c: Command<C>) => Command<C>;
/** A scope's maker: `id` without the scope's prefix, the scope filled in (`const cmd = commandsOf<W>('write')`). */
export declare const commandsOf: <C>(scope: string) => (id: string, label: Words<C>, rest: Omit<Command<C>, 'id' | 'scope' | 'label'>) => Command<C>;
/** A command's words in this context. */
export declare const labelOf: <C>(cmd: Command<C>, c?: C) => string;
/** Commands put in the registry (an app's when its editor loads; the kit's and the words' when their modules do). The same id again replaces it. */
export declare function register(cmds: readonly Command[]): readonly Command[];
/** Every command registered so far. */
export declare const registered: () => Command[];
/** The commands of one scope, in the order they were declared. */
export declare const inScope: (scope: string) => Command[];
/**
 * The tools an assistant or an MCP server serves to an actor: each command `actor` is among the `who` of, as MCP
 * names a tool's fields, in the order given. The description is the command's `doc`, or its words as t() says them
 * (English in a program, which chooses no language); the parameters are its `input`, or an object of nothing.
 */
export declare const tools: (cmds: readonly Command[], actor: string) => {
    name: string;
    description: string;
    inputSchema: Schema;
}[];
/**
 * The documentation of the commands given, as Markdown, in their order: each one's id, what it does (`doc`, or its
 * words), its scope, who may run it, whether it reads only, and what it takes and gives back.
 */
export declare function docsOf(cmds: readonly Command[]): string;
/** Whether a command is in force and may be done in this context. */
export declare const live: <C>(cmd: Command<C>, c: C) => boolean;
/** A hook the tests set to learn which commands ran (test/browser/setup.ts writes the coverage map from it); null in the page. */
export declare const trace: {
    ran: ((id: string) => void) | null;
};
/** A command done in its context; what it returns (false: it did not apply). */
export declare function run<C>(cmd: Command<C>, c: C, e?: Event): unknown;
/** One key's spelling put in order: "Shift+Mod+b" → "Mod+Shift+B". */
export declare function normalKey(one: string): string;
/** A keys string's alternatives, each in order. */
export declare const keyList: (keys: string | undefined) => string[];
/** A key pressed, spelled as the registry spells it: "Mod+Shift+K", "Alt+ArrowUp", "V", "Space". */
export declare function keyOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): string;
/**
 * A key answered by a scope: the first command among `cmds` in force here whose keys it is runs, and the key stops
 * (its default prevented: the next scope out lets it be). Nothing during an IME's composition, nothing a scope
 * inside already took, nothing the browser owns (`native`). True when a command took it.
 */
export declare function runKey<C>(e: KeyboardEvent, cmds: readonly Command<C>[], c: C): boolean;
/** Keys as a person reads them on this device (or on a Mac, `mac`): "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere; arrows as arrows; alternatives joined by " / ". */
export declare function keysText(keys: string, mac?: boolean): string;
/** Keys as aria-keyshortcuts says them ("Control+Shift+S Meta+Shift+S" is two): Mod is Meta on a Mac, Control elsewhere. */
export declare function ariaKeys(keys: string, mac?: boolean): string;
/**
 * Whether the keys are written beside a command: always under a mouse; under a finger only once a keyboard has been
 * seen (a key typed with Ctrl, ⌘ or Alt: a phone's own keyboard types none), since a phone has none to press them on
 * (the review of 2026-10-11). Either way the keys are the control's aria-keyshortcuts, never part of its name.
 */
export declare const keyboard: {
    seen: boolean;
};
export declare const chords: () => boolean;
/** What a menu (menu.ts MenuItem) or a context bar (context.ts ContextItem) needs of a command, in its context. */
export interface Drawn {
    label: string;
    /** A menu item's heading. */
    group?: string;
    swatch?: string;
    /** Words in the icon's place (context.ts ContextItem.text). */
    text?: string;
    icon?: IconNode;
    hint?: string;
    keys?: string;
    disabled?: boolean;
    pressed?: boolean;
    checked?: boolean;
    does(): void;
}
/** A command as an item of a menu or a context bar, in this context (null: none in hand, drawn disabled). */
export declare function drawn<C>(cmd: Command<C>, c: C | null | undefined): Drawn;
/** The commands of a list drawn where `where` says, in force in this context, as menu items. */
export declare const drawnIn: <C>(cmds: readonly Command<C>[], where: Where, c: C | null | undefined) => Drawn[];
/** The same as a context bar's entries (context.ts): a gap, "|", between groups. */
export declare function contextOf<C>(cmds: readonly Command<C>[], c: C): (Drawn | '|')[];
/** Whether the pointer is a finger (a phone, a tablet): the context bar is a row of the bottom bar, and a bar comes with the focus. */
export declare const coarse: () => boolean;
