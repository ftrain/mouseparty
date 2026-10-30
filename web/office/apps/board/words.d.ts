import type { ColumnNames } from './model.ts';
/** The title column's and the status column's names, as the reader says them. */
export declare const columnNames: () => ColumnNames;
/** A new board's lanes, as the reader says them: what is still to do, what is being done, what is finished. */
export declare const blankLanes: () => string[];
