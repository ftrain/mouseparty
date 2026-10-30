/**
 * <to-trip-editor>: the Trip app. A map (MapLibre on OpenFreeMap, imported lazily) above the stops, beside them when
 * there is room. A tap on the map adds a stop there (after the stop in hand); a pin dragged moves its stop, and a
 * focused pin is nudged by the arrows; Insert ▾ finds a place by name (OpenStreetMap's Nominatim, asked only when
 * Search is tapped) or puts a stop at the map's middle. Each stop is a row: its number (the handle: a tap chooses
 * the stop, a drag carries it), its name and note (one-line <to-text>s over the table's plain cells).
 *
 * The words follow docs/editing.md §6: Enter in the name goes to the note, Enter in the note asks for the next
 * stop by name; Backspace in an empty stop takes it away; Up/Down go from stop to stop, Alt+Up/Down move the stop
 * and Mod+D duplicates it, the caret kept where it was. Stops are rows of the kit's rows.ts: a tap on the number,
 * Escape or Shift+Up/Down in the words choose them whole, and chosen stops are moved, duplicated, copied (TLO and
 * our HTML), cut, pasted and deleted from the keys or the bar under them. The map keeps its own wheel and pinch
 * (§8), and a double tap on it zooms without adding a stop. Every edit carries where the caret or the chosen stops
 * were, so an undo puts them back. The bar holds Insert ▾, the units, whether the stops are a route or dots, the
 * whole route in view, the map on or off, and ends with undo and redo.
 *
 * Present (Mod+Alt+Enter, or the bar's button) gives the map the whole screen and flies it from stop to stop,
 * one a click (Space, the right arrow), each named with its note and the leg to it; Escape ends (as a slide
 * that holds a trip builds a stop a step: AppDef.steps).
 *
 * This is the one app that talks to the network by itself: while the map is on view its pictures come from
 * tile.openstreetmap.org (and, by the same Map switch, under a trip drawn anywhere: view.ts). The route itself lives only in the link. A trip with no stops opens on the country of the
 * site's language (home.ts: the browser's own region overriding it, New York City where neither says), never on the
 * whole world. Where I am, in the bar, asks the browser where the device is (once a tap, no watching, 5 s at most)
 * and centers the map there at a city's zoom; refused or unknown, the map goes to that country. The position is used
 * for that and nothing else: it is never written into the document or kept anywhere. Every change is operations on
 * the document's table (model.ts).
 */
import { type PropertyDeclarations, type PropertyValues } from 'lit';
import { type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { Rows } from '../../kit/text/rows.ts';
import { type TripView } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/ui/dialog.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-trip-editor";
export interface Place {
    name: string;
    detail: string;
    lat: number;
    lon: number;
}
type Field = 'name' | 'note';
export declare class ToTripEditor extends DocElement<TripView> {
    static properties: PropertyDeclarations;
    /** The map's style, by its address (MAP_STYLE); '' draws an empty map (a test, or a map with no network). */
    mapStyle: string;
    /** The stop in hand (the caret's, or the last picked), by its place in the route; -1 for none. */
    cur: number;
    showMap: boolean;
    query: string;
    /** What a search found; null before one. */
    found: Place[] | null;
    searching: boolean;
    /** Presenting (Present in the bar): the stop the map has flown to, by its place in the route; -1 when not presenting. */
    presenting: number;
    private map;
    /** The stops' pins on the map, in the stops' order. */
    private pins;
    private mapEl;
    /** What the pins were last drawn from, so a render that changed nothing else leaves the map alone. */
    private drawn;
    /** Fit the map to the stops at the next drawing: a new document, or a new map. */
    private refit;
    /** A tap on the map waiting out a double tap. */
    private tapping;
    /** The pin to give the focus back to once the pins are drawn again (a nudge, by the keys). */
    private pinFocus;
    /** The stop the map last showed for a choice, so it pans once per choice. */
    private panned;
    /** Where a stop found by name goes: after this one (null: the route's end). */
    private findAfter;
    /** The words of each name and note as their editor holds them (a space typed at the end the table does not keep). */
    private drafts;
    private ones;
    /** Stops chosen whole: the kit's one implementation (keys, the handle, drag, clipboard, the bar under them). */
    readonly rows: Rows<number>;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected read(doc: Doc): TripView;
    protected willUpdate(changed: PropertyValues): void;
    protected updated(changed: PropertyValues): void;
    private mark;
    /** Every edit carries where the selection was before it. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    /** After an undo the caret or the chosen stops come back as they were before the edit; else (and after a redo) the stop the change touched first. */
    protected undone(entry: Entry, redo: boolean): undefined;
    /** The Map switch: the map shown or not, and with it whether a trip drawn anywhere (a slide, a page, a card) is on OpenStreetMap's tiles. */
    toggleMap(): void;
    private syncMap;
    private makeMap;
    /**
     * Where I am: the browser asked where the device is, once a tap, and the map centered there at a city's zoom if the map
     * is still this one. Refused, too slow, unknown, or a browser that will not ask: the map goes to the country it opened
     * on (home.ts). The position is never written anywhere.
     */
    locate(): void;
    private dropMap;
    /** Whether a stop is in hand (the caret's) or chosen: its pin is drawn picked. */
    private isSel;
    private selKey;
    /** The pins and the line between them, drawn again. */
    private drawPins;
    /** The line between the stops, in order: a GeoJSON source and a line layer, added once the style has loaded. */
    private drawRoute;
    /**
     * A pin the map has panned out of its own box is out of reach, as it is out of sight: inert, so neither Tab nor a
     * screen reader's swipe finds it (every pin is a tab stop). The pin with the focus keeps it. While the trip is
     * presented every pin is (the map is a show then, and the keys are the show's).
     */
    private hidePins;
    /** The whole route in view. */
    fit(animate?: boolean): undefined;
    /** The map library, once it has loaded (every call that draws comes after the map, which needed it). */
    private ml;
    /** Present: the map the whole screen, flown to the first stop; a click, Space or the right arrow on to the next, Escape ends. */
    present(): Promise<void>;
    /** The `i`th stop, flown to and named (round neither end: the first and the last stay put). */
    goStop(i: number): void;
    endPresenting(): void;
    private onPresentKey;
    private renderPresent;
    /** A stop shown on the map (from the list's bar), or picked on it (a pin: the stop chosen, its row in view). */
    private pick;
    /** The pin with the focus, while its keys are answered (commands.ts). */
    pinAt: number;
    /** A focused pin: the arrows nudge its stop (a burst is one undo), Delete takes it away, Escape gives the focus back to the map. */
    private onPinKey;
    nudgePin(e: KeyboardEvent): boolean;
    leavePin(): void;
    private stopEl;
    private textOf;
    private fieldOf;
    /** A stop's name or note as its editor takes it: the words it holds (a draft kept while it says what the table says). */
    private blocksFor;
    private onOps;
    /** Where a person starts: the first stop's name, the caret at its end, else the map (the page held still). */
    focusFirst(): Promise<void>;
    /** The words of a stop's name or note, once drawn, with the caret at `offset`. */
    private focusField;
    /** Where the caret is in a stop's name or note, or their end. */
    private caretIn;
    /** A stop at a place, after stop `after` (by default the one in hand; null: the route's end). */
    private add;
    /** Enter: from the name to the note; from the note, the next stop, asked for by name (a stop needs a place). */
    private onEnter;
    /**
     * Backspace at the start of words, or Delete at their end (the line says which). A stop with no name and no note
     * goes, the caret to the stop above (Delete: below); Backspace at the start of a note goes back to the name.
     */
    private onExit;
    /** Alt+Up/Down in the words: the stop past its neighbour, the caret where it was. */
    moveOne(i: number, by: -1 | 1, field: Field): void;
    /** Mod+D in the words: the stop again after it, the caret in the copy where it was. */
    duplicateOne(i: number, field: Field): void;
    /** The stop and the field a key is typed in, while the commands answer it (commands.ts). */
    here: {
        i: number;
        field: Field;
    } | null;
    private onKey;
    /** Up and Down in a stop's words: the same field of the stop before or after. */
    stepStop(by: -1 | 1): boolean;
    /** The focus gone from the editor altogether: no stop is in hand. */
    private onFocusOut;
    /** With no stop left to hold the focus, it goes to Insert (never to the page). */
    private leave;
    private rowItems;
    /** Stops taken away (by their places); the caret into the stop before them (or the one after, as it is then). */
    deleteStops(ids: number[]): void;
    private moveRange;
    /** The chosen stops again, right after them; the copies are chosen. */
    private duplicateRange;
    /** A stop carried by its number, put after another; the caret follows it. */
    private dropAfter;
    /** What chosen stops put on the clipboard: a table of them as TLO, and as our HTML (a sheet takes it as a table). */
    private clip;
    /** The places pasted data holds: ours (or plain text) read as TLO, HTML from elsewhere as blocks. */
    private placesOf;
    /** A paste into a stop's words (chosen stops are the rows controller's): places are stops after it; words alone are its own. */
    private onPaste;
    /** Pasted places put in as stops; the caret at the end of the last one's name. */
    private pasteData;
    openSearch(): Promise<void>;
    private search;
    private choose;
    /** Whether the map is drawn (MapLibre loaded and shown). */
    get hasMap(): boolean;
    /** Insert ▾: a place found by name, after the stop in hand. */
    findPlace(): void;
    /** Insert ▾: a stop at the middle of the map, after the stop in hand. */
    addAtMiddle(): void;
    /** The chosen stops' first, shown on the map. */
    showChosen(): void;
    private leg;
    private wordsBox;
    /**
     * A tap on a stop's row outside its words (the leg, the space around the boxes) chooses the stop, as a tap on its number
     * does (Paul, 2026-10-15: "When I click outside of a text area in a location in the map view it should be the same as if I
     * clicked on the location number. Otherwise it's confusing as to how to change or delete a location"): the bar with
     * Delete and the rest comes. The number's own tap is the rows controller's; the words' is the caret's.
     */
    private rowTap;
    private row;
    private findBody;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-trip-editor': ToTripEditor;
    }
}
export {};
