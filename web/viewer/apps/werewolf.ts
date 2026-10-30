// Werewolf (apps/werewolf.go): the host narrates; wolves eat at night, the village votes by day.
import type { Start } from '../types.ts';
import * as L from './lib.ts';

const h = L.h;

type Role = 'wolf' | 'seer' | 'villager';
// apps/werewolf.go View: past the lobby, the village as this viewer knows it (roles only where they may see them)
interface View {
    phase: 'lobby' | 'night' | 'day' | 'over';
    lobby: L.Lobby;
    news: string[] | null;
    role: Role | ''; // '': watching
    alive: boolean;
    players: { name: string; alive: boolean; role?: Role }[];
    left: number;
    winner: 'village' | 'wolves' | '';
    day: number;
    choices: { name: string }[];
    choice?: number;
    counts?: number[]; // the day's votes, or the wolves' at night (one more: nobody)
    seeing?: string;
}
type Out = L.LobbyMsg | { kind: 'kill' | 'see' | 'exile'; i: number };

const werewolf: Start<View, never, Out> = (ctx, view) => {
    const ROLE: Record<Role, string> = {
        wolf: 'a WEREWOLF. At night, choose someone to eat with the other wolves.',
        seer: 'the SEER. At night, choose someone to learn what they are.',
        villager: 'a VILLAGER. Find the wolves and vote them out by day.',
    };
    const m = L.mount<View, Out>(ctx, 'cover', (v, kit) => {
        if (v.phase === 'lobby')
            return L.lobby(v.lobby, kit, 'Werewolf', 'Four or more. Wolves hide among the village; each night they eat someone, each day everyone argues in the chat and votes someone out.');
        const choose = (kind: 'kill' | 'see' | 'exile', extra?: boolean) =>
            h(
                'div',
                {},
                v.choices.map((c, i) => L.button(`${c.name}${v.counts ? ` (${v.counts[i]})` : ''}`, () => kit.send({ kind, i }), { on: v.choice === i })),
                extra ? L.button(`Nobody${v.counts ? ` (${v.counts[v.choices.length]})` : ''}`, () => kit.send({ kind, i: v.choices.length }), { on: v.choice === v.choices.length }) : null,
            );
        let act: L.Kid = null;
        if (v.phase === 'over') act = h('p', {}, h('b', {}, v.winner === 'village' ? 'The village wins.' : 'The wolves win.'));
        else if (!v.role) act = h('p', { class: 'muted' }, "You're watching this one.");
        else if (!v.alive) act = h('p', { class: 'muted' }, "You're out. Watch, and keep quiet in the chat.");
        else if (v.phase === 'night' && v.role === 'wolf') act = [h('h3', {}, 'Who do you eat?'), choose('kill')];
        else if (v.phase === 'night' && v.role === 'seer') act = v.seeing ? h('p', {}, `You'll learn about ${v.seeing} at dawn.`) : [h('h3', {}, 'Who do you look into?'), choose('see')];
        else if (v.phase === 'night') act = h('p', {}, 'You sleep. Something moves in the dark.');
        else act = [h('h3', {}, 'Who should leave the village?'), choose('exile', true)];
        return [
            h('h2', {}, v.phase === 'night' ? '☾ Night' : v.phase === 'day' ? `☀ Day ${v.day}` : 'Werewolf', v.phase !== 'over' ? [' — ', L.timer(v.left)] : null),
            v.role ? h('p', {}, 'You are ', ROLE[v.role]) : null,
            h(
                'div',
                {},
                v.news!.map((n) => h('p', {}, n)),
            ),
            act,
            h('h3', {}, 'The village'),
            h(
                'p',
                {},
                v.players.map((p) => h('span', { style: p.alive ? '' : 'text-decoration:line-through;opacity:.45' }, p.name, p.role ? ` (${p.role})` : '', '  ')),
            ),
        ];
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
export default werewolf;
