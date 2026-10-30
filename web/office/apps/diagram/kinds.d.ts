/**
 * The eight kinds by name, icon and the words that help: what a kind is called, what one of its things is
 * called (Insert's item), the words a new one is made with and the hint under the
 * bar. Kept apart from model.ts so the model stays free of the strings and the icons.
 */
import { type IconNode } from 'lucide';
import type { KindId } from './model.ts';
export declare const KIND_ICON: Record<KindId, IconNode>;
export declare const kindName: (k: KindId) => string;
/** One of its things: Insert ▾ offers "Idea", "Person", "Step"… */
export declare const thingName: (k: KindId) => string;
/** The words a new thing is made with, chosen so the first letter typed replaces them; the placeholder of a thing whose words are all gone. `item`: one thing of a list (a guest at a table, a thing in a set). */
export declare const newWords: (k: KindId, item?: boolean) => string;
/** What the picture does, said once under the bar. */
export declare const kindHint: (k: KindId) => string;
