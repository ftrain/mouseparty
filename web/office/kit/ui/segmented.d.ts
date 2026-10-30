/**
 * <to-segmented>: a choice of a few drawn as one row of segments (docs/library.md, The kit's small pieces): My and All,
 * Table and Calendar, Board and Table. It is a radio group, as ARIA has it (`role=radiogroup`, each segment
 * `role=radio` and `aria-checked`): one segment takes Tab, the one chosen; the arrows (Left and Right as the page reads,
 * Up and Down), Home and End move to another and choose it; a click chooses. The choice is told in `change`, bubbling,
 * `{ value }`, and shown at once; a page that keeps it elsewhere gives `value` again.
 *
 * - `options`: `{ value, label, icon? }` each (Segment), in order; `value`, the one chosen; `label`, the group's name
 *   for a screen reader ("Whose leads").
 * - Its look is the kit's `.to-seg` (kit.css), the chosen segment the accent's.
 */
import { LitElement } from 'lit';
import { type IconNode } from '../draw/icons.ts';
/** One segment: the value it stands for, its words, an icon before them. */
export interface Segment {
    value: string;
    label: string;
    icon?: IconNode;
}
export declare class ToSegmented extends LitElement {
    static properties: {
        options: {
            attribute: boolean;
        };
        value: {};
        label: {};
    };
    options: Segment[];
    value: string;
    /** The group's name, for a screen reader. */
    label: string;
    constructor();
    createRenderRoot(): this;
    private get segments();
    /** Segment `i` chosen: shown, told, and (by a key) focused. */
    private choose;
    private onKey;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-segmented': ToSegmented;
    }
}
