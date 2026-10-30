import type { Page } from '../core/app.ts';
export type ChartKind = 'bar' | 'line' | 'pie' | 'sankey';
export declare const CHART_KINDS: {
    id: ChartKind;
    name: () => string;
}[];
export interface Flow {
    from: string;
    to: string;
    value: number;
}
export interface ChartData {
    labels: string[];
    series: {
        name: string;
        values: number[];
    }[];
    /** The rows that read as From | To | Amount: what a Sankey draws. */
    flows?: Flow[];
}
type Cell = number | string | null;
/** `names`: each column's name, for its series. */
export declare function chartData(rows: Cell[][], names?: string[]): ChartData;
/** The chart that suits the data, or '' if there is nothing to chart. */
export declare function suggestChart(d: ChartData): ChartKind | '';
/** A chart of the data, `w` by `h`. `upTo`: how many labels' worth (bars, points or slices) to draw, for building it up. */
export declare function chartPage(d: ChartData, kind: ChartKind, title?: string, w?: number, h?: number, upTo?: number): Page;
export {};
