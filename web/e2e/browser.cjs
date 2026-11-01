// The pages in headless Chromium, run by browser_test.go (which hosts the real
// App, and serves the window with stand-ins for Wails): node web/e2e/browser.cjs
// <test server> <seed>. Exits non-zero on the first thing wrong.
//
// 1. The window, walked at random: files dropped, Play, the link, rows clicked,
//    double-clicked and dragged, Backspace and the arrows, the slider; after
//    each step, the page must show the view it was last given.
// 2. Two viewers, Ann at a desk and Bob on a phone (upright, then on its side):
//    every app opened, drawn without an error and closed, played meanwhile by four
//    robot sockets and by Ann at its own controls; a line of chat from one reaching
//    the other; a call between them, sound both ways.
// 3. The party file through the window's own sheets: Settings (refused while
//    playing, and as broken JSON, then saved), sealed with a passcode, the
//    passcode changed, the app restarted locked and opened with it, unsealed.
//
// Any uncaught error on any page fails it. BROWSER_SHOTS=<dir> keeps a picture
// of each app as Ann's page shows it, once the robots have played it.
'use strict';
const { chromium } = require('playwright');

const [base, seedText] = process.argv.slice(2);
let seed = Number(seedText) || 1;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(random() * list.length)];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (why) => {
    console.log('FAIL ' + why);
    process.exit(1);
};

// watch: a page's uncaught errors fail the walk; its console errors are only told
function watch(page, who) {
    page.on('pageerror', (e) => fail(`${who}: ${e.stack || e}`));
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`${who} console: ${m.text()}`));
}

// the window shows the view it was last given (app.ts render)
async function windowMatches(page, what) {
    const wrong = await page.evaluate(() => {
        const v = window.__view;
        if (!v) return null;
        const rows = [...document.querySelectorAll('#list .row')];
        if (rows.length !== v.rows.length) return `${rows.length} rows shown, ${v.rows.length} in the view`;
        for (let i = 0; i < rows.length; i++) {
            const r = v.rows[i],
                el = rows[i];
            if (el.querySelector('.title').textContent !== r.title) return `row ${i} says ${el.querySelector('.title').textContent}`;
            for (const [cls, on] of [
                ['now', r.now],
                ['played', r.played],
                ['off', r.off],
                ['selected', i === v.selected],
            ])
                if (el.classList.contains(cls) !== on) return `row ${i} ${on ? "isn't" : 'is'} ${cls}`;
        }
        const play = document.getElementById('play');
        if (play.classList.contains('stop') !== (v.play === 'stop')) return `the big button, for ${v.play}`;
        if (play.classList.contains('on') !== v.playOn) return `Play ${v.playOn ? "isn't" : 'is'} on`;
        if (document.getElementById('slider').disabled === v.slider.on) return 'the slider';
        if ((document.getElementById('hint').style.display !== 'none') !== (v.rows.length === 0)) return 'the hint';
        return '';
    });
    if (wrong) fail(`the window, after ${what}: ${wrong}`);
}

async function rowCenter(page, i) {
    const box = await page.locator('#list .row').nth(i).boundingBox();
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function walkWindow(browser) {
    const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
    watch(page, 'window');
    await page.goto(`${base}/window/`);
    const files = await (await fetch(`${base}/files`)).json();
    const kinds = ['clip', 'clip2', 'song', 'pdf', 'junk', 'gone'];
    // first, something to play
    await page.evaluate((paths) => window.__drop(10, 10, paths), [files.clip, files.song, files.pdf]);
    const steps = [
        ['drop', async () => page.evaluate((paths) => window.__drop(10, 300, paths), [files[pick(kinds)], files[pick(kinds)]])],
        ['Play', async () => page.click('#play')],
        ['the link', async () => page.click('#link')],
        [
            'a click on a row',
            async () => {
                const n = await page.locator('#list .row').count();
                const c = n && (await rowCenter(page, Math.floor(random() * n)));
                if (c) await page.mouse.click(c.x, c.y);
            },
        ],
        [
            'a double-click on a row',
            async () => {
                const n = await page.locator('#list .row').count();
                const c = n && (await rowCenter(page, Math.floor(random() * n)));
                if (c) await page.mouse.click(c.x, c.y, { clickCount: 2 });
            },
        ],
        [
            'a drag',
            async () => {
                const n = await page.locator('#list .row').count();
                if (n < 2) return;
                const from = await rowCenter(page, Math.floor(random() * n)),
                    to = await rowCenter(page, Math.floor(random() * n));
                await page.mouse.move(from.x, from.y);
                await page.mouse.down();
                await page.mouse.move(to.x, to.y, { steps: 5 });
                await page.mouse.up();
            },
        ],
        ['Backspace', async () => page.keyboard.press('Backspace')],
        ['→', async () => page.keyboard.press('ArrowRight')],
        ['←', async () => page.keyboard.press('ArrowLeft')],
        [
            'the slider',
            async () =>
                page.evaluate((f) => {
                    const s = document.getElementById('slider');
                    if (s.disabled) return;
                    s.dispatchEvent(new Event('pointerdown'));
                    s.value = String(Number(s.min) + f * (Number(s.max) - Number(s.min)));
                    s.dispatchEvent(new Event('input'));
                    s.dispatchEvent(new Event('change'));
                }, random()),
        ],
        ['waiting', async () => sleep(500 + random() * 2500)],
    ];
    const taken = {};
    for (let i = 0; i < 45; i++) {
        const [what, act] = pick(steps);
        taken[what] = (taken[what] || 0) + 1;
        await act();
        await sleep(450); // a view or two later
        await windowMatches(page, what);
    }
    console.log(
        'window: ' +
            Object.entries(taken)
                .map(([k, n]) => `${k} ×${n}`)
                .join(', '),
    );
    // and Play, for the viewers: wait for the link and press it if it's off
    for (let i = 0; i < 60; i++) {
        const v = await page.evaluate(() => window.__view);
        if (v && v.rows.length && v.play === 'play' && v.playOn) await page.click('#play');
        if (v && v.play === 'stop') break;
        if (v && !v.rows.length) await page.evaluate((paths) => window.__drop(10, 10, paths), [files.clip]);
        await sleep(500);
    }
    return page;
}

async function viewer(browser, url, name, device = {}) {
    const context = await browser.newContext({ permissions: ['microphone'], ...device });
    await context.addInitScript(() => {
        // every connection, to read its stats
        const PC = window.RTCPeerConnection;
        window.__pcs = [];
        window.RTCPeerConnection = function (...a) {
            const pc = new PC(...a);
            window.__pcs.push(pc);
            return pc;
        };
        window.RTCPeerConnection.prototype = PC.prototype;
    });
    const page = await context.newPage();
    watch(page, name);
    page.on('dialog', (d) => d.dismiss().catch(() => {})); // a link's address asked for, say: no
    page.on('filechooser', () => {}); // a document to bring in: none
    await page.goto(url);
    await page.fill('#usernameInput', name);
    await page.press('#usernameInput', 'Enter');
    await page.waitForSelector('#chatInputBox', { state: 'visible' });
    return page;
}

// a robot: a viewer with no page, a socket that says things. It keeps which
// apps are open (by name, from what the host tells every socket)
function robot(link, name) {
    return new Promise((ready, broke) => {
        const ws = new WebSocket(link.replace(/^http/, 'ws') + 'ws');
        const bot = { name, ws, open: new Map(), said: 0 };
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.type === 'hello') {
                for (const a of m.apps) bot.open.set(a.id, a.name);
                ws.send(JSON.stringify({ type: 'join', name }));
                ready(bot);
            } else if (m.type === 'apps' && m.op === 'open') bot.open.set(m.app.id, m.app.name);
            else if (m.type === 'apps' && m.op === 'close') bot.open.delete(m.id);
        };
        ws.onerror = () => broke(new Error(`${name}'s socket`));
    });
}

// a field's value, as apps/commands.go describes it: mostly what the app wants, sometimes not
const WORDS = ['cat', 'dog', 'the', 'party', 'mouse', 'ZEBRA', '', 'a'.repeat(300), '😀', '<b>x</b>', 'qzx'];
function value(f) {
    if (random() < 0.12) return pick([null, true, -1, 1e9, 'x', [], { x: 1 }]);
    const n = () => Math.floor(f.Lo + random() * (f.Hi - f.Lo + 1));
    switch (f.Type) {
        case 'int':
            return n();
        case 'num':
            return f.Lo + random() * (f.Hi - f.Lo);
        case 'bool':
            return random() < 0.5;
        case 'str':
            return pick(WORDS);
        case 'strs':
            return Array.from({ length: Math.floor(random() * 6) }, () => pick(WORDS));
        case 'points':
            return Array.from({ length: 2 + Math.floor(random() * 10) }, () => [random(), random()]);
        case 'tiles':
            return Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({ r: Math.floor(random() * 15), c: Math.floor(random() * 15), l: pick('etaoinsr') }));
        case 'ops':
            return pick(['[]', '[{"op":"splice","at":0,"n":0,"blocks":[{"k":"p","t":"hi"}]}]', 'not json', '[{"op":"nope"}]']);
    }
    return null;
}

// play: each robot sends the app its commands at random, for a while
async function play(bots, commands, id, name, ms) {
    const cmds = commands[name] || [];
    // first the lobby, all of them, then start: a game gets going
    for (const kind of ['join', 'start']) if (cmds.some((c) => c.Kind === kind)) for (const b of bots) b.ws.send(JSON.stringify({ type: 'app', id, kind }));
    const end = Date.now() + ms;
    while (Date.now() < end && cmds.length) {
        for (const b of bots) {
            const c = pick(cmds),
                m = { type: 'app', id, kind: c.Kind };
            for (const f of c.Fields || []) if (random() < 0.92) m[f.Name] = value(f);
            b.ws.send(JSON.stringify(m));
            b.said++;
        }
        await sleep(60); // within the host's limit, a page's sixty a second
    }
}

// poke: someone at the page, using the open app's own controls at random:
// buttons and cells clicked, words typed into its fields, strokes drawn on its canvases
async function poke(page, n) {
    for (let i = 0; i < n; i++) {
        const targets = await page.evaluate(() => {
            const out = [];
            for (const body of document.querySelectorAll('.win .win-body'))
                for (const el of body.querySelectorAll('button, input, textarea, select, canvas, [contenteditable="true"], .cell')) {
                    const b = el.getBoundingClientRect();
                    if (b.width < 3 || b.height < 3 || b.bottom < 0 || b.right < 0 || b.top > innerHeight || b.left > innerWidth) continue;
                    if (document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('.win-body') !== body) continue; // under something else
                    out.push({ tag: el.tagName.toLowerCase(), type: el.type || '', editable: el.isContentEditable, x: b.x, y: b.y, w: b.width, h: b.height });
                }
            return out;
        });
        if (!targets.length) return;
        const t = pick(targets),
            at = () => ({ x: t.x + 2 + random() * (t.w - 4), y: t.y + 2 + random() * (t.h - 4) });
        const p = at();
        if (t.tag === 'canvas') {
            const q = at();
            await page.mouse.move(p.x, p.y);
            await page.mouse.down();
            await page.mouse.move(q.x, q.y, { steps: 6 });
            await page.mouse.up();
        } else if (t.tag === 'textarea' || t.editable || (t.tag === 'input' && !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'color'].includes(t.type))) {
            await page.mouse.click(p.x, p.y);
            await page.keyboard.type(pick(WORDS).slice(0, 24));
            if (random() < 0.6) await page.keyboard.press('Enter');
        } else await page.mouse.click(p.x, p.y);
        await sleep(100 + random() * 200);
    }
}

// show: on a phone, the app's tab (its window is the screen's, one at a time)
async function show(page, title) {
    const chip = page.locator('#appTabs .app-chip', { hasText: title.replace(/ \d\+$/, '') }).first();
    if ((await chip.count()) && !(await chip.getAttribute('class')).includes(' on')) await chip.click();
}

async function viewers(browser) {
    let link = '';
    for (let i = 0; i < 60 && !link; i++) {
        link = await (await fetch(`${base}/viewer`)).json();
        if (!link) await sleep(500);
    }
    if (!link) fail('no link to give the viewers');
    const url = link.replace(/^http:\/\/[^:/]+/, 'http://127.0.0.1'); // a secure context, for the microphone
    const ann = await viewer(browser, url, 'Ann'),
        bob = await viewer(browser, url, 'Bob', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); // a phone, upright
    const commands = await (await fetch(`${base}/commands`)).json();
    const bots = await Promise.all(['Robo', 'Bolt', 'Gizmo', 'Sprocket'].map((n) => robot(link.replace(/^http:\/\/[^:/]+/, 'http://127.0.0.1'), n)));

    // a line of chat, from one to the other
    await bob.fill('#messageInput', 'hello from Bob');
    await bob.press('#messageInput', 'Enter');
    await ann.waitForFunction(() => document.body.innerText.includes('hello from Bob'), null, { timeout: 5000 }).catch(() => fail('the chat line never reached Ann'));

    // every app: opened by Ann, drawn on both pages, closed by Bob
    const count = await (async () => {
        await ann.locator('.plus:visible').first().click();
        await ann.waitForSelector('.picker-app', { state: 'visible' });
        const n = await ann.locator('.picker-app').count();
        await ann.keyboard.press('Escape');
        return n;
    })();
    if (count < 10) fail(`the picker offers ${count} apps`);
    for (let i = 0; i < count; i++) {
        if (i === Math.floor(count / 2)) await bob.setViewportSize({ width: 844, height: 390 }); // the phone on its side
        await ann.locator('.plus:visible').first().click();
        await ann.waitForSelector('.picker-app', { state: 'visible' });
        const title = (await ann.locator('.picker-app').nth(i).innerText()).trim();
        await ann.locator('.picker-app').nth(i).click();
        for (const page of [ann, bob])
            await page
                .waitForFunction(() => document.querySelector('.win .win-body') && document.querySelector('.win .win-body').childElementCount > 0, null, { timeout: 8000 })
                .catch(() => fail(`${title} never drew`));
        await show(bob, title);
        await sleep(800); // its script running, a view or two
        // the robots play it, and Ann uses its controls, while both pages draw what comes of it
        const id = [...bots[0].open].find(([, n]) => n)?.[0];
        await Promise.all([id !== undefined && play(bots, commands, id, bots[0].open.get(id), 3000), poke(ann, 14)]);
        await sleep(600);
        if (process.env.BROWSER_SHOTS) await ann.screenshot({ path: `${process.env.BROWSER_SHOTS}/${String(i).padStart(2, '0')}-${title.replace(/\W+/g, '-')}.png` });
        // close what's open: Ann's clicks may have opened another (the reel opens Graffiti), and an editor's
        // dialog may be up over its window, which Escape puts away, as a person would
        await ann.keyboard.press('Escape');
        for (let n = 0; n < 4; n++) {
            await sleep(1100); // a page opens or closes one app a second
            if (!(await ann.locator('.win-close').count())) break;
            await ann.locator('.win-close').first().click({ timeout: 5000 });
        }
        await ann.waitForFunction(() => !document.querySelector('.win'), null, { timeout: 5000 }).catch(() => fail(`${title}: its windows never closed`));
        await sleep(1100); // a page opens or closes one app a second
    }
    console.log(`viewers: ${count} apps opened, drawn, played by robots and poked at by Ann (${bots.map((b) => `${b.name} ${b.said}`).join(', ')} messages) and closed; chat went across`);
    for (const b of bots) b.ws.close();

    // a call: both in, sound both ways
    await ann.locator('.plus:visible').first().click();
    await ann.waitForSelector('.picker-app', { state: 'visible' });
    await ann.locator('.picker-app', { hasText: 'Call' }).click();
    await bob.waitForSelector('#appTabs .app-chip');
    await show(bob, 'Call');
    for (const page of [ann, bob]) {
        await page.getByRole('button', { name: 'Join the call' }).click({ timeout: 8000 });
    }
    await sleep(8000);
    for (const [who, page] of [
        ['Ann', ann],
        ['Bob', bob],
    ]) {
        const audio = await page.evaluate(async () => {
            let sent = 0,
                got = 0;
            for (const pc of window.__pcs) {
                // not the movie's: the one with video
                if (pc.connectionState === 'closed' || pc.getTransceivers().some((t) => t.receiver.track.kind === 'video')) continue;
                (await pc.getStats()).forEach((s) => {
                    if (s.kind !== 'audio') return;
                    if (s.type === 'outbound-rtp') sent += s.packetsSent;
                    if (s.type === 'inbound-rtp' && s.packetsReceived) got += s.packetsReceived;
                });
            }
            return { sent, got };
        });
        if (audio.sent < 50 || audio.got < 50) fail(`${who} in the call: sent ${audio.sent} packets, got ${audio.got}`);
        console.log(`call: ${who} sent ${audio.sent} sound packets, got ${audio.got}`);
    }
}

// ---------- the party file, through the window's own sheets (party.ts) ----------

const until = async (page, what, fn, arg, ms = 10000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => fail(`the window: never ${what}`));
const sheetUp = (page, title) => until(page, `the "${title}" sheet`, (t) => !document.getElementById('sheet').hidden && document.querySelector('#sheet h1')?.textContent === t, title);
const sheetGone = (page, after) => until(page, `closed the sheet after ${after}`, () => document.getElementById('sheet').hidden, null, 20000);
const sheetSays = (page, what, words) => until(page, `said "${words}" for ${what}`, (w) => (document.querySelector('#sheet .sheet-error')?.textContent || '').includes(w), words, 20000);
async function fillSheet(page, values) {
    for (const [name, value] of Object.entries(values)) await page.fill(`#sheet [name="${name}"]`, value);
    await page.click('#sheet .go');
}
const viewIs = (page, what, fn) => until(page, what, fn, null, 30000);

async function party(page) {
    const rows = await page.evaluate(() => window.__view.rows.length);
    // Settings: not while playing; not JSON that won't read; then saved
    const wasPlaying = await page.evaluate(() => window.__view.play === 'stop');
    if (wasPlaying) {
        await page.evaluate(() => window.__ask('settings'));
        await sheetUp(page, 'Settings');
        await page.click('#sheet .go');
        await sheetSays(page, 'saving while playing', 'Stop first');
        await page.keyboard.press('Escape');
        await sheetGone(page, 'Escape');
        await page.click('#play');
        await viewIs(page, 'stopped', () => window.__view.play === 'play' && window.__view.playOn);
    }
    await page.evaluate(() => window.__ask('settings'));
    await sheetUp(page, 'Settings');
    const text = await page.inputValue('#sheet [name="text"]');
    await fillSheet(page, { text: '{ "countdown": ' });
    await sheetSays(page, 'broken JSON', "isn't JSON");
    const settings = JSON.parse(text);
    settings.countdown = 2;
    await fillSheet(page, { text: JSON.stringify(settings, null, 2) });
    await sheetGone(page, 'saving the settings');
    await page.evaluate(() => window.__ask('settings'));
    await sheetUp(page, 'Settings');
    if (JSON.parse(await page.inputValue('#sheet [name="text"]')).countdown !== 2) fail('the settings saved, and read back otherwise');
    await page.keyboard.press('Escape');
    await sheetGone(page, 'Escape');

    // Use Encryption: two passcodes that differ, then the same twice
    await page.evaluate(() => window.__ask('on'));
    await sheetUp(page, 'Use Encryption');
    await fillSheet(page, { next: 'pa55', again: 'pass' });
    await sheetSays(page, 'two passcodes', "aren't the same");
    await fillSheet(page, { next: 'pa55', again: 'pa55' });
    await sheetGone(page, 'sealing');
    await viewIs(page, 'sealed', () => window.__view.sealed);

    // Change Passcode: the wrong one now, then the right one
    await page.evaluate(() => window.__ask('change'));
    await sheetUp(page, 'Change Passcode');
    await fillSheet(page, { current: 'nope', next: 'word2', again: 'word2' });
    await until(page, 'refused a wrong passcode', () => (document.querySelector('#sheet .sheet-error')?.textContent || '') !== '', null, 20000);
    await fillSheet(page, { current: 'pa55', next: 'word2', again: 'word2' });
    await sheetGone(page, 'changing the passcode');

    // the app quits and opens again: locked, until its passcode
    await fetch(`${base}/restart`, { method: 'POST' });
    await viewIs(page, 'locked after a restart', () => window.__view && window.__view.locked);
    await sheetUp(page, 'Mouse Party');
    await fillSheet(page, { passcode: 'pa55' });
    await until(page, 'refused the old passcode', () => (document.querySelector('#sheet .sheet-error')?.textContent || '') !== '', null, 20000);
    await fillSheet(page, { passcode: 'word2' });
    await sheetGone(page, 'unlocking');
    await viewIs(page, 'open again', () => !window.__view.locked && window.__view.sealed);
    const after = await page.evaluate(() => window.__view.rows.length);
    if (after !== rows) fail(`the list had ${rows} rows sealed, and ${after} opened again`);

    // Stop Using Encryption
    await page.evaluate(() => window.__ask('off'));
    await sheetUp(page, 'Stop Using Encryption');
    await fillSheet(page, { current: 'word2' });
    await sheetGone(page, 'unsealing');
    await viewIs(page, 'unsealed', () => !window.__view.sealed);
    await windowMatches(page, 'the party file sealed, reopened and unsealed');
    console.log(`party: settings saved (refused ${wasPlaying ? 'while playing, and ' : ''}as broken JSON); sealed, passcode changed, restarted locked, opened with ${rows} rows, unsealed`);
}

(async () => {
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    try {
        const win = await walkWindow(browser);
        await viewers(browser);
        await party(win);
    } finally {
        await browser.close();
    }
    console.log('ok');
})().catch((e) => fail(e.stack || String(e)));
