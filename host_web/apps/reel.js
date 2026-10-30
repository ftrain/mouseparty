// Built from web/viewer/apps/reel.ts by `npm run build` (vite.config.ts): change it there.
import { h } from "./lib.js";
import { css, library, seedNext } from "./office.js";
const reel = (ctx, view) => {
	const box = h("div", { class: "office" });
	const bar = h("div", { class: "office-bar" });
	const page = h("div", { class: "office-page" });
	box.append(bar, page);
	ctx.layer.append(box);
	let text = view.text, mounted = null, stopped = false;
	const make = h("button", {
		title: "Copy the reel into Slides, where everyone can write on it",
		on: { click: () => {
			seedNext("deck", text);
			ctx.open("deck");
		} }
	}, "Make it slides");
	bar.append(make);
	(async () => {
		css();
		const { editors } = await library(ctx.base);
		if (stopped) return;
		mounted = await editors.mount("deck", text, page, () => {}, {
			readOnly: true,
			fill: true
		});
	})();
	return {
		view(v) {
			text = v.text;
			if (mounted) mounted.editor.value = text;
		},
		stop() {
			stopped = true;
		}
	};
};
export { reel as default };
