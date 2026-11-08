// The Settings window (Party > Settings…, ⌘,; prefs.go): the settings as controls in tabs,
// as a Mac app's Settings has them, each change kept as it's made (SetPrefs: the Go side says
// "" or why not, and a refused one is put back). Over the window, in its sheet (party.ts).
import type { Prefs } from './wails.d.ts';
import { askFrom, close } from './party.ts';

const App = () => window.go.main.App;

// an element, its properties set and its children in it (typed by its tag, plainly: party.ts's el is too fancy for these)
type Tags = { input: HTMLInputElement; select: HTMLSelectElement; option: HTMLOptionElement; button: HTMLButtonElement; form: HTMLFormElement };
function el<K extends string>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): K extends keyof Tags ? Tags[K] : HTMLElement {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e as K extends keyof Tags ? Tags[K] : HTMLElement;
}
const sheet = document.getElementById('sheet') as HTMLElement;

// Lucide icons (ISC: licenses/lucide/), as SVG
const svg = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS: Record<string, string> = {
    settings:
        '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

type Tab = { id: string; label: string; icon: string; draw: (p: Prefs) => HTMLElement[] };

const BITRATES: [number, string][] = [
    [800, 'Low: 800 kbit/s'],
    [1500, 'Standard: 1.5 Mbit/s'],
    [2500, 'High: 2.5 Mbit/s'],
    [4000, 'Very high: 4 Mbit/s'],
    [6000, 'Best: 6 Mbit/s'],
];
const PRESETS: [string, string][] = [
    ['ultrafast', 'Least'],
    ['superfast', 'Less'],
    ['veryfast', 'Standard'],
    ['faster', 'More'],
    ['fast', 'Much more'],
    ['medium', 'Most'],
];

let current = 'general';
let prefs: Prefs;

// a row of the form: its label on the left, the control and a note under it on the right
const row = (label: string, control: HTMLElement | HTMLElement[], note?: string) =>
    el(
        'div',
        { className: 'pref-row' },
        el('div', { className: 'pref-label', textContent: label }),
        el('div', { className: 'pref-control' }, ...(Array.isArray(control) ? control : [control]), ...(note ? [el('p', { className: 'pref-note', textContent: note })] : [])),
    );

const status = () => sheet.querySelector<HTMLElement>('.pref-status')!;

// keep a change: the Go side checks it; refused, the window is drawn again as things are
async function change(edit: (p: Prefs) => void, redraw = false) {
    const next = { ...prefs };
    edit(next);
    const why = await App().SetPrefs(next);
    if (why) {
        status().textContent = why;
        prefs = await App().Prefs();
        draw();
        status().textContent = why;
    } else {
        prefs = next;
        status().textContent = '';
        if (redraw) draw(); // what a note says follows it (the bandwidth's sums)
    }
}

function number(value: number, min: number, max: number, step: number, set: (p: Prefs, n: number) => void, unit: string) {
    const input = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), className: 'pref-number' });
    input.onchange = () => {
        const n = Number(input.value);
        if (input.value.trim() === '' || !Number.isFinite(n)) return void (input.value = String(value));
        void change((p) => set(p, n));
    };
    return el('span', { className: 'pref-inline' }, input, el('span', { textContent: unit }));
}

function select(options: [string, string][], value: string, set: (p: Prefs, v: string) => void) {
    const s = el('select', { className: 'pref-select' });
    for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }));
    if (!options.some(([v]) => v === value)) s.append(el('option', { value, textContent: value }));
    s.value = value;
    s.onchange = () => void change((p) => set(p, s.value), true);
    return s;
}

function checkbox(label: string, checked: boolean, set: (p: Prefs, on: boolean) => void) {
    const box = el('input', { type: 'checkbox', checked });
    box.onchange = () => void change((p) => set(p, box.checked));
    return el('label', { className: 'pref-check' }, box, el('span', { textContent: label }));
}

const button = (label: string, onclick: () => void, extra = '') => el('button', { type: 'button', className: `pref-button ${extra}`, textContent: label, onclick });

// what friends' upload adds up to, for the bandwidth's note
const mbit = (kbps: number) => (kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbit/s` : `${kbps} kbit/s`);

const TABS: Tab[] = [
    {
        id: 'general',
        label: 'General',
        icon: 'settings',
        draw: (p) => [
            row(
                'Countdown',
                number(p.countdown, 0, 600, 1, (q, n) => (q.countdown = n), 'seconds'),
                'An “up next” card before each movie, so everyone is ready. 0 for none; songs in a row never have one.',
            ),
            row(
                'First movie',
                number(p.skip, 0, 600, 1, (q, n) => (q.skip = n), 'minutes in'),
                'Where the first movie played starts, to skip what comes before it. 0 for the beginning.',
            ),
            row(
                'Notifications',
                checkbox('When a friend arrives or a download finishes', p.notify, (q, on) => (q.notify = on)),
                'Only while Mouse Party is behind other apps. macOS asks the first time.',
            ),
            ...updates(p),
        ],
    },
    {
        id: 'streaming',
        label: 'Streaming',
        icon: 'gauge',
        draw: (p) => [
            row(
                'Bandwidth',
                select(
                    BITRATES.map(([k, label]) => [String(k), label]),
                    String(p.bitrate),
                    (q, v) => (q.bitrate = Number(v)),
                ),
                `This Mac sends the picture and its sound to each friend: 4 friends at ${mbit(p.bitrate)} need about ${mbit((p.bitrate + 128) * 4)} of upload. Lower it if the picture stalls. It changes from the next thing played.`,
            ),
            row(
                'Encoding effort',
                select(PRESETS, p.preset, (q, v) => (q.preset = v)),
                'More effort makes a sharper picture at the same bandwidth, and works this Mac harder. Lower it if this Mac struggles to keep up.',
            ),
        ],
    },
    {
        id: 'network',
        label: 'Network',
        icon: 'wifi',
        draw: (p) => [
            row(
                'Router',
                checkbox('Ask the router to let friends in', p.openRouterPorts, (q, on) => (q.openRouterPorts = on)),
                'Opens a way in on the router (NAT-PMP or UPnP) while the party is on, closed again after. Off, friends come in through the https link alone. It changes the next time the party starts.',
            ),
        ],
    },
    {
        id: 'downloads',
        label: 'Downloads',
        icon: 'download',
        draw: (p) => [
            row(
                'Keep up to',
                number(p.cacheGB, 0, 100000, 1, (q, n) => (q.cacheGB = n), 'GB of downloads'),
                'Past it, the downloads played longest ago are deleted, and their rows go from the list. Removing a row deletes its download too. 0 for no limit.',
            ),
            row('Downloaded now', [
                el('span', { textContent: p.cache || 'Nothing' }),
                ...(p.cache ? [button('Clear Download Cache…', () => askFrom('clear', () => void openPrefs('downloads')))] : []),
            ]),
        ],
    },
    {
        id: 'accounts',
        label: 'Accounts',
        icon: 'key',
        draw: (p) => [accounts(p)],
    },
    {
        id: 'security',
        label: 'Security',
        icon: 'lock',
        draw: (p) => {
            const again = () => void openPrefs('security');
            return [
                row(
                    'Party file',
                    p.sealed
                        ? [
                              el('span', { textContent: 'Encrypted with a passcode' }),
                              button('Change Passcode…', () => askFrom('change', again)),
                              button('Stop Using Encryption…', () => askFrom('off', again)),
                          ]
                        : [el('span', { textContent: 'Not encrypted' }), button('Use Encryption…', () => askFrom('on', again))],
                    'The list, the settings, the saved logins and what the apps keep are in one file on this Mac. Encrypted, Mouse Party asks for its passcode each time it starts.',
                ),
                row(
                    'As text',
                    button('Edit as Text…', () => askFrom('settings', again)),
                    'The list and the settings as JSON, for what has no control here, such as a movie’s subtitles.',
                ),
            ];
        },
    },
];

// Updates, on General: this version, whether to look for a newer one and download it, Check Now, and how it's going
function updates(p: Prefs) {
    const u = p.update;
    const status = el('p', { className: 'pref-note pref-update', textContent: u.text });
    const controls: HTMLElement[] = [
        checkbox('Check for updates automatically', p.checkUpdates, (q, on) => (q.checkUpdates = on)),
        checkbox('Download and install updates automatically', p.installUpdates, (q, on) => (q.installUpdates = on)),
        el(
            'span',
            { className: 'pref-inline' },
            button('Check Now', () => void App().CheckForUpdates().then(follow)),
        ),
    ];
    if (u.ready) controls.push(button('Restart to Update', () => void App().RestartToUpdate(), 'go-button'));
    controls.push(status);
    if (u.busy) follow();
    return [
        row('Version', el('span', { textContent: u.version === 'dev' ? 'A development build' : `Mouse Party ${u.version}` })),
        row('Updates', controls, 'An update downloads quietly and goes in when Mouse Party quits, never in the middle of a party.'),
    ];
}

// while it checks or downloads, General follows it
let following = 0;
function follow() {
    clearTimeout(following);
    following = window.setTimeout(async () => {
        if (current !== 'general' || sheet.hidden || !sheet.querySelector('.prefs')) return;
        prefs = await App().Prefs();
        draw();
    }, 700);
}

// Accounts: the sites with a saved login, each one's username (never its password), and a way to add one
function accounts(p: Prefs) {
    const box = el('div', { className: 'pref-accounts' });
    const list = el('div', { className: 'pref-list' });
    if (!p.accounts.length) list.append(el('p', { className: 'pref-note', textContent: 'No saved logins. A login is saved when a link is added with “Save this login” on, or here.' }));
    for (const a of p.accounts) {
        const remove = button(
            'Remove',
            async () => {
                const why = await App().RemoveAccount(a.site);
                if (why) return void (status().textContent = why);
                await openPrefs('accounts');
            },
            'quiet-button',
        );
        remove.setAttribute('aria-label', `Remove the login for ${a.site}`);
        list.append(el('div', { className: 'pref-account' }, el('span', { className: 'pref-site', textContent: a.site }), el('span', { className: 'pref-user', textContent: a.user }), remove));
    }
    const site = el('input', { type: 'text', placeholder: 'Site, or a link to it', spellcheck: false, autocomplete: 'off', name: 'site' });
    const user = el('input', { type: 'text', placeholder: 'Username', spellcheck: false, autocomplete: 'off', name: 'user' });
    const pass = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'off', name: 'pass' });
    const add = el('form', { className: 'pref-add' }, site, user, pass, el('button', { type: 'submit', className: 'pref-button', textContent: 'Save' }));
    add.onsubmit = async (e) => {
        e.preventDefault();
        const why = await App().SaveAccount(site.value, user.value, pass.value);
        if (why) return void (status().textContent = why);
        await openPrefs('accounts');
    };
    box.append(
        list,
        el('p', { className: 'pref-subhead', textContent: 'Add a login, or change one' }),
        add,
        el('p', {
            className: 'pref-note',
            textContent: 'For a site whose download links ask for a username and password. Saving a site’s login again replaces it. It goes to that site alone, over https.',
        }),
    );
    return box;
}

function draw() {
    const tab = TABS.find((t) => t.id === current) ?? TABS[0];
    const bar = el('nav', { className: 'pref-tabs' });
    for (const t of TABS) {
        const b = el('button', { type: 'button', className: 'pref-tab' + (t.id === tab.id ? ' on' : '') });
        b.innerHTML = svg(ICONS[t.icon]);
        b.append(el('span', { textContent: t.label }));
        b.setAttribute('aria-pressed', String(t.id === tab.id));
        b.dataset.tab = t.id;
        b.onclick = () => {
            current = t.id;
            draw();
        };
        bar.append(b);
    }
    const done = el('button', { type: 'button', className: 'pref-done', textContent: 'Done', onclick: () => close() });
    const box = el(
        'div',
        { className: 'prefs', role: 'dialog' },
        el('div', { className: 'pref-head' }, el('h1', { textContent: tab.label }), done),
        bar,
        el('div', { className: 'pref-body' }, ...tab.draw(prefs)),
        el('p', { className: 'pref-status sheet-error' }),
    );
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
    sheet.textContent = '';
    sheet.append(box);
    sheet.hidden = false;
    bar.querySelector<HTMLElement>('.pref-tab.on')!.focus();
}

// open the Settings window (on a tab: where a sheet opened from it was)
export async function openPrefs(tab?: string) {
    if (tab) current = tab;
    prefs = await App().Prefs();
    draw();
}
