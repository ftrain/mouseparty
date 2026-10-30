// Werewolf (apps/werewolf.go): the host narrates; wolves eat at night, the village votes by day.
MouseParty.apps.werewolf = (ctx, view) => {
    const L = MouseParty.lib, h = L.h;
    const ROLE = { wolf: 'a WEREWOLF. At night, choose someone to eat with the other wolves.', seer: 'the SEER. At night, choose someone to learn what they are.', villager: 'a VILLAGER. Find the wolves and vote them out by day.' };
    const m = L.mount(ctx, 'cover', (v, kit) => {
        if (v.phase === 'lobby') return L.lobby(v.lobby, kit, 'Werewolf', 'Four or more. Wolves hide among the village; each night they eat someone, each day everyone argues in the chat and votes someone out.');
        const choose = (kind, extra) => h('div', {}, v.choices.map((c, i) => L.button(`${c.name}${v.counts ? ` (${v.counts[i]})` : ''}`, () => kit.send({ kind, i }), { on: v.choice === i })),
            extra ? L.button(`Nobody${v.counts ? ` (${v.counts[v.choices.length]})` : ''}`, () => kit.send({ kind, i: v.choices.length }), { on: v.choice === v.choices.length }) : null);
        let act = null;
        if (v.phase === 'over') act = h('p', {}, h('b', {}, v.winner === 'village' ? 'The village wins.' : 'The wolves win.'));
        else if (!v.role) act = h('p', { class: 'muted' }, 'You\'re watching this one.');
        else if (!v.alive) act = h('p', { class: 'muted' }, 'You\'re out. Watch, and keep quiet in the chat.');
        else if (v.phase === 'night' && v.role === 'wolf') act = [h('h3', {}, 'Who do you eat?'), choose('kill')];
        else if (v.phase === 'night' && v.role === 'seer') act = v.seeing ? h('p', {}, `You'll learn about ${v.seeing} at dawn.`) : [h('h3', {}, 'Who do you look into?'), choose('see')];
        else if (v.phase === 'night') act = h('p', {}, 'You sleep. Something moves in the dark.');
        else act = [h('h3', {}, 'Who should leave the village?'), choose('exile', true)];
        return [h('h2', {}, v.phase === 'night' ? '☾ Night' : v.phase === 'day' ? `☀ Day ${v.day}` : 'Werewolf', v.phase !== 'over' ? [' — ', L.timer(v.left)] : null),
            v.role ? h('p', {}, 'You are ', ROLE[v.role]) : null,
            h('div', {}, v.news.map((n) => h('p', {}, n))),
            act,
            h('h3', {}, 'The village'),
            h('p', {}, v.players.map((p) => h('span', { style: p.alive ? '' : 'text-decoration:line-through;opacity:.45' }, p.name, p.role ? ` (${p.role})` : '', '  ')))];
    });
    let phase = view.phase;
    m.draw(view);
    return {
        view(v) {
            if (v.phase === 'over' && phase !== 'over') L.confetti(ctx, 100);
            phase = v.phase;
            m.draw(v);
        },
    };
};
