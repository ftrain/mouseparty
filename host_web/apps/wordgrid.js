// Built from web/viewer/apps/wordgrid.ts by `npm run build` (vite.config.ts): change it there.
import { board, button, confetti, h as h$1, input, mount, timer } from "./lib.js";
const h = h$1;
const wordgrid = (ctx, view) => {
	const path = (grid, w) => {
		const from = (i, rest, used) => {
			if (used.includes(i) || !rest.startsWith(grid[i])) return null;
			used = [...used, i];
			rest = rest.slice(grid[i].length);
			if (!rest) return used;
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
				const r = Math.floor(i / 4) + dr, c = i % 4 + dc;
				if ((dr || dc) && r >= 0 && r < 4 && c >= 0 && c < 4) {
					const p = from(r * 4 + c, rest, used);
					if (p) return p;
				}
			}
			return null;
		};
		for (let i = 0; i < 16; i++) {
			const p = from(i, w, []);
			if (p) return p;
		}
		return null;
	};
	let input$1 = null;
	const typed = () => input$1 ? input$1.value.toLowerCase().replace(/[^a-z]/g, "") : "";
	const m = mount(ctx, "cover", (v, kit) => {
		if (!input$1 && v.named) {
			input$1 = input(kit, "word", "Type a word, Enter", (w) => kit.send({
				kind: "word",
				word: w
			}), { size: 18 });
			input$1.addEventListener("input", () => m.redraw());
			input$1.style.fontSize = "1.3em";
			input$1.style.textTransform = "uppercase";
		}
		const field = input$1;
		const w = v.phase === "play" ? typed() : "";
		const lit = w ? path(v.grid, w) : null;
		if (field) field.style.borderColor = w && !lit ? "#ff4d5e" : "";
		const grid = h("div", {
			class: "grid",
			style: "grid-template-columns:repeat(4,2.3em);grid-auto-rows:2.3em;font-size:min(2em, 6.5cqh, 8cqw);font-weight:800"
		}, v.grid.map((l, i) => {
			const k = lit ? lit.indexOf(i) : -1;
			return h("div", {
				class: k >= 0 ? "cell lit" : "cell",
				style: field && v.phase === "play" ? "cursor:pointer;position:relative" : "position:relative",
				on: { click: () => {
					if (!input$1 || v.phase !== "play") return;
					input$1.value += l;
					input$1.focus();
					m.redraw();
				} }
			}, l === "qu" ? "Qu" : l.toUpperCase(), k >= 0 ? h("sub", { style: "position:absolute;right:0.2em;bottom:0.1em;font-size:0.35em" }, k + 1) : null);
		}));
		if (v.phase === "results") return [h("h2", {}, "Word Grid — results (next grid in ", timer(v.left), ")"), h("div", { class: "cols" }, grid, h("div", {}, v.results.map((r) => h("p", {}, h("b", {}, `${r.name} ${r.score}: `), r.words.map((x) => h("span", { style: x.unique ? "" : "text-decoration:line-through;opacity:.45" }, x.word + " "))))), board(v.board, "Total"))];
		return [
			h("h2", {}, "Word Grid — ", timer(v.left)),
			h("p", {
				class: "muted",
				style: "font-size:0.85em"
			}, "Spell words of three or more letters by chaining neighbouring dice (sideways, up, down or diagonally; each die once). Type or click the letters, then Enter. Only words nobody else finds score; longer ones score more."),
			h("div", { class: "cols" }, grid, h("div", {}, field ? h("div", {}, field, " ", button("Clear", () => {
				field.value = "";
				field.focus();
				m.redraw();
			})) : h("p", { class: "muted" }, "Join the chat to play."), w && !lit ? h("p", { style: "color:#ff4d5e" }, "Not in the grid") : null, h("h3", {}, `Yours (${v.mine.length})`), h("p", {}, v.mine.map((x) => x.toUpperCase()).join(" ")), h("h3", {}, "Everyone"), h("p", {}, v.counts.length ? v.counts.map((c) => `${c.name} ${c.found}`).join(" · ") : "Nobody has found one yet.")))
		];
	});
	m.draw(view);
	return {
		view: m.draw,
		message(e) {
			if (e.kind !== "said") return;
			m.kit.note(e.why ? `${e.word.toUpperCase()}: ${e.why}` : `✓ ${e.word.toUpperCase()}`);
			if (!e.why) confetti(ctx, 12 + 6 * e.word.length);
			m.redraw();
		}
	};
};
export { wordgrid as default };
