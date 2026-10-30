// Bingo (apps/bingo.go): a card of words from the movie's subtitles that fills
// itself in as they're said (or as the host calls them). Over the video.
import type { Start } from '../types.ts';
import { confetti, h, mount, type Kit } from './lib.ts';

// apps/bingo.go View: the card once it's dealt
interface View {
    movie: boolean;
    recent: string[] | null;
    winners: string[] | null;
    next: number;
    card?: string[]; // "" the free middle
    marked?: boolean[];
    won?: boolean;
}
type Event = { kind: 'bingo'; name: string };
type Out = { kind: 'card' };

const bingo: Start<View, Event, Out> = (ctx, view) => {
    const m = mount<View, Out>(ctx, 'cover', (v, kit) => [
        h('h2', {}, 'Bingo'),
        v.card
            ? h(
                  'div',
                  { class: 'grid', style: 'grid-template-columns:repeat(5,minmax(0,5.5em));grid-auto-rows:3.4em;font-size:0.85em' },
                  v.card.map((w, i) => h('div', { class: v.marked![i] ? 'cell lit' : 'cell' }, w || '★')),
              )
            : h('p', {}, L_wait(kit)),
        v.won ? h('p', { style: 'font-size:1.6em' }, h('b', {}, 'BINGO! 🎉')) : null,
        h('p', { class: 'muted' }, v.movie ? "Words fill in as they're said." : 'Words are called every few seconds.'),
        v.recent && v.recent.length ? h('p', {}, 'Heard: ', v.recent.join(', ')) : null,
        v.winners && v.winners.length ? h('p', {}, 'Bingo: ', v.winners.join(', ')) : null,
    ]);
    function L_wait(kit: Kit<Out>) {
        kit.send({ kind: 'card' });
        return 'Dealing your card…';
    }
    m.draw(view);
    return {
        view: m.draw,
        message(e) {
            if (e.kind !== 'bingo') return;
            m.kit.note(`${e.name} has BINGO!`);
            confetti(ctx, e.name === ctx.me().name ? 140 : 50);
        },
    };
};
export default bingo;
