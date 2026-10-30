import './dialog.ts';
export interface IconChoice {
    /** Icons to offer first, by name. */
    suggested?: string[];
    /** The icon there now, marked as pressed. */
    current?: string;
    /** Offer "No icon", which resolves ''. */
    none?: boolean;
    /**
     * Offer the Emoji set beside the icons (the default): for a caller that puts the result into words, where an
     * emoji is a character like any other. false where an icon's name is needed (a shape's icon, a slide's glyph).
     */
    emoji?: boolean;
}
/**
 * The library in a dialog. Resolves with an icon's name, or with an emoji's character itself when the Emoji
 * set is offered and one is picked (an emoji is words: the caller puts the character in as text; isIconName
 * tells the two apart). With emoji, a two-way switch (Icons · Emoji) chooses which set is browsed: one
 * scroll of both would put the emoji under some forty sections of icons, a long way down on a phone. The
 * search spans both sets at once, the set being browsed first.
 */
export declare function chooseIcon(opts?: IconChoice): Promise<string | null>;
