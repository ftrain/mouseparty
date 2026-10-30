// Built from web/viewer/apps/graffiti.ts by `npm run build` (vite.config.ts): change it there.
import { sketch } from "./lib.js";
const graffiti = (ctx, view) => {
	const s = sketch(ctx, view.lines);
	s.canvas.style.transition = "opacity 1.2s";
	let fading, fresh = [];
	return {
		message(m) {
			if (m.kind === "line") {
				if (fading) fresh.push(m.line);
				else s.line(m.line);
			} else if (m.kind === "turn") {
				clearTimeout(fading);
				s.canvas.style.opacity = "0";
				fading = setTimeout(() => {
					s.clear();
					fresh.forEach(s.line);
					fresh = [];
					fading = void 0;
					s.canvas.style.opacity = "1";
				}, 1200);
			}
		},
		resize: s.resize,
		stop() {
			clearTimeout(fading);
			s.stop();
		}
	};
};
export { graffiti as default };
