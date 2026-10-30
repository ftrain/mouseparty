// Graffiti (apps/graffiti.go): everyone draws on the video. What you draw shows
// at once, and again when the host sends it back to all.
OpenHouseParty.apps.graffiti = (ctx, view) => {
    const s = OpenHouseParty.lib.sketch(ctx, view.lines);
    return {
        message(m) { if (m.kind === 'line') s.line(m.line); },
        resize: s.resize,
        stop: s.stop,
    };
};
