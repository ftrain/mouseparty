import { type AppDef, type Page, type ViewOpts } from '../core/app.ts';
import type { Block } from '../../doc/index.ts';
export declare const LOCKED_LANG = "locked";
/**
 * Said when a password does not open a sealed link. AES-GCM cannot tell a wrong password from a link cut short in a
 * chat, so it says both, the cut first-hand: a person sure of their password asks for the link again.
 */
export declare const notOpened: () => string;
/** The fence that holds a sealed document by its link. */
export declare const lockedFence: (app: string, payload: string) => Block;
/** A locked fence's app and sealed payload, or null for a body that is not a sealed document's link (of an app here). */
export declare function lockedOf(body: string): {
    app: string;
    payload: string;
} | null;
/** The address a placed document opens at: a locked one's own link; else its text packed into one (`encode`). */
export declare const placedLink: (lang: string, body: string, encode: (text: string) => string, site?: string) => string;
/** A sealed payload's text, opened this visit. */
export declare const openedText: (payload: string) => string | undefined;
/** Whether a locked fence's document has been opened this visit. */
export declare const isOpened: (body: string) => boolean;
/** A sealed payload opened: its text kept for the visit. */
export declare const setOpened: (payload: string, text: string) => undefined;
/** Everything opened forgotten (the tests). */
export declare const forgetOpened: () => void;
/** The locked card for a document of `def`: the lock, the words, the app's icon and name, in the middle of its page. */
export declare function lockedCard(def: AppDef): Page;
/** A locked fence drawn: the locked card; in an editor (`open`), the document itself once opened this visit. */
export declare function lockedPage(body: string, opts?: ViewOpts): Page;
/** How the lookup knows a locked fence: enough of a definition for the hosts to draw it, and a name for its caption. */
export declare const lockedDoc: AppDef;
