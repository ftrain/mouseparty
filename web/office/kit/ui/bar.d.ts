/**
 * <to-bar>: the one bar an app has. A single row that scrolls sideways when it must; a fade at either edge
 * says there is more (data-fade-start, data-fade-end: set here, drawn by the stylesheet). It is a toolbar: Left and Right
 * walk its buttons, Home and End go to its ends. Its buttons are the registry's commands (kit/core/commands.ts) drawn by
 * cmdTool, cmdBtn and cmdMenu. The buttons in
 * it are made with tool() and btn(): real <button>s, named, 44px to the finger, aria-pressed when they
 * are a state; dateNav() is the group an app with dates has (back, what is on view, on, Today).
 */
import { nothing, type TemplateResult } from 'lit';
import { type IconNode } from '../draw/icons.ts';
import { type Command } from '../core/commands.ts';
/** Said by a bar as it is put in the page: the chrome makes a bar slid away inert (kit/ui/chrome.ts). */
export declare const BAR_HERE = "to-bar-here";
export declare class ToBar extends HTMLElement {
    private watch;
    private soon;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private fadeSoon;
    /** The bar's buttons and menus, in order: what Left and Right walk (never one inside a menu that is open, nor one turned off). */
    private stops;
    /**
     * The bar is a toolbar (docs/editing.md §7): Left and Right walk its buttons and menus, round the ends, Home and End
     * to its ends; Tab goes on out of it. A key inside a menu that is open, a field or a box of words is theirs.
     */
    private walk;
    /** What the edges say: scrolled past the start, more past the end; and under 360px, room for one pinned tool (Undo) alone. */
    fade: () => void;
}
export interface BtnOpts {
    /** The button's name: shown by btn(), spoken (and a tooltip) by tool(). */
    label: string;
    icon?: IconNode;
    does?: (e: Event) => void;
    /** Given, the button is a state: aria-pressed. */
    pressed?: boolean;
    disabled?: boolean;
    cls?: string;
    /** The keys, for the tooltip: "Mod+B" is written as the device writes it. */
    keys?: string;
    /** The button never takes the focus: an editor's selection stays where it is, and a phone's keyboard stays up. */
    keep?: boolean;
    /** What more there is to say than the label's two words, as the tooltip ("Use the grid as the drawing's background"). */
    hint?: string;
    /** Under a finger, kept at the bar's inline end outside its scroll (a command's `pinned`: Undo, Redo). */
    pinned?: boolean;
    /** The icon's size in px: 20, a bar's; 24, a header's (a host's plus and its menu button, as the site's are drawn). */
    size?: number;
}
/**
 * The keys written at a row's end (a menu's item, the drawer's, a command its search finds), where there is a keyboard
 * to press them on (commands.ts chords); hidden from a screen reader, which hears them from the control's
 * aria-keyshortcuts instead, so they are never part of its name.
 */
export declare const keysKbd: (keys: string | undefined) => TemplateResult | typeof nothing;
/** The keys as the control's aria-keyshortcuts (none: no attribute). */
export declare const keysAria: (keys: string | undefined) => string | typeof nothing;
/** A button with its words on it (two at most, so the bar never wraps them; `hint` says the rest), and an icon before them if it has one. */
export declare const btn: (o: BtnOpts) => TemplateResult;
/** An icon button: its name is spoken and shown as a tooltip. */
export declare const tool: (o: BtnOpts) => TemplateResult;
/**
 * A command of the registry (kit/core/commands.ts) as a bar's icon button, in its context: its words, icon and keys, its
 * pressed state, disabled where it is not to be done now (or where there is no context: nothing in hand), and nothing
 * at all where it is not in force (`when`). `over` changes what the bar needs changed (a class; `disabled` given, the
 * button stays in its place, off, where the command is not in force: a bar that keeps its buttons where they are).
 */
export declare const cmdTool: <C>(cmd: Command<C>, c: C | null | undefined, over?: Partial<BtnOpts>) => TemplateResult | typeof nothing;
/** The same as a button with its words on it (btn): a command whose words say more than an icon would (Connect, Preview). */
export declare const cmdBtn: <C>(cmd: Command<C>, c: C | null | undefined, over?: Partial<BtnOpts>) => TemplateResult | typeof nothing;
/**
 * A command that is a menu (`menu`), as the bar's <to-menu>: its items the commands drawn in `menu:<name>` among `all`;
 * nothing at all where the command is not in force (`when`), as cmdTool and cmdBtn draw none.
 */
export declare const cmdMenu: <C>(cmd: Command<C>, c: C, all: readonly Command<C>[], cls?: string, opts?: {
    caret?: boolean;
    words?: boolean;
    icon?: IconNode;
    keep?: boolean;
}) => TemplateResult | typeof nothing;
export interface DateNavOpts {
    /** What is on view: "March 2027". */
    label: string;
    /** The two arrows' names: "Previous month", "A week earlier". */
    prev: string;
    next: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
}
/**
 * Where an app with dates is: back, what is on view, on, and Today. A group in the bar, the arrows icon
 * buttons with their names, Today words on a button.
 */
export declare const dateNav: (o: DateNavOpts) => TemplateResult;
