// Built from web/viewer/apps/blanks.ts by `npm run build` (vite.config.ts): change it there.
import { board, button, confetti, h as h$1, input, mount, timer } from "./lib.js";
const h = h$1;
const blanks = (ctx, view) => {
	const m = mount(ctx, "cover", (v, kit) => {
		const out = [h("h2", {}, "Blanks"), h("p", { style: "font-size:1.45em;line-height:1.3" }, v.prompt)];
		if (v.phase === "write") {
			out.push(h("p", {}, "Fill it in: ", timer(v.left), ` · ${v.answered} answered`));
			if (v.named) out.push(input(kit, "answer", "Your answer, Enter", (t) => kit.send({
				kind: "answer",
				text: t
			}), {
				max: 80,
				size: 40
			}));
			else out.push(h("p", { class: "muted" }, "Join the chat to play."));
			if (v.mine) out.push(h("p", {}, "Yours: ", h("b", {}, v.mine), h("span", { class: "muted" }, " (send another to change it)")));
		} else {
			out.push(h("p", {}, v.phase === "vote" ? ["Vote for the best: ", timer(v.left)] : "Results"));
			v.entries.forEach((e, i) => out.push(h("div", { style: "margin:4px 0" }, v.phase === "vote" ? button(e.text, () => kit.send({
				kind: "vote",
				i
			}), {
				disabled: e.yours,
				on: v.choice === i
			}) : h("span", {}, h("b", {}, e.text), ` — ${e.name}, `, "★".repeat(e.votes) || "no votes"))));
		}
		out.push(board(v.board));
		return out;
	});
	let phase = view.phase;
	m.draw(view);
	return { view(v) {
		if (v.phase === "results" && phase !== "results" && v.entries.some((e) => e.votes)) confetti(ctx, 50);
		phase = v.phase;
		m.draw(v);
	} };
};
export { blanks as default };
