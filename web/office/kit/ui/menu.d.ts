/**
 * <to-menu>: a button that opens a menu of items, on the Popover API: light-dismissed, on top of
 * everything, Escape closes it and focus comes back to the button. Placed by hand below (or above) its
 * button, inside the visual viewport, so it sits above a phone's keyboard.
 *
 * Its keys are `menuKey`'s, the one set every menu and listbox here keeps (the templates' too): the focus
 * roves over the items, so there is one item in hand and one highlight, the focused item's (a mouse over an
 * item takes the focus to it). Opened by a key, the first item has the focus; opened by a pointer, the menu
 * itself does, and the first arrow goes in.
 * `keep`: a menu that acts on an editor's selection (Align) never takes the focus from it by a pointer, so a
 * phone's keyboard stays up; opened from the keyboard, its items still take the focus to be walked.
 * A row (an item with `actions`) is one stop for Up and Down, its first action the focus when it is reached; Left and
 * Right go between its actions, and Enter or Space does the one in hand. A screen reader hears the row's words (its
 * group's name) and then the action.
 * `filter` (Insert ▾ has it): letters typed narrow the list to the items with a word that starts with them
 * (case and accents aside), said at the menu's top; Backspace takes a letter back, Escape the letters, then
 * the menu. The arrows walk what is left.
 * `buttonless`: no button of its own, for a menu a page opens with `openAt` beside what was picked (a table's row, an
 * outline's item, a column's head); placed beside that, the focus given back to it.
 */
import { LitElement, type TemplateResult } from 'lit';
import { type IconNode } from '../draw/icons.ts';
export interface MenuItem {
    label: string;
    icon?: IconNode;
    /** A colour shown as a dot in the icon's place (a colour menu, a theme's). */
    swatch?: string;
    /** A second line, smaller. */
    hint?: string;
    /** A heading the item sits under. */
    group?: string;
    disabled?: boolean;
    /** It destroys something (Delete): drawn in the danger color. */
    danger?: boolean;
    /** The keys that do the same, written at the item's end as the device writes them: "Mod+Shift+L". */
    keys?: string;
    /** Given, the item is a checkbox (role=menuitemcheckbox). */
    checked?: boolean;
    /**
     * Given, the item is a row: its words at the left, these as icon buttons at the right, each a menu item of its own
     * (the Download menu's formats: view, share, download, copy link). The row's own `does` is not called.
     */
    actions?: MenuAction[];
    does(): void;
}
/** One of a row's actions: an icon, the words a screen reader says and a hover shows, and what it does. */
export interface MenuAction {
    icon: IconNode;
    label: string;
    does(): void;
}
/**
 * Put a popover beside what opened it, inside the visual viewport (above the keyboard on a phone): under it, or
 * over it where only that side has the room; where neither has, on the side with more, as tall as that side
 * allows, scrolling inside. Its left edge at the opener's; where that would run off the screen, its right edge
 * at the opener's (a menu from a button at the right comes down under that button, not against the screen's
 * other side).
 */
export declare function place(pop: HTMLElement, anchor: HTMLElement, gap?: number): void;
/** Whether a pointer, not a key, opened what is opening now. */
export declare const openedByPointer: () => boolean;
/**
 * A list that opens under the press that opened it (the templates' dialog, over the whole screen: its first rows land
 * where the button was) takes no press at that spot for the first moment (Paul, 2026-10-12: "Sometimes when I click a
 * template the link to an app underneath opens up"). `open()` as the list opens remembers where the press that opened
 * it was, if a pointer's and now; `down` and `stops`, on the list's pointerdown and click in the capture phase, swallow a press
 * within SPOT_PX of that spot and within SPOT_MS of the open, or of the last press it swallowed (a double tap, a slow
 * tap the browser delivers after the list opened, a finger that presses again because the list seemed slow): nothing
 * is chosen and nothing closes. A press decided at its pointerdown is decided for its click; a click whose press began
 * before the list opened (on the button) is decided by where it lands. A key's click (detail 0) always goes through.
 */
export declare class OpeningPress {
    private spot;
    /** The press under way in the list, decided at its pointerdown: swallowed or not; null, none began in the list. */
    private held;
    open(): void;
    /** Whether a press here and now is the opening one again; if it is, the moment starts over. */
    private again;
    /** On the list's pointerdown, in the capture phase: the press is decided as it begins. */
    readonly down: {
        capture: boolean;
        handleEvent: (e: PointerEvent) => boolean;
    };
    /** On a click in the list, in the capture phase: true when it is the opening press again, stopped here. */
    stops(e: MouseEvent): boolean;
}
/**
 * A key pressed in a menu (or a listbox) whose items are `items`, the same in every one: ArrowDown and
 * ArrowUp to the next and the previous item, round the ends (from the menu itself, the first and the last);
 * Home and End (PageUp and PageDown) to the first and the last; letters to the next item whose name starts
 * with them; Enter or Space chooses (a click on the item); Escape and Tab close (`close` puts the focus back
 * on the opener). Shift, Alt, Ctrl and ⌘ change none of these. True, the key stopped here, when it was the menu's.
 */
export declare function menuKey(e: KeyboardEvent, box: HTMLElement, items: HTMLElement[], close: () => void, focused?: HTMLElement | null): boolean;
/** A mouse over an item takes the focus to it, so the item under the mouse is the one the arrows go on from. */
export declare function hoverFocus(e: PointerEvent): void;
export declare class ToMenu extends LitElement {
    static properties: {
        label: {};
        icon: {
            attribute: boolean;
        };
        /** A colour as a dot on the button, in place of an icon (a menu of colours shows the one chosen). */
        swatch: {};
        items: {
            attribute: boolean;
        };
        caret: {
            type: BooleanConstructor;
        };
        iconOnly: {
            type: BooleanConstructor;
            attribute: string;
        };
        keys: {};
        keep: {
            type: BooleanConstructor;
        };
        filter: {
            type: BooleanConstructor;
        };
        buttonless: {
            type: BooleanConstructor;
        };
        query: {
            state: boolean;
        };
    };
    label: string;
    /** Another button the menu was opened from (openAt): placed beside it, focus goes back to it. */
    private anchor;
    icon: IconNode | null;
    swatch: string;
    items: MenuItem[];
    /** A small arrow after the words. */
    caret: boolean;
    /** The icon alone; the label is the button's name. */
    iconOnly: boolean;
    /** The key that opens it, written at the button's end (the drawer's Download row). */
    keys: string;
    /** Never takes the focus by a pointer (it acts on an editor's selection). */
    keep: boolean;
    /** Letters typed narrow the items (Insert ▾). */
    filter: boolean;
    /** No button of its own: the page opens it with `openAt`, beside what it opens for. */
    buttonless: boolean;
    /** The letters typed so far, while `filter`. */
    query: string;
    /** This opening came from a pointer on a `keep` menu: the focus stays where it was. */
    private kept;
    /** The menu is closing by a key (see closeByKey). */
    private byKey;
    /** Opened by a pointer: what had the focus then (the words a row's bullet acts on), where a key's close gives it back. */
    private cameFrom;
    readonly uid: string;
    constructor();
    createRenderRoot(): this;
    /** The words on the button; a subclass may give a default. */
    protected labelText(): string;
    /** The menu's own button (none where it is `buttonless`). */
    get button(): HTMLButtonElement;
    /** What the menu is placed beside and gives the focus back to: the opener `openAt` was given, else its own button, else itself. */
    private get from();
    get menu(): HTMLElement;
    get isOpen(): boolean;
    open(): void;
    /** Open beside `anchor` instead of this menu's own button: one menu for many openers (a sheet's column heads). */
    openAt(anchor: HTMLElement): void;
    close(): void;
    /** The stops Up and Down go between: every item, and of a row its first action. */
    private menuItems;
    private onToggle;
    private replace;
    private onKey;
    /** A letter typed into a menu that filters: the list narrowed (or widened by Backspace, or whole again by Escape). True when the key was this. */
    private narrow;
    /** Whether an item stays while letters are typed: a word of its name starts with them. */
    private stays;
    /** A `keep` menu open while the focus stays in the editor: Up and Down take the focus into the menu, which is then an ordinary one. */
    private onKeptKey;
    /** Closed by a key (Escape, Tab): the focus goes back to the button whatever the browser restores. */
    private closeByKey;
    private choose;
    /** A pointer on a `keep` menu's button or items: no focus moves. */
    private hold;
    private renderItem;
    render(): TemplateResult<1>;
}
