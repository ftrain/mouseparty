// Graffiti (apps/graffiti.go): everyone draws on the video. What you draw shows
// at once, and again when the host sends it back to all. A minute after the
// first line, the page turns: it goes into the Graffiti Reel, and fades here.
// The eraser rubs out any line it touches, undo takes back your own last one,
// and clear (pressed twice: the wall is everyone's) wipes it, chat saying who.
import type { Start } from '../types.ts';
import { sketch, type Stroke, type StrokeMsg, type WallEvent } from './lib.ts';

// apps/graffiti.go View, and its events
interface View {
    lines: Stroke[];
}
type Event = WallEvent | { kind: 'turn' };

const graffiti: Start<View, Event, StrokeMsg> = (ctx, view) => {
    const s = sketch(ctx, view.lines, { askFirst: true });
    s.canvas.style.transition = 'opacity 1.2s';
    let fading: ReturnType<typeof setTimeout> | undefined,
        fresh: Stroke[] = []; // lines on the next page, while the last one fades
    return {
        message(m) {
            if (fading && m.kind === 'line') fresh.push(m.line);
            else if (fading && m.kind === 'erase') fresh = fresh.filter((l) => !m.ids.includes(l.i!));
            else if (fading && m.kind === 'clear') fresh = [];
            else if (m.kind === 'turn') {
                clearTimeout(fading);
                s.canvas.style.opacity = '0';
                fading = setTimeout(() => {
                    s.clear();
                    fresh.forEach(s.line);
                    fresh = [];
                    fading = undefined;
                    s.canvas.style.opacity = '1';
                }, 1200);
            } else s.event(m);
        },
        resize: s.resize,
        stop() {
            clearTimeout(fading);
            s.stop();
        },
    };
};
export default graffiti;
