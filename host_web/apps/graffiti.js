// Graffiti (apps/graffiti.go): everyone draws on the video. What you draw shows
// at once, and again when the host sends it back to all. A minute after the
// first line, the page turns: it goes into the Graffiti Reel, and fades here.
OpenHouseParty.apps.graffiti = (ctx, view) => {
    const s = OpenHouseParty.lib.sketch(ctx, view.lines);
    s.canvas.style.transition = 'opacity 1.2s';
    let fading = null, fresh = [];   // lines on the next page, while the last one fades
    return {
        message(m) {
            if (m.kind === 'line') {
                if (fading) fresh.push(m.line);
                else s.line(m.line);
            } else if (m.kind === 'turn') {
                clearTimeout(fading);
                s.canvas.style.opacity = '0';
                fading = setTimeout(() => {
                    s.clear();
                    fresh.forEach(s.line);
                    fresh = [];
                    fading = null;
                    s.canvas.style.opacity = '1';
                }, 1200);
            }
        },
        resize: s.resize,
        stop() { clearTimeout(fading); s.stop(); },
    };
};
