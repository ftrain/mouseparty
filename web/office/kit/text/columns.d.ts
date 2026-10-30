import { type ColType, type Column } from '../../doc/index.ts';
import type { MenuItem } from '../ui/menu.ts';
import '../ui/dialog.ts';
/** What a column may hold, in the person's language. */
export declare const COLUMN_KINDS: {
    id: ColType;
    name: () => string;
    hint: () => string;
}[];
/**
 * A column menu's types, under `group`, the one it holds checked. `set` is given the type picked; Money asks its
 * currency first (what the column names already in the field) and is given it ('' for the document's); closed
 * without OK, money in the currency it had.
 */
export declare function kindItems(col: Column | undefined, group: string, set: (type: ColType, currency?: string) => void): MenuItem[];
/** The words an Option column offers: those its cells already hold, each once, in the order they first come (a formula's are its own). */
export declare const choicesOf: (rows: string[][], c: number) => string[];
