import { type Block, type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { Rows } from '../../kit/text/rows.ts';
import { type PropertyDeclarations, type PropertyValues, type TemplateResult } from 'lit';
import { type BoardView, type Card, type CardField, type Lane, type LaneLook } from './model.ts';
import '../../kit/text/text.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/context.ts';
import '../../kit/ui/dialog.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import './style.css';
export declare const tag = "to-board-editor";
/** What a "docpick" says of a card picked: the table's block, and the card's row in it. */
export type PickedCard = {
    at: number;
    row: number;
};
/**
 * What a change to a lane says before it is made, each a bubbling, cancelable event of the board's: "lanerename" a
 * lane's name `from` to `to`; "laneadd" a lane `name` at place `at` among the lanes; "lanemove" lane `name` from place
 * `from` to place `to`; "lanedelete" lane `name` and the `cards` it takes with it. A page that refuses it, or makes it
 * itself, calls `preventDefault()`.
 */
/** What kind a lane is, as a page says it (`laneTone`): won, lost, neutral, or a kind of the page's own, drawn by its own rules on `data-tone`. */
export type LaneTone = 'won' | 'lost' | 'neutral' | (string & {});
/** How a card looks beyond its fields, as a page says it (`cardLook`): its tone, one of the Board's palette (model.ts `LANE_COLORS`) or the page's own, drawn as `data-tone` on the card. */
export interface CardLook {
    tone?: string | null;
}
export interface LaneEvents {
    lanerename: {
        from: string;
        to: string;
    };
    laneadd: {
        name: string;
        at: number;
    };
    lanemove: {
        name: string;
        from: number;
        to: number;
    };
    lanedelete: {
        name: string;
        cards: number;
    };
    /** Lane `name`'s look changed in hand (its handles, its dots), from a command, or its strip tapped open: the look it would then have, whole (a field left out is none), its width a number of rem. */
    lanelook: {
        name: string;
        look: LaneLook;
    };
}
export type LaneEvent<K extends keyof LaneEvents = keyof LaneEvents> = CustomEvent<LaneEvents[K]>;
/** Where a carried card would land: lane `lane`, at place `pos` among its other cards. */
interface Over {
    lane: number;
    pos: number;
}
/**
 * A card opened in its dialog: its row, its cells as shown and typed (by column), the columns the person touched (the
 * lane's when a lane is chosen), the lane chosen, a rich cell's words as typed, and where the focus goes back to (the
 * card chosen, or its title's caret). Done writes the touched columns alone, so an edit from elsewhere to a field
 * nobody touched here, synced while the dialog was open, is not put back.
 */
interface Opened {
    row: number;
    values: Record<number, string>;
    touched: Set<number>;
    lane: string;
    rich: Map<number, Block>;
    back: 'rows' | number | 'end';
}
export declare class ToBoardEditor extends DocElement<BoardView> {
    static properties: PropertyDeclarations;
    /** A card activated is picked ("docpick", as read-only) while the board can still be changed: the page asks for it (the attribute `pickable`). */
    pickable: boolean;
    /** Its cards carried among the lanes and nothing else changed (the attribute `carry-only`): the header's last paragraph. */
    carryOnly: boolean;
    /** The page makes every change to a lane itself (the attribute `own-lanes`): the board tells them (LaneEvents) and makes none. */
    ownLanes: boolean;
    /**
     * Which fields a card shows, and how (model.ts `CardField`: a column by name or place, `as` line, text, money, date,
     * person or badge), in this order; null (the default) for the columns' types to say (`cardFieldsOf`), [] for the title alone.
     */
    cardFields: CardField[] | null;
    /** What kind each lane is, by its name (a stage won, lost): drawn by the board as the lane's tone; null for none. */
    laneTone: ((name: string) => LaneTone | null | undefined) | null;
    /** How each lane looks, by its name (model.ts `LaneLook`: its width, collapsed, its color), over the document's `lane-looks:` field by field; null for the document's alone. */
    laneLook: ((name: string) => LaneLook | null | undefined) | null;
    /** How each card looks beyond its fields (`CardLook`: its tone), drawn as `data-tone` on the card; null for none. */
    cardLook: ((card: Card) => CardLook | null | undefined) | null;
    /** The lane being carried by a drag of its head, by its place; -1 for none. */
    carryingLane: number;
    /** Where the carried lane would land: its place among the other named lanes; null for none. */
    overLane: number | null;
    /** The card a finger or a pen holds, lifted, ready to be carried, by its row; -1 for none. */
    lifting: number;
    /** The lane whose name is a field, being renamed, by its place; -1 for none. */
    renaming: number;
    /** Why the name typed was refused, said under it; '' for nothing. */
    laneError: string;
    /** The lane whose name was refused, where `laneError` is said. */
    private errorAt;
    /** The card in hand (the caret's), by its row; -1 for none. */
    cur: number;
    /** The lane in hand (the caret's, in its name or a card), by its place; -1 for none. */
    curLane: number;
    /** The card being carried by a drag, by its row; -1 for none. */
    carrying: number;
    over: Over | null;
    /** The lane in hand, being shaped (A lane in hand), by its name; '' for none. */
    inHand: string;
    /** The width and the fold a handle's drag gives the lane in hand as it moves, made when it is let go; null for none. */
    shaped: {
        width: number;
        collapsed: boolean;
    } | null;
    /** The handle being dragged: its pointer, its lane's edge, where it was pressed and the lane's width then, in rem. */
    private grip;
    /** The card whose dialog is open; null for none. */
    opened: Opened | null;
    private readonly uid;
    /** Where the card the dialog's Done moved landed, for the focus to follow it. */
    private landed;
    /** The ghost of a carried card, under the pointer (on the page's body, as the rows' drop line is). */
    private ghost;
    /** A card's title or a lane's name as its editor holds it (a space typed at the end the table does not keep; a name not yet kept). */
    private drafts;
    private ones;
    private press;
    /** A finger's last tap on a lane's name: which lane, where and when, for a double tap. */
    private tapped;
    private point;
    private scrolling;
    /** A drag just ended, or a hold chose the card: the click that follows it is not a tap. */
    private dragged;
    /**
     * Carried only, the board's own history, of moves alone: the moves made, to be taken back (Mod+Z), each as the move
     * that takes it back (model.ts `moveBack`), and those taken back, to be made again. DocElement's history still hears
     * every move and every move taken back, and is the board's again when it is no longer carried only.
     */
    private backs;
    private agains;
    /** Cards chosen whole: the kit's one implementation (keys, the bar under them, the clipboard). A card's drag is the board's own, across lanes. */
    readonly rows: Rows<number>;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected read(doc: Doc): BoardView;
    private mark;
    /** Every edit carries where the selection was before it. Carried only, it writes nothing: a card's move is `moved`. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    /** A card's move, or chosen cards' (model.ts `moveCard`, `moveCards`): the one edit a board carried only writes, and the one it takes back. */
    private moved;
    protected willUpdate(changed: PropertyValues): void;
    /**
     * Carried only, an undo takes the last move back as a move and a redo makes it again, from the board's own history of
     * moves (`backs`, `agains`), before DocElement hears it: what was done before the board was carried only is out of
     * reach, and nothing but a move is ever told. The caret or the chosen cards come back as they were before the move
     * (`undone`); after a redo, the card it carried has the caret.
     */
    private onHistory;
    /** Another's ops taken in (`applyRemote`): the moves' history carried over them, as DocElement carries its own; let go where they cross. */
    protected followed(ops: Op[]): void;
    /**
     * Carried only, a thing typed, pasted, cut or dropped into the board (its dialog too) is refused before anything hears
     * it, and so is a cut or a paste while cards are chosen and the focus is on the page's body, which the rows controller
     * would take as theirs.
     */
    private onUnchanged;
    /** Carried only, Delete or Backspace on chosen cards takes nothing away, and they stay chosen, the bar under them up. */
    private onKept;
    /** After an undo the caret or the chosen cards come back as they were before the edit; else (and after a redo) the card the change touched first. */
    protected undone(entry: Entry, redo: boolean): undefined;
    cardAt(row: number): Card | undefined;
    private laneOf;
    /** A card's place among its lane's cards. */
    private placeOf;
    private titleBox;
    /** Where the caret is in a card's title, or its end. */
    private caretIn;
    /** A card's title as its editor takes it: the words it holds (a draft kept while it says what the card shows, the words shown compared, never the cell as written). */
    private titleBlocks;
    /** A lane's name as its editor takes it: the name being typed, kept apart from the document until it is done. */
    private laneBlocks;
    private one;
    /** Where a person starts: the first card's title, the caret at its end; else the first lane's name (the page held still). */
    focusFirst(): Promise<void>;
    /** A card's title, once drawn, with the caret at `offset`. */
    focusTitle(row: number, offset?: number | 'end', show?: boolean): Promise<void>;
    /** A lane's name, once drawn, focused: shown (a heading the keys rename), or a field with its words chosen whole to type over (`rename`). */
    focusLane(i: number, rename?: boolean, show?: boolean): Promise<void>;
    private onTitleOps;
    /** Enter in a title: at its end the next card, at its start a card above it, in the middle the card split there. */
    private onEnter;
    /**
     * Backspace at the start of a title, or Delete at its end (the line says which). Backspace takes an empty card away
     * (the caret to the card before, else the one after, else the lane's name), else joins the card to the one before;
     * Delete joins the next card in. A card is joined into another only when it has no fields to lose.
     */
    private onExit;
    /** The card a key is typed in, while the commands answer it. */
    here: Card | null;
    private onKey;
    /** Which way an arrow key goes among the lanes as the screen shows them: -1 the lane before, 1 the lane after (right to left, the lane before is on the right). */
    sideOf(key: string): -1 | 1;
    /**
     * Left at a title's start, Right at its end (toward the lane before, toward the lane after: the words run the same
     * way as the lanes): the card at the same place in that lane (its last where it holds fewer), else that lane's name.
     * Elsewhere in the words the arrow is the caret's.
     */
    besideCard(c: Card, side: -1 | 1): boolean;
    /** Up and Down in a title: the card before or after in its lane, the caret where it was. */
    stepCard(c: Card, by: -1 | 1): boolean;
    /** Alt+Up/Down: the card past its neighbor in its lane, the caret where it was. */
    moveOne(c: Card, by: -1 | 1): boolean;
    /** Mod+Alt+Left/Right: the card to the end of the lane before or after, the caret where it was. */
    carryOne(c: Card, side: -1 | 1): boolean;
    /** Mod+D: the card again after it, the caret in the copy where it was. */
    duplicateOne(c: Card): boolean;
    /** Card `c` into lane `lane` at place `pos` among its other cards; the caret goes with it. */
    private carry;
    /** Whether a page hears a lane's change and lets the board make it: told first (LaneEvents), made unless refused, or where the page makes them all (`own-lanes`) or the board is carried only. */
    private tell;
    /** Whether a lane's name may be changed here: not read-only, and not carried only unless the page makes the lanes' changes. */
    get lanesChange(): boolean;
    private onLaneOps;
    /**
     * Rename lane: lane `i`'s name (its place among the lanes), where it is drawn, a field, its words chosen to type over,
     * as a double click on it does; for a page's own control too. Nothing where the lanes may not be changed.
     */
    startRename(i: number): void;
    /**
     * A lane's name as typed, kept (Enter, the focus leaving it): told first ("lanerename"), then its cards' cells and
     * `lanes:` (model.ts `renameLane`). A name that is empty or another lane's is refused and said; the name stays a field
     * (`stay`, Enter's) or goes back as it was (the focus leaving). True where the name is done with.
     */
    private keepLane;
    /** Escape in a lane's name being renamed: what was there comes back, the name shown and focused. */
    private resetLane;
    /** Enter in a lane's name being renamed: kept, and the name shown and focused again, wherever the lane now is; refused, it stays a field. */
    private laneEnter;
    /** The keys on a lane's name shown: Enter or F2 rename it, Down goes to its first card. */
    private laneKey;
    /** A finger's or a pen's tap on a lane's name: a second one near the first, soon after it, renames the lane (a double tap). */
    private laneTap;
    /** How a lane is renamed on this device, said on its name: a double click, or under a finger a double tap. */
    private renameHint;
    private onFocusOut;
    /** Insert ▾ Card: an empty card after the one in hand (the last chosen, or the caret's), else at the end of the lane in hand or the first. */
    insertCard(): void;
    /** An empty card at the end of lane `name`, its title focused. */
    addToLane(name: string): void;
    /**
     * Insert ▾ Lane: a lane after the one in hand (else at the end), named "New lane" (made unique), its name chosen to
     * type over; Add lane, after the last lane, `atEnd`. Told first ("laneadd"); made unless the page makes it.
     */
    insertLane(atEnd?: boolean): void;
    /** Rename lane: the lane in hand's name (else the caret's lane's) a field, the lane in hand. */
    renameHandLane(): void;
    /** The hand-off: the same table, opened in the Spreadsheet in a tab of its own, where the page says documents open. */
    openInSheet(): void;
    /** The place of the lane in hand; -1 for none. */
    get shaping(): number;
    /** Where a lane's own command acts: the lane in hand, else the lane the caret is in (its name or a card); -1 for none. */
    get handAt(): number;
    /** The lane a lane's own command acts on (`handAt`). */
    get handLane(): Lane | undefined;
    laneCanMove(by: -1 | 1): boolean;
    /** Move left, Move right: the lane a place along, told first ("lanemove"); in hand, it stays in hand where it goes. */
    moveHandLane(by: -1 | 1): void;
    /** A lane's look: the page's answer (`laneLook`) over the document's `lane-looks:`, field by field, its width as rem (a word of before read as model.ts `laneRem` reads it); plain where neither says. */
    lookOf(l: Lane): LaneLook;
    /** A lane's tone, drawn as `data-tone`: the page's kind (`laneTone`) where it says one, else the look's color. */
    private toneOf;
    /** The look of the lane a lane's own command acts on (`handLane`); plain where there is none. */
    handLook(): LaneLook;
    /** The width of the lane a lane's own command acts on, in rem (`widthOf`). */
    handWidth(): number;
    /** Lane `i`'s width in rem: its look's, else as it is drawn (the page's width), else the normal 17. */
    private widthOf;
    /** Narrow lane, Widen lane: the lane a step narrower or wider (`resize`). */
    sizeHandLane(by: -1 | 1): void;
    /**
     * Lane `i` `by` rem wider (narrower where it is less than 0), as the keys and the commands change it: no narrower
     * than the least (a width under the snap is the least, and from the least a step wider is the snap), no wider than the
     * most; a folded lane is opened at the least by a step wider, and is never folded by one narrower.
     */
    private resize;
    /** Collapse lane, Expand lane: the lane a strip of its name and its count, or open again. */
    foldHandLane(): void;
    /** Lane color…: the lane put in hand, the focus on its dot of the color it has, the dots its colors. */
    colorHandLane(): Promise<void>;
    /**
     * Lane `i`'s look changed by `change` (its fields over the look it has; a width of none or `normal`, collapsed false or
     * a color '' takes that away): told first ("lanelook", the look it would then have, whole, its width a number of rem),
     * then written into the head's `lane-looks:` (model.ts `setLaneLook`), unless the page refuses it or makes it itself.
     */
    setLook(i: number, change: LaneLook): void;
    deleteHandLane(): void;
    /** Lane `i` put in hand (`data-shaping`): its handles, its dots and its buttons drawn, and any other lane let go. Nothing where the lanes may not be changed, or for the lane of no name. */
    shape(i: number): void;
    /** The lane in hand let go. Its every change was made as it came, so this ends the shaping and saves nothing. */
    unshape(): void;
    /** Whether `el` is the lane in hand's own: its head, its handles, what is said under its name; not its cards. */
    private inHandHas;
    /** A press or the focus anywhere outside the lane in hand (the page, another lane, a card) lets it go. */
    private onAway;
    /** Escape lets the lane in hand go, unless its name is a field (whose Escape puts the name back) or a handle is being dragged (whose Escape puts the width back). */
    private onHandKey;
    /** A double click on a lane's head puts it in hand; on its name, it renames it too. Not on its buttons, its dots or its handles, nor on its name while that is a field. */
    private headDouble;
    /** A finger's or a pen's tap on a lane's head puts it in hand (a press that carried the lane is no tap). */
    private headTap;
    /** Which way a pointer moving right takes an edge outward: right at the end and left at the start, mirrored where the language runs right to left. */
    private outward;
    /** A handle pressed: the pointer the handle's until it is let go, the lane's width then (a folded lane's its strip's). */
    private gripDown;
    /** A handle dragged: the lane drawn as wide as the pointer makes it, snapped to the least, folded under the fold (model.ts `shapedLook`). */
    private gripMove;
    /** A handle let go: the width (and the fold) it gave the lane made, as any look is (`setLook`). */
    private gripUp;
    /** A handle's keys: Left and Right a rem narrower or wider, as the edge moves on the screen. */
    private gripKey;
    /** The cards on screen as the rows controller takes them, lane by lane: each its row's id and its place in that order. */
    private rowItems;
    /** Chosen cards, in the board's order. */
    private chosenCards;
    /** The lane beside the chosen cards (all in one lane), where Move to the lane before or after takes them. */
    chosenLane(by: -1 | 1): Lane | undefined;
    /** The card the chosen ones end at (the range's focus), which Open opens. */
    chosenOne(): Card | undefined;
    /** Mod+Left/Right: the chosen cards carried to the end of the lane beside; they stay chosen. */
    carryChosen(by: -1 | 1): void;
    /** Move to…: a menu of the lanes beside the bar under the chosen cards, the lane they are in checked. */
    moveToMenu(): Promise<void>;
    /** The lanes, for Move to…: the one every chosen card is in checked, and not to be chosen. */
    private moveToItems;
    /** The chosen cards carried to the end of lane `i`, in the board's order; they stay chosen. */
    private carryTo;
    /** Chosen cards [from, to) of one lane, past the card before or after them: that card moved to their other side. */
    private runMove;
    private moveRun;
    /** The chosen cards again, after the last of them; the copies are chosen when they are of one lane. */
    private duplicateRun;
    /** Cards taken away; the caret into the card before the first of them in its lane (or after, or the lane's name). */
    deleteCards(rows: number[]): void;
    /** Alt+Enter, Open, a double click: the card's every cell a field of a dialog, the first field focused (carried only, the lane's). */
    openCard(row: number): boolean;
    /** A field typed: kept in the draft, and the column marked as touched; nothing written until Done. */
    private put;
    /** A rich cell's words typed (as the Spreadsheet's rich cells: the marks kept, written as the cell's inline words). */
    private onRichOps;
    private richBlock;
    /** Done: the cells typed and the lane chosen, those alone, one step (the card moved to the end of a new lane); carried only, the lane alone. */
    private doneCard;
    /** The dialog's Delete: the card taken away (one step), the caret to the card before it. */
    deleteOpened(): void;
    /** The dialog closed (Done, Delete, Cancel, Escape, the backdrop): the focus back on the card, chosen or in its title, wherever it now is. */
    private onDialogClose;
    /** Enter in a field (not a list's), and Mod+Enter anywhere in the dialog, is Done. */
    private formKey;
    /** A cell as a field: the lane a list of the lanes; a checkbox a box; a rich cell its words; the rest a line that asks for the keyboard its column does, an option column's offering the words it holds. */
    private field;
    private renderDialog;
    /** What chosen cards put on the clipboard: a table of them (the board's columns) as TLO, and as our HTML (a sheet takes it as a table). */
    private clip;
    /** Pasted cards: in place of the chosen ones (into the lane of the first), else after the card in hand, else at the end of the first lane. */
    private pasteData;
    /** A paste into a card's title (chosen cards are the rows controller's): cards copied here, a table or several lines are cards after it; words alone are its own. */
    private onPaste;
    /** Words being typed where `el` is: an editable title or name with the focus, whose press is the words' own (a caret, a selection). */
    private typing;
    /** The lanes with a name, as `lanes:` holds them: the places "lanemove" and `moveLane` count. */
    private namedLanes;
    /** Whether lane `i` may be carried by its head: the lanes may be changed, it has a name, and there is another to pass. */
    private laneCarries;
    /**
     * A press on a card, outside its controls and outside words being typed: it may carry the card (`move`), or be a
     * click (`cardTap`). A press on a lane's head, outside its buttons, its dots and its name while that is a field: it
     * may carry the lane, where lanes may be changed. A lane's handles are their own (`gripDown`).
     */
    private down;
    /** A mouse's press on a card, or on a lane's head, is the board's: no caret and no words selected under it, so it can carry them (a click puts the caret where it was, `cardTap`). */
    private onMouseDown;
    /** A finger that may carry a card does not scroll the page, nor bring up the browser's menu. */
    private onTouchMove;
    private onContextMenu;
    private move;
    /** A lane's drag begins: the lane dimmed where it is, a ghost of its head under the pointer, the pointer the board's until it is let go. */
    private carryLaneFrom;
    /**
     * Where the carried lane would land: its place among the other named lanes, counting those whose middle the pointer
     * has passed, along the lanes' own line (sideways where they stand side by side, the lane before on the right where
     * the language runs that way; down the column where they are stacked).
     */
    private aimLane;
    /** How lane `i` is marked while a lane is carried: the rule before it where the carried lane would land, after it where that is past the last; nothing elsewhere. */
    private dropAt;
    /** The drag begins: the card lifted from its place (a slot its size there), a ghost of it under the pointer, the pointer the board's until it is let go. */
    private carryFrom;
    /** The carried card's height, which the slot where it would land takes. */
    private slotHeight;
    /** The ghost: the carried card's face, as wide as the card, held where the pointer took it (x, y), following the pointer. */
    private lift;
    private ghostAt;
    private follow;
    /** Where the carried card would land: the lane under the pointer, before the first of its other cards whose middle is below it; between lanes, where it was last. A carried lane, `aimLane`. */
    private aim;
    /**
     * Near an edge of what scrolls, it scrolls to bring more of the board under the pointer, the faster the nearer: the
     * column (or the page) up and down, the board's lanes sideways where they are wider than it, and a lane's cards where
     * a page gives a lane a height of its own (`--to-board-lane-h`).
     */
    private edges;
    private up;
    /** The carried lane let go at place `to` among the other named lanes: told first ("lanemove"), then moved (model.ts `moveLane`); nothing where it is let go where it was. */
    private dropLane;
    private stop;
    private onEscape;
    /** The click a drag, or a finger's hold, ends with is not a tap: nothing picks, chooses or puts a caret on it. */
    private onClickAfter;
    /** A card activated is picked (DocElement's "docpick", read-only; `onPickCard`, pickable): the table's block, and the card's row in it. */
    protected pickOf(el: Element): PickedCard | null;
    /**
     * Pickable, a card activated while the board can be changed is picked as a read-only board's is: a bubbling "docpick"
     * with `{ at, row }`. A click or a tap on the card (not one a drag ends with: `onClickAfter`), and never in
     * words being typed (a title where titles are typed in: a click there is the caret's, and Enter makes a card); Enter
     * on a title that is shown and not typed in; and Enter on cards chosen whole (Escape in a title chooses its card), the focus then on the board: the card they end at, the one Open opens. So a board whose
     * titles are typed is picked from the keys too. Read-only, the pick is DocElement's own.
     */
    private onPickCard;
    /**
     * A click or a tap on a card: on its title, where titles are typed, the caret where it was (the mouse's press having
     * been the board's, `onMouseDown`); anywhere else on it (its fields, the room round them, a title shown and not
     * typed) the card chosen, Shift extending. Pickable, it is a pick, heard first (`onPickCard`).
     */
    private cardTap;
    /** The place in a title's words under a point; their end where none is. */
    private offsetAt;
    /** The fields cards show, and how, for the board as it is and the page's `cardFields`: worked out once a drawing. */
    private shown;
    private shownFields;
    /** A column's currency: its own, else the document's, else dollars. */
    private currencyOf;
    /** One field on a card's face, drawn as it is shown (model.ts `CardFieldAs`); its column's name said to a screen reader where the face leaves it out. */
    private chip;
    /**
     * A card's face under its title: the line (a deal's company), the quiet names and values, then the row of its
     * amount, its day and its chips, the people at its end. The editor's cards and the ghost a drag carries are this.
     */
    private face;
    private card;
    /** Where the carried card would land in lane `i`, as a slot its height among the lane's cards: the place before which other card, or the end; -1 for none here. */
    private slotIn;
    private lane;
    /** One of the lane in hand's handles, at its start or its end: a separator a pointer drags and the arrow keys move, its width in rem its value (none while it is folded). */
    private handle;
    /** The lane in hand's dots, along the top of its head: no color, then each of the palette's, the lane's own ringed (pressed); a tap colors the lane. */
    private dots;
    /** The lane in hand's buttons, where a lane had its menu: Move left, Move right, Add a card (where cards are added) and Delete lane, each its command (commands.ts). */
    private handTools;
    /**
     * Carried only, the bar under chosen cards (the rows controller's, which shows it): what carries them, Move up, Move
     * down, Open (its lane alone) and Move to…, and Copy, which changes nothing; never Edit, Duplicate, Cut, Paste or Delete.
     */
    private carriedContext;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-board-editor': ToBoardEditor;
    }
}
export {};
