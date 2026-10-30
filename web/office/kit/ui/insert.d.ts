/**
 * <to-insert>: the Insert ▾ menu every bar has, a <to-menu> with that name and a plus. The app gives it
 * the things that can be put in (a heading, a table, another document…), each an item. Typing
 * narrows the list (menu.ts `filter`).
 */
import { ToMenu } from './menu.ts';
export declare class ToInsert extends ToMenu {
    constructor();
    protected labelText(): string;
}
