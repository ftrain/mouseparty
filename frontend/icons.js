// Lucide icons (lucide-static 0.460.0, ISC: licenses/lucide/) for the app picker, as SVG.
// Copied from the package: an apps.Kind with a new Icon needs it added here.
const ICONS_LUCIDE = {
    "spray-can": "<path d=\"M3 3h.01\" /><path d=\"M7 5h.01\" /><path d=\"M11 7h.01\" /><path d=\"M3 7h.01\" /><path d=\"M7 9h.01\" /><path d=\"M3 11h.01\" /><rect width=\"4\" height=\"4\" x=\"15\" y=\"5\" /><path d=\"m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2\" /><path d=\"m13 14 8-2\" /><path d=\"m13 19 8-2\" />",
    "door-open": "<path d=\"M13 4h3a2 2 0 0 1 2 2v14\" /><path d=\"M2 20h3\" /><path d=\"M13 20h9\" /><path d=\"M10 12v.01\" /><path d=\"M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z\" />",
    "grid-3x3": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M3 9h18\" /><path d=\"M3 15h18\" /><path d=\"M9 3v18\" /><path d=\"M15 3v18\" />",
    "dices": "<rect width=\"12\" height=\"12\" x=\"2\" y=\"10\" rx=\"2\" ry=\"2\" /><path d=\"m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6\" /><path d=\"M6 18h.01\" /><path d=\"M10 14h.01\" /><path d=\"M15 6h.01\" /><path d=\"M18 9h.01\" />",
    "spell-check": "<path d=\"m6 16 6-12 6 12\" /><path d=\"M8 12h8\" /><path d=\"m16 20 2 2 4-4\" />",
    "shuffle": "<path d=\"M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22\" /><path d=\"m18 2 4 4-4 4\" /><path d=\"M2 6h1.9c1.5 0 2.9.9 3.6 2.2\" /><path d=\"M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8\" /><path d=\"m18 14 4 4-4 4\" />",
    "pencil-line": "<path d=\"M12 20h9\" /><path d=\"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z\" /><path d=\"m15 5 3 3\" />",
    "text-cursor-input": "<path d=\"M5 4h1a3 3 0 0 1 3 3 3 3 0 0 1 3-3h1\" /><path d=\"M13 20h-1a3 3 0 0 1-3-3 3 3 0 0 1-3 3H5\" /><path d=\"M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1\" /><path d=\"M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7\" /><path d=\"M9 7v10\" />",
    "venetian-mask": "<path d=\"M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z\" /><path d=\"M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z\" /><path d=\"M18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2Z\" />",
    "moon-star": "<path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9\" /><path d=\"M20 3v4\" /><path d=\"M22 5h-4\" />",
    "chart-column": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\" /><path d=\"M18 17V9\" /><path d=\"M13 17V5\" /><path d=\"M8 17v-3\" />",
    "plus": "<path d=\"M5 12h14\" /><path d=\"M12 5v14\" />",
    "x": "<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />",
};

function lucide(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS_LUCIDE[name] || ""}</svg>`;
}
