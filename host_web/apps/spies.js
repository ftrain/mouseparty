// Built from web/viewer/apps/spies.ts by `npm run build` (vite.config.ts): change it there.
import { button, confetti, field, h as h$1, lobby, mount, timer } from "./lib.js";
const h = h$1;
const spies = (ctx, view) => {
	const COLOR = {
		red: "#ff4d5e",
		blue: "#3ea6ff",
		neutral: "#d9cfb8",
		assassin: "#111"
	};
	const m = mount(ctx, "cover", (v, kit) => {
		if (v.phase === "lobby") return lobby(v.lobby, kit, "Spies", "Two teams. Each spymaster knows which words are their agents and gives one-word clues with a number; their team picks the words. Avoid the assassin.");
		const myGo = v.team === v.turn && v.phase === "guess" && !v.master;
		const cards = h("div", {
			class: "grid",
			style: "grid-template-columns:repeat(5,minmax(0,8em));grid-auto-rows:3.6em;font-size:0.9em"
		}, v.cards.map((c, i) => h("div", {
			class: "cell",
			style: c.revealed ? `background:${COLOR[c.color]};color:${c.color === "neutral" ? "#222" : "#fff"};text-shadow:none;opacity:.85` : (c.color ? `border:0.2em solid ${COLOR[c.color]};` : "") + (myGo ? "cursor:pointer" : ""),
			on: { click: () => {
				if (myGo && !c.revealed) kit.send({
					kind: "pick",
					i
				});
			} }
		}, c.word.toUpperCase())));
		let status;
		if (v.phase === "over") status = h("p", {}, h("b", {}, `${v.winner.toUpperCase()} WINS. `), v.why);
		else if (v.phase === "clue") status = v.master && v.team === v.turn ? h("p", {}, "Your clue: ", field(kit, "clue", "one word", { size: 14 }), field(kit, "n", "how many", {
			size: 6,
			max: 1
		}), button("Give", () => kit.send({
			kind: "clue",
			word: kit.keep("clue").value,
			n: Number(kit.keep("n").value) || 0
		})), " ", timer(v.left)) : h("p", {}, `${v.turn.toUpperCase()}'s spymaster is thinking… `, timer(v.left));
		else status = h("p", {}, `${v.turn.toUpperCase()}: `, h("b", {}, `${v.clue.toUpperCase()} ${v.number}`), ` · ${v.guesses} guesses left · `, timer(v.left), " ", myGo ? button("End turn", () => kit.send({ kind: "pass" })) : null);
		return [
			h("h2", {}, "Spies", v.team ? ` — you're ${v.team.toUpperCase()}${v.master ? ", spymaster" : ""}` : " — watching"),
			status,
			cards,
			h("div", { class: "cols" }, ["red", "blue"].map((t) => h("div", {}, h("h3", { style: `color:${COLOR[t]}` }, `${t.toUpperCase()} · ${v.remaining[t]} to find`), h("p", {}, v.teams[t].join(", ")))))
		];
	});
	let phase = view.phase;
	m.draw(view);
	return {
		view(v) {
			if (v.phase === "over" && phase !== "over") confetti(ctx, v.winner === v.team ? 140 : 40);
			phase = v.phase;
			m.draw(v);
		},
		message(e) {
			if (e.kind === "nope") m.kit.note(e.why);
		}
	};
};
export { spies as default };
