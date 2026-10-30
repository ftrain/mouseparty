import type { Found } from '../../lint.ts';
/** One formula that fails: its cell, as written, and its error. */
export interface FormulaError {
    cell: string;
    formula: string;
    error: string;
}
export declare function lintSheet(text: string): Found[];
/** Every table of a document, by its block: how many formulas it has, and the ones that fail. */
export declare function measureSheet(text: string): {
    block: number;
    formulas: number;
    errors: FormulaError[];
}[];
