// Graffiti (apps/graffiti.go): everyone draws on the video. What you draw shows
// at once, and again when the host sends it back to all. A minute after the
// first line, the page turns: it goes into the Graffiti Reel, and fades here.
import type { Start } from '../types.ts';
import { sketch, type Stroke, type StrokeMsg } from './lib.ts';

// apps/graffiti.go View, and its events
interface View {
    lines: Stroke[];
}
type Event = { kind: 'line'; line: Stroke } | { kind: 'turn' };

const graffiti: Start<View, Event, StrokeMsg> = (ctx, view) => {
    const s = sketch(ctx, view.lines);
    s.canvas.style.transition = 'opacity 1.2s';
    let fading: ReturnType<typeof setTimeout> | undefined,
        fresh: Stroke[] = []; // lines on the next page, while the last one fades
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
                    fading = undefined;
                    s.canvas.style.opacity = '1';
                }, 1200);
            }
        },
        resize: s.resize,
        stop() {
            clearTimeout(fading);
            s.stop();
        },
    };
};
export default graffiti;
