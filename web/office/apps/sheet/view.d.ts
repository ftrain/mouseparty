/**
 * A sheet drawn, with no DOM: the table as a picture (the names over the columns shaded, numbers to the
 * right), the grid as a spreadsheet looks (letters, row numbers, grey lines: the thumbnail, and a table
 * inside a text), the chart it asks for, and the CSV. What `def.ts` builds its pages and files on, and
 * what Write may draw a table block with.
 */
import { type ChartData } from '../../kit/draw/chart.ts';
import { type CellValue, type Doc } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
import { type SheetView } from './model.ts';
/** The names over the used columns, or null when every column goes by its letter alone. */
export declare const headings: (v: SheetView) => string[] | null;
/** A value as its column shows it, in words: a rich cell's words without their marks, money in its currency. */
export declare const cellText: (v: CellValue, type?: string, currency?: string) => string;
/** The used cells as shown: computed values. */
export declare function shown(v: SheetView): string[][];
/** The names over the columns, if any, then the used cells as shown. */
export declare function lines(v: SheetView): string[][];
/** The table as a CSV: the names over the columns, if any, then the computed values. */
export declare const sheetToCsv: (doc: Doc, sep?: string) => string;
/** The table as a chart reads it: numbers where a column holds numbers, words (dates, links, ticks) elsewhere; each series named by its column. */
export declare function chartOfSheet(v: SheetView): ChartData;
/** The chart the sheet asks for, drawn; null when it asks for none. */
export declare const chartOf: (v: SheetView, w?: number, h?: number) => Page | null;
/**
 * The table as a picture: the headline large above it if there is one, the names over the columns, if
 * any, shaded, then the rows. `upTo` of its filled cells have their contents, in reading order.
 */
export declare function tablePage(v: SheetView, upTo?: number): Page;
/**
 * The table as a spreadsheet looks: a strip of column letters along the top, the names under them in
 * bold, row numbers down the side, grey grid lines, words at an ordinary size, numbers to the right. The
 * thumbnail, and what a table in a text being written is. As a thumbnail (`thumb`) it is a landscape
 * page, four by three, holding what can be read at that size: the first six columns at most, each at most
 * 120 wide, and the rows that fit under them.
 */
export declare function gridPage(v: SheetView, thumb?: boolean): Page;
/** A sheet document's pages: the table (its headline above it) and its chart, the chart first when it is drawn above the table; drawn small, the grid alone (or the chart), as a thumbnail the grid's corner; as a card, the chart where there is one, else the table. */
export declare function sheetPages(text: string, small?: boolean, thumb?: boolean, card?: boolean): Page[];
