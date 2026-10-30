import { type KindId } from './model.ts';
import type { Found } from '../../lint.ts';
export declare function lintDiagram(text: string): Found[];
/** What the layout made of a diagram, in numbers: its things and connections, drawn and not, and how each thing's words were set. */
export interface DiagramMeasure {
    kind: KindId;
    w: number;
    h: number;
    things: number;
    edges: {
        written: number;
        drawn: number;
        dropped: number;
    };
    labels: {
        words: string;
        px: number;
        scale: number;
        lines: number;
        cut: boolean;
    }[];
}
export declare function measureDiagram(text: string): DiagramMeasure;
