// Bingo (apps/bingo.go): a card of words from the movie's subtitles that fills
// itself in as they're said (or as the host calls them). Over the video.
MouseParty.apps.bingo = (ctx, view) => {
    const { h, mount } = MouseParty.lib;
    const m = mount(ctx, 'cover', (v, kit) => [
        h('h2', {}, 'Bingo'),
        v.card ? h('div', { class: 'grid', style: 'grid-template-columns:repeat(5,minmax(0,5.5em));grid-auto-rows:3.4em;font-size:0.85em' },
            v.card.map((w, i) => h('div', { class: v.marked[i] ? 'cell lit' : 'cell' }, w || '★')))
            : h('p', {}, L_wait(kit)),
        v.won ? h('p', { style: 'font-size:1.6em' }, h('b', {}, 'BINGO! 🎉')) : null,
        h('p', { class: 'muted' }, v.movie ? 'Words fill in as they\'re said.' : 'Words are called every few seconds.'),
        v.recent && v.recent.length ? h('p', {}, 'Heard: ', v.recent.join(', ')) : null,
        v.winners && v.winners.length ? h('p', {}, 'Bingo: ', v.winners.join(', ')) : null,
    ]);
    function L_wait(kit) { kit.send({ kind: 'card' }); return 'Dealing your card…'; }
    m.draw(view);
    return {
        view: m.draw,
        message(e) {
            if (e.kind !== 'bingo') return;
            m.kit.note(`${e.name} has BINGO!`);
            MouseParty.lib.confetti(ctx, e.name === ctx.me().name ? 140 : 50);
        },
    };
};
