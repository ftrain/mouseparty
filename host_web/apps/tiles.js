// Tiles (apps/tiles.go): the crossword tile game. Click a tile in your rack, then
// a square; click a placed tile to take it back; Play when the word is down.
OpenHouseParty.apps.tiles = (ctx, view) => {
    const L = OpenHouseParty.lib, h = L.h;
    let pick = null;       // the rack index picked up
    let placed = [];       // [{r, c, l, k}] laid this turn, k its rack index
    let swapping = null;   // rack indexes chosen to swap, while choosing
    let rackSeen = '';
    const PREMIUM = { T: ['rgb(255 77 94 / .75)', 'TW'], D: ['rgb(255 95 162 / .45)', 'DW'], t: ['rgb(62 166 255 / .75)', 'TL'], d: ['rgb(62 224 255 / .35)', 'DL'] };
    const m = L.mount(ctx, 'cover', (v, kit) => {
        if (v.phase === 'lobby') return L.lobby(v.lobby, kit, 'Tiles', 'Two to four players. Make words on the board from your seven tiles; premium squares double and triple; all seven at once is 50 more.');
        if (v.rack !== rackSeen) { rackSeen = v.rack; placed = []; pick = null; swapping = null; }
        const used = new Set(placed.map((p) => p.k));
        const board = h('div', { class: 'grid', style: 'grid-template-columns:repeat(15,1.9em);grid-auto-rows:1.9em;gap:0.12em;font-size:min(1em, 3.4cqh)' });
        v.grid.forEach((row, r) => [...row].forEach((ch, c) => {
            const mine = placed.find((p) => p.r === r && p.c === c);
            const prem = PREMIUM[v.premium[r][c]];
            const letter = ch !== '.' ? ch : mine ? mine.l : '';
            board.append(h('div', {
                class: 'cell',
                style: letter ? `background:${mine ? '#ffe28a' : '#f3d9a4'};color:#3a2a00;text-shadow:none;font-weight:800;border-color:transparent;cursor:${mine ? 'pointer' : 'default'}${mine ? ';box-shadow:0 0 0.5em var(--yellow)' : ''}`
                    : prem ? `background:${prem[0]};font-size:0.55em;cursor:pointer` : (r === 7 && c === 7 ? 'background:rgb(255 95 162 / .45);cursor:pointer' : 'cursor:pointer'),
                on: { click: () => {
                    if (mine) { placed = placed.filter((p) => p !== mine); m.redraw(); return; }
                    if (ch === '.' && pick !== null && v.mine) { placed.push({ r, c, l: v.rack[pick], k: pick }); pick = null; m.redraw(); }
                } },
            }, letter || (prem ? prem[1] : r === 7 && c === 7 ? '★' : '')));
        }));
        const rack = h('div', {}, [...v.rack].map((l, k) => used.has(k) ? null : h('button', {
            class: (pick === k || (swapping && swapping.has(k))) ? 'on' : '',
            style: 'width:2.3em;height:2.3em;padding:0;border-radius:0.35em;font-weight:800;background:#f3d9a4;color:#3a2a00;text-shadow:none',
            on: { click: () => {
                if (swapping) { swapping.has(k) ? swapping.delete(k) : swapping.add(k); } else { pick = pick === k ? null : k; }
                m.redraw();
            } },
        }, l, h('sub', { style: 'font-size:0.5em' }, v.values[l]))));
        const acts = !v.mine ? h('p', {}, `${v.turn}'s turn `, L.timer(v.left))
            : swapping ? h('p', {}, L.button(`Swap ${swapping.size}`, () => kit.send({ kind: 'swap', letters: [...swapping].map((k) => v.rack[k]).join('') }), { disabled: !swapping.size }),
                L.button('Cancel', () => { swapping = null; m.redraw(); }))
            : h('p', {}, 'Your turn ', L.timer(v.left), ' ',
                L.button('Play', () => kit.send({ kind: 'play', tiles: placed.map((p) => ({ r: p.r, c: p.c, l: p.l })) }), { disabled: !placed.length }),
                L.button('Take back', () => { placed = []; m.redraw(); }, { disabled: !placed.length }),
                L.button('Swap…', () => { placed = []; swapping = new Set(); m.redraw(); }, { disabled: v.bag < 1 }),
                L.button('Pass', () => kit.send({ kind: 'pass' })));
        return [h('div', { class: 'cols' }, board, h('div', {},
            h('h2', {}, v.phase === 'over' ? 'Game over' : 'Tiles'),
            v.last ? h('p', {}, v.last) : null,
            v.rack ? [h('h3', {}, 'Your tiles'), rack, acts] : h('p', {}, `${v.turn}'s turn `, L.timer(v.left)),
            h('p', { class: 'muted' }, `${v.bag} in the bag`),
            L.board(v.board)))];
    });
    m.draw(view);
    return { view: m.draw, message(e) { if (e.kind === 'nope') m.kit.note(e.why); } };
};
