// Spies (apps/spies.go): spymasters give one-word clues; their team finds their agents.
TubeYap.apps.spies = (ctx, view) => {
    const L = TubeYap.lib, h = L.h;
    const COLOR = { red: '#d33', blue: '#36c', neutral: '#ccc', assassin: '#000' };
    const m = L.mount(ctx, 'cover', (v, kit) => {
        if (v.phase === 'lobby') return L.lobby(v.lobby, kit, 'Spies', 'Two teams. Each spymaster knows which words are their agents and gives one-word clues with a number; their team picks the words. Avoid the assassin.');
        const myGo = v.team === v.turn && v.phase === 'guess' && !v.master;
        const cards = h('div', { class: 'grid', style: 'grid-template-columns:repeat(5,110px);grid-auto-rows:52px' },
            v.cards.map((c, i) => h('div', {
                class: 'cell',
                style: c.revealed ? `background:${COLOR[c.color]};color:${c.color === 'neutral' ? '#000' : '#fff'};text-decoration:line-through`
                    : c.color ? `border:3px solid ${COLOR[c.color]};${myGo ? 'cursor:pointer' : ''}` : (myGo ? 'cursor:pointer' : ''),
                on: { click: () => { if (myGo && !c.revealed) kit.send({ kind: 'pick', i }); } },
            }, c.word.toUpperCase())));
        let status;
        if (v.phase === 'over') status = h('p', {}, h('b', {}, `${v.winner.toUpperCase()} WINS. `), v.why);
        else if (v.phase === 'clue') {
            status = v.master && v.team === v.turn
                ? h('p', {}, 'Your clue: ', L.field(kit, 'clue', 'one word', { size: 14 }),
                    L.field(kit, 'n', 'how many', { size: 6, max: 1 }),
                    L.button('Give', () => kit.send({ kind: 'clue', word: kit.keep('clue').value, n: Number(kit.keep('n').value) || 0 })), ' ', L.timer(v.left))
                : h('p', {}, `${v.turn.toUpperCase()}'s spymaster is thinking… `, L.timer(v.left));
        } else {
            status = h('p', {}, `${v.turn.toUpperCase()}: `, h('b', {}, `${v.clue.toUpperCase()} ${v.number}`), ` · ${v.guesses} guesses left · `, L.timer(v.left), ' ',
                myGo ? L.button('End turn', () => kit.send({ kind: 'pass' })) : null);
        }
        return [h('h2', {}, 'Spies', v.team ? ` — you're ${v.team.toUpperCase()}${v.master ? ', spymaster' : ''}` : ' — watching'),
            status, cards,
            h('div', { class: 'cols' }, ['red', 'blue'].map((t) => h('div', {},
                h('h3', { style: `color:${COLOR[t]}` }, `${t.toUpperCase()} · ${v.remaining[t]} to find`), h('p', {}, v.teams[t].join(', ')))))];
    });
    m.draw(view);
    return { view: m.draw, message(e) { if (e.kind === 'nope') m.kit.note(e.why); } };
};
