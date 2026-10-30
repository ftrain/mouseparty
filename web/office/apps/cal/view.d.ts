/**
 * Calendar drawn and written out, with no DOM: the month pages (or, for a schedule, the chart) for print,
 * PDF, PNG and thumbnails; the file a calendar app reads (iCalendar, RFC 5545, through the kit's writer) and
 * a CSV.
 */
import { type Doc } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
/** The document drawn: the schedule, or the months. Small, the first month or the first tasks. */
export declare function calPages(doc: Doc, small?: boolean): Page[];
/** The calendar as events: an all-day span over floating dates (DTEND the day after), a timed one as UTC instants, a repeat as its RRULE, how far along in the description. */
export declare function calToIcs(doc: Doc, stampMs: number): string;
/** The calendar as rows for a spreadsheet: a schedule as its tasks (level, start, end, days, done), a calendar as its spans. */
export declare function calToCsv(doc: Doc, sep?: string): string;
