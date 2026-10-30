export interface Parts {
    y: number;
    /** 1–12 */
    m: number;
    d: number;
    h: number;
    min: number;
    /** 0 = Sunday … 6 = Saturday */
    wd: number;
}
export declare function isValidZone(zone: string): boolean;
export declare const localZone: () => string;
/** Every zone this browser knows, the viewer's own and UTC among them, sorted. */
export declare const allZones: () => string[];
/** The civil date and clock of an instant in a zone. */
export declare function utcToParts(ms: number, zone: string): Parts;
/** A zone's offset from UTC at an instant, in minutes (east positive). */
export declare function offsetMinutes(ms: number, zone: string): number;
/** The instant a clock in a zone reads this date and time; a time in a clock change's gap lands on a real one. */
export declare function partsToUtc(y: number, m: number, d: number, h: number, min: number, zone: string): number;
/** A zone's short name at an instant: "EST", "GMT+2". */
export declare function zoneAbbr(ms: number, zone: string): string;
export declare const pad2: (n: number) => string;
/** "2027-03-01" for a day counted from 1970. */
export declare function dayString(day: number): string;
/** "09:05". */
export declare const clockString: (p: {
    h: number;
    min: number;
}) => string;
