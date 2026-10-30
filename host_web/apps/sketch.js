// Built from web/viewer/apps/sketch.ts by `npm run build` (vite.config.ts): change it there.
import { board, h as h$1, input, lobby, mount, sketch as sketch$1, timer } from "./lib.js";
const h = h$1;
const sketch = (ctx, view) => {
	let v = view;
	const pad = sketch$1(ctx, view.lines || [], {
		paper: true,
		canDraw: () => v.drawing && v.phase === "draw",
		clear: () => ctx.send({ kind: "clear" }),
		color: 5
	});
	const lobby$1 = mount(ctx, "cover", (v, kit) => v.phase === "lobby" ? lobby(v.lobby, kit, "Sketch", "Take turns drawing a word while everyone else guesses it. Sooner is more points; the artist scores for each right guess.") : [
		h("h2", {}, "Game over"),
		board(v.board),
		h("p", { class: "muted" }, "Back to the lobby in a moment.")
	]);
	const side = mount(ctx, "tr", (v, kit) => [
		h("p", {}, v.drawing ? ["Draw: ", h("b", {}, v.word.toUpperCase())] : v.word ? ["It was ", h("b", {}, v.word.toUpperCase())] : [`${v.drawer} is drawing: `, h("b", {}, v.hint)]),
		h("p", {}, v.phase === "draw" ? timer(v.left) : "Next turn soon"),
		v.playing && !v.drawing && !v.word && v.phase === "draw" ? input(kit, "guess", "Guess, Enter", (g) => kit.send({
			kind: "guess",
			guess: g
		})) : null,
		v.feed && v.feed.length ? h("div", {}, v.feed.map((f) => h("div", {}, f))) : null,
		board(v.board)
	]);
	const show = (nv) => {
		v = nv;
		const playing = v.phase === "draw" || v.phase === "reveal";
		const was = pad.canvas.style.display !== "none";
		lobby$1.box.style.display = playing ? "none" : "";
		side.box.style.display = pad.canvas.style.display = playing ? "" : "none";
		pad.showTools(playing && v.drawing && v.phase === "draw");
		if (playing && !was) pad.resize();
		(playing ? side : lobby$1).draw(v);
	};
	show(view);
	return {
		view: show,
		message(e) {
			if (e.kind === "line") pad.line(e.line);
			else if (e.kind === "clear") pad.clear();
		},
		resize: pad.resize,
		stop: pad.stop
	};
};
export { sketch as default };
