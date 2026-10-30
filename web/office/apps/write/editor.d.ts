/**
 * <to-write-editor>: the Write app. One bar (Insert ▾, the kinds of block, the marks, link, footnote, icon,
 * lists, indent, align, the look (the type it is set in, look.ts), paper, undo and redo) over one <to-text shape=doc> that owns the whole document's
 * blocks and is drawn as paper. The editor's ops are applied here with the kernel, recorded in the op-log
 * history (src/kit/text/history.ts) and written back to the shell as TLO in "docchange"; the title the shell
 * edits is a head field, and comes back as a `head` op in the history like any other.
 *
 * What is not words is a card the editor asks this host to draw: a table block as a grid whose cells are
 * `cells` ops, worked out in place by the formula engine; another document as a picture of its first page;
 * a page break (the kernel's `hr`, from Insert ▾ or Mod+Shift+Enter) as a thin dashed rule with its name in
 * the middle; a horizontal rule (that `hr` marked `{.rule}`, from Insert ▾ or `---` and Space) as a light
 * line with a little room above and below. The document's own head fields (an invoice's from and to) are
 * inputs over the text; the footnotes are listed under it (<to-notes>, kit/draw/notes.ts), each note's words
 * typed there, where they are drawn (a mark tapped, or a new footnote, puts the caret in its note; Enter,
 * Escape or ↩ come back to the mark), and the words are counted at the foot.
 *
 * A card is a thing in hand when it has the focus (a tap, Tab, the table's corner handle, Escape from a
 * cell): the bar under it is Edit, Move up, Move down, Duplicate | Copy, Cut, Paste | Delete (§6's order),
 * and the keys are the same (Enter, Alt+Up/Down, Mod+D, Mod+C/X/V, Delete; Escape or an arrow back to the
 * words). Undo is DocElement's: each edit carries a mark of where the caret, the cell or the card was, and
 * an undo puts it back.

 */
import { type PropertyDeclarations, type PropertyValues, type TemplateResult } from 'lit';
import { type Align, type Block, type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { type ToNotes } from '../../kit/draw/notes.ts';
import { type Sel } from '../../kit/text/textops.ts';
import type { ToText } from '../../kit/text/text.ts';
import { type Paper } from './model.ts';
import { type LookId } from './look.ts';
import '../../kit/ui/locked-doc.ts';
import type { ToWriteTable } from './table.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/context.ts';
import '../../kit/ui/doc-dialog.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/draw/notes.ts';
import '../../kit/text/text.ts';
import './table.ts';
import './style.css';
export declare const tag = "to-write-editor";
export declare class ToWriteEditor extends DocElement<Doc> {
    static properties: PropertyDeclarations;
    /** The card in hand (it has the focus): its block; -1 for none. */
    cardAt: number;
    /** The picture whose words are a field, being described where it is drawn (its card's Edit); -1 for none. */
    describing: number;
    /** The selection the editor last reported, for the bar's pressed states. */
    sel: Sel | null;
    /** The last edit's key, time and mark, so a burst's mark says where it ended (for a redo). */
    private last;
    /** The card last copied here, for a paste when the system clipboard is refused. */
    private clip;
    constructor();
    protected read(doc: Doc): Doc;
    connectedCallback(): void;
    disconnectedCallback(): void;
    get text(): ToText;
    /** A value from outside with the same blocks and another head is the head edited (the title): an edit like any other, undoable. */
    protected willUpdate(changed: PropertyValues): void;
    /** Ops applied and recorded, with the mark an undo hands back; a burst under one key keeps its first mark and learns where it ended. */
    private change;
    /** Ops from anywhere but the text (a head field, a block put in): recorded with the caret as it is. */
    private apply;
    /** Ops from the words: a letter typed is a burst of its own block only, so typing here and then there is two steps. */
    private onOps;
    /** After an undo or a redo: the cell, the card or the caret where the change was. */
    protected undone(entry: Entry, redo: boolean): void;
    /** Another's ops: the caret carried over them, and the card in hand with it (let go where it is gone). */
    protected followed(ops: Op[]): void;
    /** An edit's mark carried in place (a burst's mark is the one it goes on writing): the caret before it and after it. */
    protected carryMark(mark: unknown, before: Op[], after: Op[]): void;
    /** Once this and the text are drawn. */
    private drawn;
    /** The caret moved (or the words were drawn under it): drawn again only when the bar would show something else. */
    private onSelect;
    /**
     * Everything the bar shows, as one key: the block's kind, its alignment and the marks at the caret, the look, the
     * paper, Undo and Redo, the language, and what the page's own tools show (`ownKey`). The bar is drawn again only when
     * it changes (`guard`), so a letter typed into a paragraph draws the words and not the bar.
     */
    private barKey;
    private barDrawn;
    /** Where the caret is, or the end of the text. */
    private where;
    /** A block put in at the caret, or where it was (`at`, kept while a dialog was open): the editor's own rule for blocks (words join, cards stand alone), the caret after it. */
    insertBlock(b: Block, at?: Sel): void;
    /** Insert ▾'s Tiny Little Office Doc, asked for in the kit's dialog, then put in where the caret was. */
    insertDocument(): Promise<void>;
    /** A table: three by three, opened in the Spreadsheet at once; Done (or Cancel, which keeps it blank) puts it in as one step. */
    insertTable(): Promise<void>;
    /** A new document of another app, made in its own editor in the dialog; Done puts it in, Cancel puts nothing in. */
    insertApp(id: string): Promise<void>;
    /** The document or the table at `at` edited in its app, in the dialog: Done writes it back as one step, and it is in hand again. */
    private editCard;
    /** An icon from the kit's library (the whole of Lucide, imported lazily with the picker), put in at the caret. */
    insertIcon(): Promise<void>;
    /** Insert ▾ QR code: a picture of this document's own link, drawn from the link as it is when it is shown. */
    insertQr(): void;
    /** Insert ▾ Picture: a file from the device, put to the host that keeps pictures (offered only where one does: commands.ts), its fence at the caret. */
    insertImage(): Promise<void>;
    /** A picture file pasted or dropped, where the host keeps pictures: put to it, and its fence in at the caret, or after the card in hand. */
    private putImageAt;
    /** The picture among what was pasted or dropped, if the host keeps pictures and there is one. */
    private imageIn;
    /** A picture dragged over the words may be dropped, where the host keeps pictures; anything else is the browser's. */
    private onDragOver;
    private onDrop;
    /** Whether a key is the words' own: typed in them (not a card's, not a field's), so Mod+Shift+R reloads the page from anywhere else. */
    wordsHave(e: KeyboardEvent): boolean;
    /** The Word Processor's keys (commands.ts: the alignments, the page break), after the words have answered theirs. */
    private onKey;
    setPaper(paper: Paper): void;
    /** The look: a head field, absent for sans; each item a sample in its own type (style.css sets each by its place). */
    setLook(look: LookId): void;
    private setField;
    private renderFields;
    /** What the editor shows for a block that is not words: a grid for a table, a picture of another document. */
    private card;
    private tableEl;
    /** The caret into a cell of the table at `at` (and a range from it), once drawn. */
    private focusCell;
    private onCell;
    /** What the grid asked for, as ops; then the cell it named takes the focus. */
    private onTable;
    private cardEl;
    isCard(at: number): boolean;
    /** Where a person starts: the caret at the start of the first words (a card in hand when there are none). */
    focusFirst(): Promise<void>;
    /** The card at `at` taken in hand: it has the focus, and the bar comes up under it. */
    holdCard(at: number): void;
    /** Back to the words after the card (or before it, when there are none after). */
    afterCard(at: number, dir?: 1 | -1): undefined;
    /** The card that has the focus, if it is one of the text's. */
    private heldIn;
    private onFocusIn;
    private onFocusOut;
    /** A card tapped: taken in hand. */
    private onCardTap;
    /** What the card's Edit is: into the table's first cell, the document opened in its app. */
    private editOf;
    /** The picture's words made a field in its caption, with the focus (docs/editing.md: edited where it is drawn, as a lane's name is). */
    private startDescribe;
    /** Enter keeps the words (the field's blur does it); Escape lets them go. */
    private onAltKey;
    /** The picture's words as described: the fence written again with them, one step; every other attribute it carries rides along. */
    private describe;
    /** The alignment of the picture at `at`: its side, null at the column's width, undefined where it is no picture. */
    pictureAlign(at: number): Align | null | undefined;
    /** The picture at `at` set against `align`, one step; the alignment it has already puts it back to the column's width. */
    alignPicture(at: number, align: Align): void;
    /** The card's Edit, as its words say it ('' where it has none), and done: for the card's commands (commands.ts). */
    editLabel(at: number): string;
    editHeld(): void;
    /** Whether the card is a document that opens in a new tab, and that done. */
    opensIn(at: number): boolean;
    openHeld(): void;
    /** How many blocks the document has. */
    get blockCount(): number;
    /** A document held here, opened in its own app in a new tab: the lesser way, after Edit. */
    private openOf;
    moveCard(at: number, by: 1 | -1): void;
    duplicateCard(at: number): void;
    removeCard(at: number): void;
    /** The card as the clipboard holds it: its TLO, and our HTML. */
    private copyOf;
    /** The bar's Copy and Cut: the system clipboard as the page may write it, and this page's own memory of it. */
    copyOut(at: number, cut: boolean): void;
    /** What is pasted onto a card in hand goes in after it: a card stays in hand, words get the caret at their end. */
    private pasteAfter;
    /** The bar's Paste: the system clipboard's words if the page may read them, else what was last copied here. */
    pasteIn(at: number): Promise<void>;
    /** Mod+C, Mod+X, Mod+V with a card in hand. */
    private onClipboard;
    /** The keys on a card in hand (commands.ts CARD, before the text hears them); anything else is left to the text. */
    private onCardKey;
    get notesEl(): ToNotes | null;
    /** A mark tapped, or a footnote just put in: the caret in its note's words, at the end of the page. */
    private onNote;
    /** A note's words typed: one `text` op on its mark, a burst of typing in one note one step. */
    private onNoteChange;
    /** Back from a note to the words, the caret after its mark. */
    private onNoteBack;
    /** A note left empty: its mark goes (the caret where it was, when the note was left for the words). */
    private onNoteRemove;
    private renderNotes;
    /** The bar, drawn from what barKey() names: the registry's commands (commands.ts, kit/text/text-commands.ts), the words' with the text as their context. */
    private renderBar;
    render(): TemplateResult<1>;
    protected updated(changed: PropertyValues): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-write-editor': ToWriteEditor;
        'to-write-table': ToWriteTable;
    }
}
