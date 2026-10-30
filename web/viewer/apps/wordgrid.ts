// Word Grid (apps/wordgrid.go): find words in the letter grid; unique ones score.
// Type a word (or click letters) and its path lights up; Enter sends it.
import type { Start } from '../types.ts';
import * as L from './lib.ts';

const h = L.h;

// apps/wordgrid.go View: the 16 dice, lower case ("qu" for the Q), and the results once time's up
interface View {
    phase: 'play' | 'results';
    left: number;
    grid: string[];
    mine: string[];
    counts: { name: string; found: number }[];
    results: { name: string; score: number; words: { word: string; unique: boolean }[] }[] | null;
    board: L.Player[];
    named: boolean;
}
type Event = { kind: 'said'; word: string; why: string };
type Out = { kind: 'word'; word: string };

const wordgrid: Start<View, Event, Out> = (ctx, view) => {
    // path: the dice spelling w, each a neighbour of the last and used once
    // (as apps/wordgrid.go's onGrid); null if there's none
    const path = (grid: string[], w: string) => {
        const from = (i: number, rest: string, used: number[]): number[] | null => {
            if (used.includes(i) || !rest.startsWith(grid[i])) return null;
            used = [...used, i];
            rest = rest.slice(grid[i].length);
            if (!rest) return used;
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    const r = Math.floor(i / 4) + dr,
                        c = (i % 4) + dc;
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

    let input: HTMLInputElement | null = null;
    const typed = () => (input ? input.value.toLowerCase().replace(/[^a-z]/g, '') : '');
    const m = L.mount<View, Out>(ctx, 'cover', (v, kit) => {
        if (!input && v.named) {
            input = L.input(kit, 'word', 'Type a word, Enter', (w) => kit.send({ kind: 'word', word: w }), { size: 18 });
            input.addEventListener('input', () => m.redraw());
            input.style.fontSize = '1.3em';
            input.style.textTransform = 'uppercase';
        }
        const field = input;
        const w = v.phase === 'play' ? typed() : '';
        const lit = w ? path(v.grid, w) : null;
        if (field) field.style.borderColor = w && !lit ? '#ff4d5e' : '';
        const grid = h(
            'div',
            { class: 'grid', style: 'grid-template-columns:repeat(4,2.3em);grid-auto-rows:2.3em;font-size:min(2em, 6.5cqh, 8cqw);font-weight:800' },
            v.grid.map((l, i) => {
                const k = lit ? lit.indexOf(i) : -1;
                return h(
                    'div',
                    {
                        class: k >= 0 ? 'cell lit' : 'cell',
                        style: field && v.phase === 'play' ? 'cursor:pointer;position:relative' : 'position:relative',
                        on: {
                            click: () => {
                                if (!input || v.phase !== 'play') return;
                                input.value += l;
                                input.focus();
                                m.redraw();
                            },
                        },
                    },
                    l === 'qu' ? 'Qu' : l.toUpperCase(),
                    k >= 0 ? h('sub', { style: 'position:absolute;right:0.2em;bottom:0.1em;font-size:0.35em' }, k + 1) : null,
                );
            }),
        );
        if (v.phase === 'results') {
            return [
                h('h2', {}, 'Word Grid — results (next grid in ', L.timer(v.left), ')'),
                h(
                    'div',
                    { class: 'cols' },
                    grid,
                    h(
                        'div',
                        {},
                        v.results!.map((r) =>
                            h(
                                'p',
                                {},
                                h('b', {}, `${r.name} ${r.score}: `),
                                r.words.map((x) => h('span', { style: x.unique ? '' : 'text-decoration:line-through;opacity:.45' }, x.word + ' ')),
                            ),
                        ),
                    ),
                    L.board(v.board, 'Total'),
                ),
            ];
        }
        return [
            h('h2', {}, 'Word Grid — ', L.timer(v.left)),
            h(
                'p',
                { class: 'muted', style: 'font-size:0.85em' },
                'Spell words of three or more letters by chaining neighbouring dice (sideways, up, down or diagonally; each die once). Type or click the letters, then Enter. Only words nobody else finds score; longer ones score more.',
            ),
            h(
                'div',
                { class: 'cols' },
                grid,
                h(
                    'div',
                    {},
                    field
                        ? h(
                              'div',
                              {},
                              field,
                              ' ',
                              L.button('Clear', () => {
                                  field.value = '';
                                  field.focus();
                                  m.redraw();
                              }),
                          )
                        : h('p', { class: 'muted' }, 'Join the chat to play.'),
                    w && !lit ? h('p', { style: 'color:#ff4d5e' }, 'Not in the grid') : null,
                    h('h3', {}, `Yours (${v.mine.length})`),
                    h('p', {}, v.mine.map((x) => x.toUpperCase()).join(' ')),
                    h('h3', {}, 'Everyone'),
                    h('p', {}, v.counts.length ? v.counts.map((c) => `${c.name} ${c.found}`).join(' · ') : 'Nobody has found one yet.'),
                ),
            ),
        ];
    });
    m.draw(view);
    return {
        view: m.draw,
        message(e) {
            if (e.kind !== 'said') return;
            m.kit.note(e.why ? `${e.word.toUpperCase()}: ${e.why}` : `✓ ${e.word.toUpperCase()}`);
            if (!e.why) L.confetti(ctx, 12 + 6 * e.word.length);
            m.redraw();
        },
    };
};
export default wordgrid;
