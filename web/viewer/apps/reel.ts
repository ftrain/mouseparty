// The Graffiti Reel (apps/reel.go): every minute someone drew on the movie, a
// slide, the frame with the drawing on it. Read-only here; "Make it slides"
// copies it into the Slides document, for everyone to write on.
import type { Mounted } from '../../office/editors.d.ts';
import type { Start } from '../types.ts';
import { h } from './lib.ts';
import { css, library, seedNext } from './office.ts';

// apps/reel.go View: the reel as a deck's text
interface View {
    text: string;
}

const reel: Start<View> = (ctx, view) => {
    const box = h('div', { class: 'office' });
    const bar = h('div', { class: 'office-bar' });
    const page = h('div', { class: 'office-page' });
    box.append(bar, page);
    ctx.layer.append(box);
    let text = view.text,
        mounted: Mounted | null = null,
        stopped = false;
    const make = h(
        'button',
        {
            title: 'Copy the reel into Slides, where everyone can write on it',
            on: {
                click: () => {
                    seedNext('deck', text);
                    ctx.open('deck');
                },
            },
        },
        'Make it slides',
    );
    bar.append(make);

    (async () => {
        css(); // office.js holds the library's loading
        const { editors } = await library(ctx.base);
        if (stopped) return;
        mounted = await editors.mount('deck', text, page, () => {}, { readOnly: true, fill: true });
    })();

    return {
        view(v) {
            text = v.text;
            if (mounted) mounted.editor.value = text;
        },
        stop() {
            stopped = true;
        },
    };
};
export default reel;
