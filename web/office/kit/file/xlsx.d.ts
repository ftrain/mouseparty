/**
 * A table block as an Excel workbook (.xlsx): one sheet, the names over the columns in its first row, each
 * cell a number, a string, or a formula in Excel's dialect with its worked-out value cached (Excel
 * recalculates on open; the cached value is for everything else). Typed columns get number formats: dates,
 * money, percentages. For a sheet document and for a table inside a text alike.
 */
import { type Evaluated, type Table } from '../../doc/index.ts';
/** The names over the used columns, as a reader sees them: '' over a column that goes by its letter alone ("ColA"); null when every column does. */
export declare function sheetHeadings(t: Table, cols: number): string[] | null;
/** Our formula dialect in Excel's: AVG is AVERAGE there, and a named cell (see namedCells) is its reference, `off` rows down for the names' row. */
export declare function toExcelFormula(raw: string, named?: Map<string, [number, number]>, off?: number): string;
/** The workbook; `currency` is the document's, for money columns that name none ("$" where it names none either). */
export declare function tableToXlsx(t: Table, ev: Evaluated, created?: number | null, currency?: string): Uint8Array;
