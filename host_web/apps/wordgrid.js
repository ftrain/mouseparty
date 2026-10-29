// Word Grid (apps/wordgrid.go): find words in the letter grid; unique ones score.
TubeYap.apps.wordgrid = (ctx, view) => {
    const L = TubeYap.lib, h = L.h;
    const m = L.mount(ctx, 'cover', (v, kit) => {
        const grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(4,56px);grid-auto-rows:56px;font-size:24px' },
            v.grid.map((l) => h('div', { class: 'cell' }, l === 'qu' ? 'Qu' : l.toUpperCase())));
        if (v.phase === 'results') {
            return [h('h2', {}, 'Word Grid — results (next grid in ', L.timer(v.left), ')'),
                h('div', { class: 'cols' }, grid, h('div', {}, v.results.map((r) => h('p', {}, h('b', {}, `${r.name} ${r.score}: `),
                    r.words.map((w) => h('span', { style: w.unique ? '' : 'text-decoration:line-through;color:#999' }, w.word + ' '))))),
                L.board(v.board, 'Total'))];
        }
        return [h('h2', {}, 'Word Grid — ', L.timer(v.left)),
            h('p', { class: 'muted' }, 'Chain neighbouring letters (each once) into words of three or more. Only words nobody else finds score.'),
            h('div', { class: 'cols' }, grid, h('div', {},
                v.named ? L.input(kit, 'word', 'Type a word, Enter', (w) => kit.send({ kind: 'word', word: w })) : h('p', { class: 'muted' }, 'Join the chat to play.'),
                h('h3', {}, `Yours (${v.mine.length})`), h('p', {}, v.mine.join(' ')),
                h('h3', {}, 'Everyone'), h('p', {}, v.counts.map((c) => `${c.name} ${c.found}`).join(' · ')))),
        ];
    });
    m.draw(view);
    return { view: m.draw, message(e) { if (e.kind === 'said' && e.why) m.kit.note(`${e.word.toUpperCase()}: ${e.why}`); } };
};
