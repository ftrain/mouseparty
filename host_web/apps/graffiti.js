// Built from web/viewer/apps/graffiti.ts by `npm run build` (vite.config.ts): change it there.
import { sketch } from "./lib.js";
const graffiti = (ctx, view) => {
	const s = sketch(ctx, view.lines, { askFirst: true });
	s.canvas.style.transition = "opacity 1.2s";
	let fading, fresh = [];
	return {
		message(m) {
			if (fading && m.kind === "line") fresh.push(m.line);
			else if (fading && m.kind === "erase") fresh = fresh.filter((l) => !m.ids.includes(l.i));
			else if (fading && m.kind === "clear") fresh = [];
			else if (m.kind === "turn") {
				clearTimeout(fading);
				s.canvas.style.opacity = "0";
				fading = setTimeout(() => {
					s.clear();
					fresh.forEach(s.line);
					fresh = [];
					fading = void 0;
					s.canvas.style.opacity = "1";
				}, 1200);
			} else s.event(m);
		},
		resize: s.resize,
		stop() {
			clearTimeout(fading);
			s.stop();
		}
	};
};
export { graffiti as default };
