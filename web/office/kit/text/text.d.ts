/**
 * <to-text>: the one rich-text editor (docs/kernel.md §4). It is given a
 * span of blocks and draws them; every `beforeinput` is prevented and
 * turned into operations (textops.ts), kept as the format keeps what they
 * make (`settle`: no mark on a space at its edge, the marks typed with such a
 * space still in force after it) and fired as `text-ops` for the host to
 * apply; the host hands the new blocks back and only the blocks whose
 * identity changed are drawn again (Lit's repeat, keyed by the block
 * object). The selection lives in the model as a Pos pair and is written to
 * the DOM after each draw; `selectionchange` reads it back. The DOM is read
 * in one place only: the block the IME composed in, at compositionend.
 *
 * Three shapes. `doc`: any block, Enter splits, a card (a table, another document) the caret
 * skips. `lines`: items and paragraphs (a slide's words), Backspace at the
 * start says `text-exit` ({dir: 'back'}). `line`: one block, Enter says
 * `text-enter` ({shift}: whether it was Shift+Enter), Delete at its end says
 * `text-exit` ({dir: 'forward'}): the host owns what is around the line. In
 * a line or lines, Select All with the box already whole says
 * `text-selectall` (the host takes everything). In a doc the box is the
 * document: Select All is the editor's own, the model's selection from the
 * first words to the last, written to the DOM over every block, and an edit
 * over it (typing, Backspace, Delete, a cut, a paste) takes the cards at its
 * ends too and leaves one paragraph. Shift+Enter is a line break
 * in a paragraph, an item or a quote; a heading splits.
 *
 * The page scrolls to the caret only after something the person did here: a
 * letter typed, a key, a paste, a command from a bar or a tap, and only when
 * the caret is off the screen. A selection written for any other reason (a
 * draw, a host putting a selection back, an autosave, a selectionchange the
 * browser raised) leaves the page where the reader put it, and so does any
 * written after they scrolled it themselves (a wheel, a finger, Page Up or
 * Down). Every focus() here passes preventScroll.
 *
 * Escape steps out one step per press: the link box closes (and the
 * press stops there), else a range of words collapses to its focus,
 * else `text-escape` (bubbles, cancelable) tells the host, and the key goes
 * on to it. Alt+Up/Down moves an item with its family past its neighbour;
 * Mod+Enter ticks a task item (in a doc or lines; a line's host decides);
 * Tab indents an item only when it can move, else it moves the focus.
 *
 * What is not words (a table, another document, a rule) is a card:
 * `contenteditable=false`, skipped by the caret, taken out whole. The host
 * may draw a card's inside through `card` (a table as a grid, another
 * document as its first page); whatever it puts there (inputs, buttons)
 * keeps its own events.
 * A task item's box is tapped to tick.
 *
 * What a screen reader is given: a run of items is one element, role=list (the model stays flat: each item is a block
 * as every other is, blockEls()), each item a listitem with its level, its place and how many; a task's state is
 * words said before its words (data-said: the caret, the IME and the copy pass over them); the drawn marks and the
 * placeholder are drawn only (an empty alt in the stylesheet), the placeholder being the box's aria-placeholder.
 *
 * Words selected bring up the selection bubble (a <to-context> centred
 * under them): the marks, Link, Footnote (where the host lists the notes:
 * `notes`) and, over whole blocks of words in a doc or lines editor, the two
 * lists. It goes when the selection collapses or leaves, while an IME
 * composes, and while the link box is open; `no-bubble` turns it off.
 *
 * A footnote is a chip in the words (its mark, numbered on from
 * `note-start`); its words are typed where the host draws the notes (the end
 * of a page, a slide's foot, under an outline: kit/draw/notes.ts), never here. A
 * tap or Enter on a chip, and the Footnote command once it has put a new
 * mark in, say `text-note` ({block, nth}: the block, and which of its marks)
 * for the host to open that note. Only a host with `notes` is offered the
 * Footnote command. `marks-only` keeps the six marks alone (words
 * that are drawn, not read: a shape's label): no Link, no Footnote, no
 * lists, Mod+K does nothing, and a paste brings its words without links or notes.
 *
 * Typing ":" and a letter at the start of a block or after a space (never "10:30", never "re: that") opens a
 * completion under the caret (<to-complete>, kit/ui/complete.ts): the icons and emoji whose names or tags begin with
 * what follows the ":", best first, the first highlighted. Up/Down move the highlight, Enter or Tab picks it in
 * place of the ":word" (one undo step, the caret after it), Escape closes it and leaves the words as typed (the
 * press stops there), a space, a second ":", or the caret moving away closes it, a tap on a row picks it. A
 * known ":name:" typed in full becomes the icon (or the emoji) at once, like a Markdown shortcut: an undo gives
 * the words back. Where the words hold no icon runs (`marks-only`, a drawn label; `no-bubble`, plain words) only
 * emoji are offered. While it is open the editor is a combobox's box: `aria-autocomplete="list"`, its
 * `aria-activedescendant` the highlighted row.
 *
 * A host that gives `mentions` (the people sharing its document) has "@" do the same: typed at the start of a block,
 * after a space or after an opening bracket or quote, it offers the people whose name or line under it has a word
 * beginning with what follows, and the one picked is put in by name in place of the "@word". With none (the default),
 * "@" is a letter like any other.
 *
 * A host may show words among the words that are not the document's (`showGhosts`, Ghost): the words someone took out,
 * and brackets and initials saying who did what (kit/text/redline.ts draws them so). They are drawn at their offsets,
 * not editable and passed over as a task's state is (data-said), and the caret is written back where it was in the
 * words. A ghost the caret cannot stop on is reached by the keys: Alt+Enter names the edit the caret is in, or the
 * nearest in its block, before the caret first (a lozenge `covers` its edit's words), in "text-ghost" ({ id, block,
 * el }: GhostAt), for the host to open; in a block that shows none the key goes on. With none (the default) a block is
 * drawn as its words and nothing else.
 *
 * Inside a read-only editor (kit/core/element.ts) the words are shown and not edited: not contenteditable, but still a
 * stop in the focus order (aria-readonly), and its keys are not answered here but Escape, which lets the bubble go.
 * Where its host takes comments (`data-comments`), words a reader selects bring up the bubble with Comment alone.
 *
 * Nothing here calls execCommand, sets innerHTML, or reads it.
 */
import { LitElement, nothing, type TemplateResult } from 'lit';
import { type Block, type Op } from '../../doc/index.ts';
import { type Command, type Fmt, type Pos, type Sel, type Shape } from './textops.ts';
import '../ui/context.ts';
import '../ui/link-pop.ts';
import '../ui/complete.ts';
export type { Sel, Shape } from './textops.ts';
/** What `text-ops` carries: the ops, the selection after them, the one before, and 'type' when the edit is a letter typed or taken out (undo folds those). */
export interface TextOps {
    ops: Op[];
    sel: Sel;
    before: Sel | null;
    kind?: 'type';
}
/** What `text-note` carries: the block of the mark asked for, and which of the block's marks it is. */
export interface NoteAt {
    block: number;
    nth: number;
}
/**
 * Words a host shows among a block's words that are not the block's (words someone took out, struck through where
 * they were, and who did what: kit/text/redline.ts ghostsOf): drawn at an offset, never written, passed over by the
 * caret, the copy and the IME as what is said is.
 */
export interface Ghost {
    offset: number;
    text: string;
    cls?: string;
    title?: string;
    style?: string;
    /** A name the host finds it by again (data-ghost). */
    id?: string;
    /** A whole block's worth: drawn as a line of its own before the block's words, or, `after`, after them all. */
    block?: boolean;
    after?: boolean;
    /** Drawn as words taken out (`del`, the default) or as a mark of the host's own (`span`). */
    tag?: 'del' | 'span';
    /** Pieces drawn in place of `text`, each with its own class (and name): a line made of a mark and words. */
    parts?: {
        text: string;
        cls?: string;
        id?: string;
        title?: string;
        style?: string;
        covers?: [number, number];
    }[];
    /** Among ghosts at one offset, the order they are drawn in (as given, otherwise). */
    order?: number;
    /**
     * The words a named ghost (or part) stands for, from and to in its block (an edit's lozenge: kit/text/redline.ts):
     * Alt+Enter with the caret among them, or else nearest them, names it to the host ("text-ghost").
     */
    covers?: [number, number];
}
/** What a host hears when the keys reach a ghost it named (Alt+Enter): its name, its block, and its element as drawn, to open a panel beside. */
export interface GhostAt {
    id: string;
    block: number;
    el: HTMLElement | null;
}
/** One of the people "@" offers (ToText's `mentions`): the name put in the words, and a line under it (an email). */
export interface Mention {
    name: string;
    detail?: string;
}
export declare class ToText extends LitElement {
    static properties: {
        blocks: {
            attribute: boolean;
        };
        shape: {};
        noteStart: {
            type: NumberConstructor;
            attribute: string;
        };
        label: {};
        placeholder: {};
        card: {
            attribute: boolean;
        };
        noBubble: {
            type: BooleanConstructor;
            attribute: string;
        };
        marksOnly: {
            type: BooleanConstructor;
            attribute: string;
        };
        notes: {
            type: BooleanConstructor;
        };
    };
    /** The blocks it owns; `at` in its ops counts from the first. */
    blocks: Block[];
    shape: Shape;
    /** How many footnotes come before this span, so its marks are numbered on from there. */
    noteStart: number;
    label: string;
    placeholder: string;
    /** The host's drawing of a card's inside, by block; null (or nothing returned) for the editor's own. */
    card: ((b: Block, at: number) => TemplateResult | typeof nothing | null) | null;
    /** No selection bubble (a host with marks of its own beside the words, or none). */
    noBubble: boolean;
    /** The marks and nothing else: no links, no footnotes, no lists. */
    marksOnly: boolean;
    /** The host draws the notes and answers `text-note`: the Footnote command is offered. */
    notes: boolean;
    private _sel;
    /** The marks the next letter typed will carry. */
    private fmt;
    /** Marks the format let go of on the spaces just before the caret (a space typed after a bold word): still in force there. */
    private held;
    /** What was held where a composition began: the words it makes are typed as letters are. */
    private composeHeld;
    private composing;
    private composingEl;
    /** Write the model selection to the DOM after the next draw; 'focus' takes the focus too. */
    private pendingSel;
    /** A selection write is on its way (WebKit's is a frame later): what the DOM says meanwhile is stale and not read back. */
    private writing;
    /** The selection has left the editor (said once). */
    private away;
    /** The block an IME just composed in: drawn afresh on the next draw, not updated in place. */
    private fresh;
    /** Select All in a doc: the selection is the whole document, cards included; an edit over it takes everything. */
    private whole;
    /**
     * The people "@" offers while typing, as a host gives them (the people sharing its document): a name to put
     * in, and a line under it. None: "@" is a letter like any other.
     */
    mentions: Mention[];
    /** The ghosts a host shows in each block, by the block's index (Ghost); none by default. Given anew with showGhosts(). */
    ghosts: ((block: number) => Ghost[]) | null;
    /**
     * New ghosts drawn: the blocks drawn again around them, and the caret (or the selection) written back where it was in
     * the words, since the draw replaces the text it was in. A host calls this as often as its ghosts change, typing or not.
     */
    showGhosts(ghosts: ((block: number) => Ghost[]) | null): Promise<boolean>;
    /** The ":word" being completed: its block, where its ":" is, where the caret is, the letters after the ":". */
    private completing;
    /** The ":word" Escape closed the completion on: it stays closed while the caret stays in it. */
    private dismissed;
    /** A letter was just typed: the completion may open on the words it made. */
    private armed;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private offIcons;
    /** The blocks as drawn: an editor with none shows one empty paragraph to type into. */
    get model(): Block[];
    /** Inside a read-only editor: shown, not edited (the header). */
    get locked(): boolean;
    /** The editable box. */
    get tx(): HTMLElement;
    private get linkPop();
    private get completePop();
    private get bubble();
    /** Where the selection is, in the model; null when there has been none. */
    get sel(): Sel | null;
    /** Put the selection here (and the focus with it). */
    set sel(s: Sel | null);
    /**
     * Ops someone else applied to the blocks (a shared document: DocElement's `applyRemote`): the selection carried over
     * them and held within `blocks`, the blocks as they are after; written back once they are drawn, where the box has
     * the focus, and never taking it.
     */
    carry(ops: Op[], blocks: Block[]): void;
    /** The marks at the caret (what a bar shows pressed). */
    get marks(): Fmt;
    /** The marks held at a caret (textops.ts Held): while the caret stays where they were let go of. */
    private heldAt;
    /** The kind of block the caret is in. */
    get kind(): "h1" | "h2" | "ol" | "p" | "quote" | "title" | "ul" | null;
    get alignment(): "center" | "justify" | "left" | "right";
    focus(opts?: FocusOptions): void;
    hasFocus(): boolean;
    /** Each block's element, in order: the box's children, a list's items in its place (render). */
    blockEls(): HTMLElement[];
    private blockElOf;
    /** The block a point between blocks (in the box, or in a list) comes before; the model's length at the very end. */
    private blockAfter;
    /**
     * A DOM point as a position: characters counted through the block's text nodes, chips and line breaks as one each,
     * held within `model` (the blocks as drawn; at compositionend, with the composed block as the browser left it).
     */
    readPos(node: Node, offset: number, model?: Block[]): Pos | null;
    /** A position as a DOM point: the text node holding the character, or the block itself around a chip. */
    domPoint(pos: Pos): [Node, number] | null;
    private rangeSel;
    /** The DOM selection as a model selection, when it sits in this editor. */
    readSel(model?: Block[]): Sel | null;
    private onSelectionChange;
    private flushSel;
    /** The caret kept inside what can be seen of the column (above a phone's keyboard) after something the person did moved it, and at the middle from below after an edit (kit/ui/scroll.ts). */
    private keepCaretVisible;
    /**
     * The ops are the host's to apply; the selection after them is kept here
     * and written once the host's new `blocks` are drawn (the draw comes from
     * that property alone, whether the host applies the ops in the event or
     * in a render of its own).
     */
    private emit;
    private current;
    /** What an edit replaces: the selection, or with everything selected (Select All in a doc) the whole document, its cards too. */
    private span;
    /** Whether an event comes from a control the host put inside a card (an input, a button): its own, not the editor's. */
    private ownEvent;
    private onBeforeInput;
    /** Letters typed: a space may finish a Markdown shortcut, a straight quote curls, the rest go in with the marks in force. */
    private typed;
    private put;
    private enter;
    private paste;
    private onKeyDown;
    /** Alt+Up/Down: the item, with its family, past its neighbour; false where there is none to move. */
    moveItem(by: -1 | 1): boolean;
    /** Tab, Shift+Tab: an item shifted when it can move; false otherwise, so Tab moves the focus on (never trapped). */
    shiftItem(by: -1 | 1): boolean;
    /**
     * Alt+Enter where a host shows who did what (`showGhosts`): the edit the caret is in, or else the nearest in its
     * block, before the caret first (ghostNear, by the words each lozenge `covers`), named to the host in "text-ghost"
     * (GhostAt) for it to open; false where the block shows none, and the key goes on.
     */
    openChange(): boolean;
    /** Mod+Enter on a task item ticks it (Docs' checklist key); anywhere else it is the host's (false). */
    tick(e?: Event): boolean;
    /**
     * Mod+A. In a doc: the whole document as the model's selection, cards and all, written to the DOM by us (the browser's
     * own stops short of a card at either end). In a line or lines the first press is the browser's own (false), taking the
     * box; with the box already whole, or empty, the host is asked for everything (`text-selectall`).
     */
    selectAllKey(): boolean;
    /** Copy or Cut from a button (a phone's row): the words selected onto the clipboard as the keys put them, our TLO and our HTML. */
    copyOut(cut: boolean): void;
    /** Paste from a button: the clipboard read where the browser allows; where it refuses, a line under the row says to use the keyboard's paste. */
    pasteIn(): Promise<void>;
    /** Whether the selection is whole blocks of words that can be a list: the lists are offered in the bubble then. */
    listable(): boolean;
    /** Everything selected: the model's selection runs from the first words to the last (what `sel` says), and an edit takes the cards too. */
    selectAll(): void;
    /** Escape, one step per press: a box closes; else a range collapses to its focus; else the host hears `text-escape` and the key goes on. */
    private escape;
    /** A task item ticked or unticked; false when the block is no task. */
    private toggleDone;
    private onClick;
    private onCopy;
    private onPaste;
    private onFocusOut;
    private onCompositionStart;
    /** The composed block read back once, and the one op that takes the model there. */
    private onCompositionEnd;
    /** The linked words around a position, as a selection; null when the caret is not in a link. */
    private linkSpan;
    /** Do a thing: a mark, a kind of block, an insertion. Some take a word: the address for 'link', the name for 'icon' (or an emoji, put in as words). */
    exec(cmd: Command, arg?: string): void | null;
    /** A footnote's mark tapped, or Enter on it: the host is asked to open its note (`text-note`), where it draws the notes. */
    private askNote;
    /** The link box closed, and the bubble; whether the box was open (an Escape that closed it goes no further). */
    private closePops;
    /** Whether the selection is whole blocks of words that can be a list (a paragraph, an item, a heading). */
    private wholeBlocks;
    /** The selection bubble, as the selection is now: up under words selected while the editor has the focus, else gone. */
    private syncBubble;
    /** Where a selection is on the screen, for a bubble. */
    private selRect;
    /** The link bubble, when the caret sits in linked words. */
    private showLink;
    private onLinkSet;
    private onLinkRemove;
    /** The address box let go of (Escape, a tap outside): the focus and the selection come back to the words. */
    private onLinkCancel;
    /** Whether icons may go in here: not in a drawn label (marks-only) nor in plain words (no-bubble), whose hosts keep no icon run. */
    private get iconsHere();
    /**
     * The ":word" just before a caret: a ":" at the start of the block or after a space, then letters, digits or hyphens;
     * or, where the host offers people (`mentions`), an "@" there or after an opening bracket or quote, then a name's letters.
     */
    private trigger;
    private completeOpen;
    /** The completion as the words and the caret are now: opened by a letter typed, kept while the caret is in the same ":word", else closed. */
    private syncComplete;
    private showCompletions;
    private ariaComplete;
    private endComplete;
    /**
     * The keys while the list is up: Up/Down, Enter or Tab, Escape. Taken on the window before anyone else (a host
     * that moves between cells or rows on these keys listens around the editor, some in the capture phase), and
     * stopped there; every other key goes on as ever.
     */
    private onCompleteKey;
    /** What a pick puts in: an icon run, or words with the marks in force (an emoji, a person's name). */
    private completed;
    /** The ":word" replaced by the row picked (the highlighted one by default): one edit, the caret after it. */
    private pickCompletion;
    private onCompletePick;
    private onCompleteCancel;
    protected willUpdate(changed: Map<string, unknown>): void;
    protected updated(changed: Map<string, unknown>): void;
    private words;
    private renderRuns;
    /** One run as drawn: an icon, a footnote's mark, or words with their marks. */
    private renderRun;
    /** A ghost as drawn: the host's words, not editable, passed over (SAID). */
    private ghost;
    /** Runs with a host's ghosts among them, each at its offset (a run split where one falls inside it). */
    private withGhosts;
    private renderCard;
    private renderBlock;
    render(): TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-text': ToText;
    }
}
