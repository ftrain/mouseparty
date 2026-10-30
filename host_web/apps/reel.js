// The Graffiti Reel (apps/reel.go): every minute someone drew on the movie, a
// slide, the frame with the drawing on it. Read-only here; "Make it slides"
// copies it into the Slides document, for everyone to write on.
MouseParty.apps.reel = (ctx, view) => {
    const h = MouseParty.lib.h;
    const box = h('div', { class: 'office' });
    const bar = h('div', { class: 'office-bar' });
    const page = h('div', { class: 'office-page' });
    box.append(bar, page);
    ctx.layer.append(box);
    let text = view.text, mounted = null, stopped = false;
    const make = h('button', {
        title: 'Copy the reel into Slides, where everyone can write on it',
        on: { click: () => { MouseParty.seed = { name: 'deck', text }; ctx.open('deck'); } },
    }, 'Make it slides');
    bar.append(make);

    (async () => {
        if (!MouseParty.office) {   // office.js holds the library's loading
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = `${ctx.base}/apps/office.js`;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        MouseParty.office.css(h);
        const { editors } = await MouseParty.office.load(ctx.base);
        if (stopped) return;
        mounted = await editors.mount('deck', text, page, () => {}, { readOnly: true, fill: true });
    })();

    return {
        view(v) {
            text = v.text;
            if (mounted) mounted.editor.value = text;
        },
        stop() { stopped = true; },
    };
};
