/**
 * A board as a view of the document, and its commands as operations (docs/kernel.md §3). A board
 * is a view of a table (docs/tlo.md, tables with typed headings): its first table, its lanes the distinct values of
 * one column, its cards the rows, each card's title the first column of words and its fields the rest of the row:
 *
 *   ---
 *   lanes: To do, Doing, Done
 *   ---
 *   Title | Status:option | Owner | Due:date
 *   --- | --- | --- | ---
 *   Write the brief | Doing | Ana | 2027-03-01
 *
 * The lane column, by the first rule that finds one: the first column named Status or Stage (in any case), else the
 * first column typed `option`, else the last column. The format has no type of its own for a status (the kernel's
 * types end at `option`), so the name comes first, being what a person or a model writes over such a column and what
 * a sales pipeline calls its stages; `option`, one of the words the column holds, is the type the Spreadsheet gives
 * such a column (a blank board's is typed so, whatever its name in the reader's language); and the last column is
 * where a status sits in most tables pasted from elsewhere. The title is the first column of words (`text` or `rich`)
 * that is not the lane column, else the first other column.
 *
 * The lanes are in the order the head's `lanes:` gives (names between commas, a comma in a name written `\,`), which
 * also keeps a lane no card is in; then any other value in the order the rows first hold it. A row whose lane cell is
 * empty is in a lane of no name, which `lanes:` never holds. Within a lane the cards are in the order of their rows:
 * the table's own order, whatever lanes it interleaves, so a table from the Spreadsheet is a board as it is.
 *
 * How a lane looks beside its cards is the head's `lane-looks:` (`LaneLook`): entries between commas, each a lane's
 * name, `=`, and the look's words, a width (a number of rem, from `LANE_MIN` to `LANE_MAX`; the page's own width is
 * said by nothing), `collapsed` (the lane folded to a strip of its name and its count) and a color (one of the Board's
 * palette, `LANE_COLORS`, or a tone of the page's own), in any order: `lane-looks: Inbound=11, Lost=gray collapsed,
 * Won=green 24`. A width was once a word, and a document written then still reads: `narrow` is 11, `wide` 24 and
 * `normal` the page's own (`LANE_REM`); what is written is the number (Paul, 2026-10-21: a lane shaped by its handles,
 * editor.ts, A lane in hand). A name is escaped
 * as `lanes:` escapes it, and an `=` in it `\=`. A lane with no entry looks as every lane does. `setLaneLook` writes
 * a lane's look whole, `renameLane` carries it to the new name and `removeLane` takes it away, so a look rides with
 * its lane through the kernel's undo and shared editing as `lanes:` does.
 *
 * Every command is pure: given the document, the `Op[]` that does it, through the kernel's operations
 * (src/doc), so undo and shared editing (the kernel's `rebase` and `transform`) work unchanged. A card moved writes its lane cell (`cells`) and, where its place among the
 * lane's cards changes, takes its row out and puts it in again just before the card it now precedes, or just after the
 * lane's last card (`rows`, twice): the rows of other lanes stay where they are, so the order within every lane stays
 * the order of its rows. Where a change would reorder the lanes or lose one (the first row of a lane moved below
 * another lane's, a lane's last card moved out), the lanes as they were are written into `lanes:` first (`head`), so a
 * lane never jumps or vanishes under a person's hand. A formula that points into a row taken out and put in again loses
 * its reference (#REF), as a row cut and pasted does in the Spreadsheet; a board's table seldom holds one. A locked
 * cell (the table's `lock:`) is left as it is, as in the Spreadsheet: a card whose lane cell is locked stays in its
 * lane and its place, and a lane renamed leaves such cards under the old name; where a card in a locked table changes
 * its place, the lock follows the rows as the Spreadsheet's rows moved do (written again after the row is put in,
 * since taking a row out drops its part of the lock). A card added goes after the lane's last card (or before the card
 * at the place asked for; into an empty lane, at the table's end), a lane added or moved is `lanes:` alone, and a lane
 * renamed is its cards' cells and its name in `lanes:`; a card's fields typed in its dialog are its cells.
 *
 * A card's title and fields are read as the Spreadsheet shows their cells (`shownCell`): the table worked out
 * (`evaluateTable`, so a formula is its value), each cell formatted by its column's type (`formatCell`: money in its
 * currency, a date as a date, a number with its commas) and a rich cell as its inline Markdown's words. So a title
 * written "'007", words that would otherwise read as a number, shows 007, and the board on screen, on a page and in
 * words says what the Spreadsheet says. The title is words both ways: what `setTitle`, `addCard` and `pasteCards` are
 * given they write as words of the title column's type (`asWords`: "'007", "'=1+1", a rich column's "\=1+1"), so
 * the title shown after the change is exactly the words given, and a caller never escapes them itself. Where the title
 * column is not one of words (a table of none, whose title falls to its first other column: a number, an amount, a
 * date), the title shown is the value formatted ($120.00), and words given are written as words all the same: 130
 * typed there shows 130, not $130.00, as the Spreadsheet keeps "'130" typed in a money cell.
 *
 * Nothing here touches the DOM, and nothing here speaks a language: the names a board's table is born with (its title
 * column and its status column, where a document has no table yet) are given (`ColumnNames`, English where none are),
 * and so are a blank board's lanes. So the kernel is the one import, and a program under Node builds a board from its
 * own records and moves its cards with this file alone (`tinylittleoffice/board/model`, dist/board-model.js: a CRM's
 * pipeline, its leads the cards and its stages the lanes), while the editor gives the names in the reader's language (def.ts, editor.ts).
 */
import { type CellValue, type Column, type Doc, type Op, type TableBlock } from '../../doc/index.ts';
export interface Field {
    /** Its column. */
    col: number;
    name: string;
    /** The cell as written: a formula, a number, words. */
    raw: string;
    /** The cell as its column shows it, on one line (`shownCell`): a formula's value, money in its currency, a date as a date, a rich cell's words; '' where it shows nothing. */
    shown: string;
    /** The cell worked out (`evaluateTable`): a number for an amount, a date's serial day, a formula's value, words. */
    value: CellValue;
}
export interface Card {
    /** Its row in the table. */
    row: number;
    /** Its lane, by its place in `lanes`. */
    lane: number;
    /** The title as its column shows it, on one line (`shownCell`): the words a person reads on the card and types, and what `setTitle` and `addCard` take ('' where there is none). */
    title: string;
    /** The title's cell as written, on one line: an apostrophe before words that would read as something else ("'007"), a formula as its text ('' where there is none). */
    raw: string;
    /** The rest of the row: every other column but the lane's, in the table's order, empty cells left out. */
    fields: Field[];
    /** The whole row worked out, a value a column (`evaluateTable`): what a table of the same cards shows (`<to-table>`, a host's). */
    values: CellValue[];
}
export interface Lane {
    name: string;
    cards: Card[];
}
/** A lane's width as it was once said, in words: narrow, normal (every lane's, unless said) or wide; read as `LANE_REM` says. */
export type LaneWidth = 'narrow' | 'normal' | 'wide';
/**
 * How a lane looks beside its cards (the head's `lane-looks:`, or a page's `laneLook`): its width, whether it is
 * collapsed to a strip of its name and its count, and its color, one of the Board's palette (`LANE_COLORS`) or a tone
 * of the page's own. A field left out is none: normal, open, no color.
 */
export interface LaneLook {
    /** A number of rem (`laneRem` reads it); a word, from a document or a page of before, is read as `LANE_REM` says. */
    width?: number | LaneWidth;
    collapsed?: boolean;
    color?: string;
}
export interface BoardView {
    /** The table's block index; -1 while the document has none. */
    at: number;
    /** The lane column and the title column; -1 for none. */
    laneCol: number;
    titleCol: number;
    cols: Column[];
    lanes: Lane[];
    /** Every card, lane by lane. */
    cards: Card[];
    /** The lanes' looks by name, from the head's `lane-looks:`; a lane with none looks as every lane does. */
    looks: Record<string, LaneLook>;
}
/** The colors a lane or a card may be given by name, each drawn by the Board's stylesheet; any other word is a tone of the page's own, drawn by its own rules. */
export declare const LANE_COLORS: readonly string[];
/** The words a width was once said in, as rem: what a document or a page written before a width was a number means by them. */
export declare const LANE_REM: Readonly<Record<LaneWidth, number>>;
/** The least width an open lane is drawn at, and the most, in rem. */
export declare const LANE_MIN = 8;
export declare const LANE_MAX = 36;
/** A lane shaped narrower than this (rem) snaps to `LANE_MIN`: there are no widths between. */
export declare const LANE_SNAP = 10;
/** A lane shaped narrower than this (rem) folds to its strip. */
export declare const LANE_FOLD = 5;
/** A width as rem: a number within `LANE_MIN` and `LANE_MAX`, whole; a word as `LANE_REM` says, `normal` none (the page's own); undefined for none or for anything else. */
export declare function laneRem(width: unknown): number | undefined;
/**
 * The look a hand gives a lane drawn `rem` wide by its handle: under `LANE_FOLD` it folds (and opens again at
 * `LANE_MIN`); under `LANE_SNAP`, `LANE_MIN`; else the width, whole, no more than `LANE_MAX`. A folded lane (`folded`)
 * stays folded until it is drawn out past `LANE_MIN`.
 */
export declare function shapedLook(rem: number, folded?: boolean): {
    width: number;
    collapsed: boolean;
};
/** The head's `lanes:` as names: split at commas a backslash does not escape, each trimmed, empty and repeated ones left out. */
export declare function lanesOf(value: string | undefined): string[];
/** Names as `lanes:` writes them: a comma in a name escaped; undefined (the key taken away) for none. */
export declare const lanesText: (names: string[]) => string | undefined;
/** Whether a look says nothing: the page's width, open, no color. */
export declare const plainLook: (look: LaneLook | null | undefined) => boolean;
/** The head's `lane-looks:` as looks by lane name: entries between commas, each a name, `=` and the look's words; a plain look, a repeated name and an entry with no `=` are left out. */
export declare function laneLooksOf(value: string | undefined): Record<string, LaneLook>;
/** Looks as `lane-looks:` writes them: each lane's name (a comma, an equals sign or a backslash in it escaped), `=`, the look's words; undefined (the key taken away) for none. */
export declare function laneLooksText(looks: Record<string, LaneLook>): string | undefined;
/** The board a document is: its first table read as lanes and cards; a document with none is an empty board, with the head's lanes. */
export declare function boardOf(doc: Doc): BoardView;
/** What a board's table is born with, named: its title column and its status column, in the reader's language. */
export interface ColumnNames {
    title: string;
    status: string;
}
/** The names where none are given: a program's, which speaks no language of a reader's. */
export declare const ENGLISH_NAMES: ColumnNames;
/** A new board's lanes where none are given. */
export declare const ENGLISH_LANES: readonly string[];
/** The columns a board's table is born with: its title (words) and its status (`option`, whatever it is called). */
export declare const boardColumns: (names?: ColumnNames) => Column[];
/**
 * A board as a document, from a host's own records: these lanes in this order in the head's `lanes:` (an empty lane
 * kept), a table of these columns, a row for each card, its cells in the columns' order, and, given, the lanes' looks
 * by name in `lane-looks:` (a stage's color, a lane folded). The kernel writes it (`write`), so it is canonical;
 * boardOf reads it back.
 */
export declare function boardDoc(lanes: readonly string[], cols: readonly Column[], rows?: readonly (readonly string[])[], looks?: Record<string, LaneLook>): Doc;
/** A new board, as text: these lanes (To do, Doing and Done unless given), a table of these columns (a title and a status) to hold its cards, and no card. */
export declare const blankBoard: (lanes?: readonly string[], cols?: readonly Column[]) => string;
/**
 * A card in lane `lane` titled `title`, at place `at` among its cards (the end when not given); the table's birth, with
 * a title and a status named `names`, when the document has none. The title is words, written as its column writes
 * words (`asWords`), so the card shows it as given: "007" is written "'007" in a column of words.
 */
export declare function addCard(doc: Doc, lane: string, title?: string, at?: number, names?: ColumnNames): Op[];
/** The card on row `row` into lane `lane` (by name: a new one is made after the rest), at place `to` among that lane's other cards. Nothing when its lane cell is locked, or where it already is. */
export declare function moveCard(doc: Doc, row: number, lane: string, to: number): Op[];
/** The card on row `row` taken away; its lane stays, empty. */
export declare function removeCard(doc: Doc, row: number): Op[];
/** Cards taken away, by their rows: from the last up, so each index holds; their lanes stay. */
export declare function removeCards(doc: Doc, rows: number[]): Op[];
/** Cards again, by their rows: copies in the same order, put in together after the last of them. */
export declare function duplicateCards(doc: Doc, rows: number[]): Op[];
/** Cards, by their rows, into lane `lane` at place `to` among its other cards, in the board's order: a move each, each after the last. */
export declare function moveCards(doc: Doc, rows: number[], lane: string, to: number): Op[];
/**
 * The ops that take a move back as a move: `ops`, a card's move or chosen cards' (`moveCard`, `moveCards`) made on
 * `doc`, undone as moves are made, so a host that reads only moves reads its undo too (a board carried only, editor.ts).
 * Each card's status cell is written as it was (`cells`) and its row taken out and put in again where it was (`rows`,
 * twice, the row as it then is); `lanes:` goes back as it was (`head`), and where the table keeps a lock the lock is
 * written again as it was after the rows, as `moveCard` writes it. The kernel's own inverse (`invertAll`) puts a table
 * whose rows moved back whole (a `splice`), so that a formula a row taken out left at #REF comes home: here it stays as
 * the move left it, as a row cut and pasted back in the Spreadsheet. An op that is no move's is the kernel's to invert.
 */
export declare function moveBack(doc: Doc, ops: Op[]): Op[];
/**
 * A card's title as typed: words, written as the title column writes words (`asWords`), so the title shown after it is
 * the words typed ("007" written "'007", "=1+1" "'=1+1", never a formula); nothing where it already shows them. A table
 * with no title column gets one, at the start, named `names.title`.
 */
export declare function setTitle(doc: Doc, row: number, title: string, names?: ColumnNames): Op[];
/**
 * A card's cells as its dialog gives them, by column: a `cells` op for each that changed, the words on one line (the
 * title's spaces as `setTitle` keeps them). The lane's cell is left to `moveCard` (a lane changed is a card moved),
 * and a locked cell stays as it is (the operation's own rule, as in the Spreadsheet).
 */
export declare function setCells(doc: Doc, row: number, values: Record<number, string>): Op[];
/** Lane `from` called `to`: its cards' cells, and its name in `lanes:`. A name another lane has joins the two; an empty name changes nothing. */
export declare function renameLane(doc: Doc, from: string, to: string): Op[];
/**
 * Lane `name`'s look as given, whole (a field left out is none: a width normal, the lane open, no color), in the
 * head's `lane-looks:`; null, or a plain look, takes its entry away. Nothing where the board has no such lane, or the
 * look is what it has.
 */
export declare function setLaneLook(doc: Doc, name: string, look: LaneLook | null): Op[];
/** A lane of no cards called `name`, at place `at` among the lanes (the end when not given): `lanes:` alone. */
export declare function addLane(doc: Doc, name: string, at?: number): Op[];
/** Lane `name` moved to place `to` among the lanes: `lanes:` alone. */
export declare function moveLane(doc: Doc, name: string, to: number): Op[];
/** Lane `name` taken away with its cards; the other lanes stay as they were. */
export declare function removeLane(doc: Doc, name: string): Op[];
/**
 * Cards pasted into lane `lane` at place `at` among its cards: the rows of the first table pasted, their cells put in
 * the board's columns by name, as they are written (the title by the pasted table's own title column where no name
 * matches: its words as that table shows them, written as words), or a card a line of words, written as words; into a
 * document with no table, a table born with a title and a status named `names`. Says how many there are.
 */
export declare function pasteCards(doc: Doc, lane: string, at: number, text: string, names?: ColumnNames): {
    ops: Op[];
    n: number;
};
/** Some cards as a table of their own (the clipboard's): the board's columns, their rows. */
export declare function cardsTable(doc: Doc, rows: number[]): TableBlock;
/**
 * How a card shows one of its fields: `line`, the line under the title (a deal's company, a task's project), one card
 * holds one; `money`, an amount, set apart and summed under its lane's name; `date`, a day, short; `person`, someone
 * (an owner, an author), their initials in a round mark, the name said on hover and to a screen reader; `badge`, a
 * small chip (a choice, a count, a box ticked); `text`, a quiet name and value. The editor draws them (editor.ts);
 * here they are only named, so a host's server and its page say the same.
 */
export type CardFieldAs = 'line' | 'text' | 'money' | 'date' | 'person' | 'badge';
/** A field a card shows: its column, by name (any case) or by place, and how (by its column's type where not said). */
export interface CardField {
    column: string | number;
    as?: CardFieldAs;
}
/** A field resolved: its column's place in the table, and how it is shown. */
export interface ShownField {
    col: number;
    as: CardFieldAs;
}
/** How many fields a card shows where the host says nothing, beside its line: enough to tell a card, few enough to scan. */
export declare const CARD_FIELDS = 4;
/** How a column is shown on a card where the host does not say: by its type, a person by its name. */
export declare function fieldAs(col: Column): CardFieldAs;
/**
 * The fields a card shows, and how: the host's (`given`: columns by name or place, in its order; a column named that
 * the table lacks, the lane's and the title's left out, a second `line` shown as text), else the defaults from the
 * columns' types: the first column of words that holds no person is the line under the title, then the others, up to
 * CARD_FIELDS, as their types say (`fieldAs`). A host that gives an empty list shows the title alone.
 */
export declare function cardFieldsOf(v: Pick<BoardView, 'cols' | 'laneCol' | 'titleCol'>, given?: readonly CardField[] | null): ShownField[];
/** The first column of money, whose amounts a lane sums under its name; -1 for none. */
export declare const moneyColumn: (v: Pick<BoardView, 'cols' | 'laneCol' | 'titleCol'>) => number;
/** Lane `lane`'s cards' amounts in column `col`, added up: each card's value worked out (a formula's too), a cell that is no number left out. */
export declare function laneSum(v: BoardView, lane: number, col: number): number;
/**
 * One cell as a table of the same cards changes it (a host's `<to-table>` beside the board, its `rowchange`): the
 * lane's cell is the card moved to the end of that lane (`moveCard`, a new lane made after the rest), the title's is
 * words (`setTitle`), any other its cell as written (`setCells`). Nothing where nothing changes.
 */
export declare function setCell(doc: Doc, row: number, col: number, value: string, names?: ColumnNames): Op[];
