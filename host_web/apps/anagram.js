// Anagrams (apps/anagram.go): unscramble the word first. Over the video.
TubeYap.apps.anagram = (ctx, view) => {
    const L = TubeYap.lib, h = L.h;
    const m = L.mount(ctx, 'tc', (v, kit) => [
        h('div', { style: 'font-size:28px;letter-spacing:8px;margin:4px 0' }, v.letters.toUpperCase()),
        v.phase === 'guess'
            ? h('p', {}, v.named ? L.input(kit, 'guess', 'Unscramble it…', (g) => kit.send({ kind: 'guess', guess: g })) : h('span', { class: 'muted' }, 'Join the chat to play. '), ' ', L.timer(v.left))
            : h('p', {}, v.winner ? `${v.winner} got it: ` : 'Nobody got it: ', h('b', {}, v.answer.toUpperCase())),
        v.board.length ? h('p', { class: 'muted' }, v.board.slice(0, 5).map((p) => `${p.name} ${p.score}`).join(' · ')) : null,
    ]);
    m.draw(view);
    return { view: m.draw, message(e) { if (e.kind === 'wrong') m.kit.note(`Not ${e.guess.toUpperCase()}`); } };
};
