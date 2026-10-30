/** What a confirmation asks: its question, more words under it, the words of its two answers, whether yes destroys something. */
export interface Confirm {
    title: string;
    body?: string;
    /** Yes's words (OK unless said: better, the verb, "Delete"). */
    yes?: string;
    /** No's words (Cancel unless said). */
    no?: string;
    /** Yes destroys something: drawn in the danger color, and the focus starts on no. */
    danger?: boolean;
    /** Where the dialog goes: an element the page's theme is on; the body otherwise. */
    into?: Element;
}
/** The question asked in a dialog over the page: true for yes, false for anything else. */
export declare function confirm(ask: Confirm): Promise<boolean>;
