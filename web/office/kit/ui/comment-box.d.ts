/**
 * <to-comment-box>: where a comment is written, a new one or a reply in a thread (kit/ui/comments.ts, the margin): a
 * plain field, marked `data-comment-box` so the words' bubble offers no Comment inside it, with Comment (or Reply), Ask
 * (when the host has an assistant to ask: `ask`, "Ask Assistant"), and Cancel when there is something to cancel.
 *
 * - "@" with letters after it (at the start or after a space) offers the host's people under the field (`people`, the
 *   assistant first), as "@" offers them in the words (kit/text/text.ts `mentions`): Up and Down move, Enter or Tab puts
 *   in the one chosen ("@Dana Diaz "), Escape closes the list and keeps the words, a click picks. A person is kept as
 *   words in the comment; who was named is said with it (`mentions`, their ids), and "@" and the assistant's name asks it.
 * - A plain textarea rather than the kit's <to-text>: a comment is plain words, and the browser's own field is native to
 *   spelling, a phone's keyboard and a screen reader.
 * - Sending tells "comment-box-send" ({ text, ask, mentions }), bubbling; the margin hands it to the host and empties the
 *   box (`clear`) once the host says it has it, so words refused stay. Mod+Enter sends; Escape, with the list closed,
 *   tells "comment-box-cancel".
 */
import { LitElement } from 'lit';
import type { Person } from './review-panel.ts';
/** What a box sends: its words, whether they ask the assistant, and the ids of the people named in them. */
export interface BoxSend {
    text: string;
    ask: boolean;
    mentions: string[];
}
export declare class ToCommentBox extends LitElement {
    static properties: {
        people: {
            attribute: boolean;
        };
        ask: {
            attribute: boolean;
        };
        label: {};
        send: {};
        cancelable: {
            type: BooleanConstructor;
        };
        busy: {
            type: BooleanConstructor;
        };
        offered: {
            state: boolean;
        };
        chosen: {
            state: boolean;
        };
    };
    /** The people "@" offers. */
    people: Person[];
    /** The assistant a comment may ask (its name, "Assistant"), offered first by "@"; null for none. */
    ask: Person | null;
    /** The field's name: "Comment", "Reply". */
    label: string;
    /** The send button's words. */
    send: string;
    cancelable: boolean;
    /** Sending: the buttons wait. */
    busy: boolean;
    offered: Person[];
    chosen: number;
    private readonly key;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    get field(): HTMLTextAreaElement | null;
    /** The words written. */
    get value(): string;
    /** Empties the box, once what it said is the host's. */
    clear(): void;
    /** The focus in the field. */
    focusField(): Promise<void>;
    /** Everyone "@" may name: the assistant first. */
    private get named();
    /** Whoever has a word of their name or id beginning with the letters `q`. */
    private offer;
    private onInput;
    /** The one chosen put in place of the "@word" before the caret. */
    private pick;
    private onKey;
    /** The people the words name ("@" and their name), by id. */
    private mentionsIn;
    private submit;
    private onSubmit;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-comment-box': ToCommentBox;
    }
}
