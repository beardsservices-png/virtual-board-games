/**
 * End-to-end smoke test. Drives the built app in a real browser and exercises
 * the paths a unit test cannot reach: tapping a square, dragging a piece, the
 * computer replying, and two browsers sharing one online game.
 *
 *   node tests/browser.mjs [baseUrl] [--shots DIR]
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:5099';
const shotsFlag = process.argv.indexOf('--shots');
const SHOTS = shotsFlag > -1 ? process.argv[shotsFlag + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
};
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : Promise.resolve());

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];

function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
}

/** Centre of a square, in board coordinates with the first mover at the bottom. */
function squareCenter(box, file, rank) {
  return { x: box.x + (file + 0.5) * box.width / 8, y: box.y + (8 - rank + 0.5) * box.height / 8 };
}

/** Centre of a flat 0..63 square index, accounting for a flipped board. */
function squareAt(box, index, flipped = false) {
  const row = index >> 3;
  const col = index & 7;
  const vrow = flipped ? 7 - row : row;
  const vcol = flipped ? 7 - col : col;
  return { x: box.x + (vcol + 0.5) * box.width / 8, y: box.y + (vrow + 0.5) * box.height / 8 };
}

/* --------------------------------------------------------- desktop: chess */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('lobby loads', (await page.locator('.mode-grid').count()) > 0);
  await shot(page, '01-lobby');

  await page.getByRole('button', { name: /Pass . play/ }).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(300);
  const pieces = await page.locator('.layer .cell .piece').count();
  check('chess board sets up 32 pieces', pieces === 32, `${pieces} rendered`);
  await shot(page, '02-chess-board');

  const box = await page.locator('.board').boundingBox();

  const e2 = squareCenter(box, 4, 2);
  await page.mouse.click(e2.x, e2.y);
  await page.waitForTimeout(200);
  const hints = await page.locator('.hint').count();
  check('selecting a pawn shows its legal moves', hints === 2, `${hints} hints`);
  await shot(page, '03-selected');

  const e4 = squareCenter(box, 4, 4);
  await page.mouse.click(e4.x, e4.y);
  await page.waitForTimeout(350);
  let moves = (await page.locator('.moves').innerText()).replace(/\s+/g, ' ').trim();
  check('tap-to-move records e4', moves.includes('e4'), moves.slice(0, 40));
  await shot(page, '04-after-tap-move');

  const from = squareCenter(box, 4, 7);
  const to = squareCenter(box, 4, 5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 24, { steps: 4 });
  const dragging = await page.locator('.drag-piece').count();
  await shot(page, '05-dragging');
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  moves = (await page.locator('.moves').innerText()).replace(/\s+/g, ' ').trim();
  check('drag lifts the piece', dragging === 1);
  check('drag-to-move records e5', moves.includes('e5'), moves.slice(0, 40));
  await shot(page, '06-after-drag');

  await page.locator('.moves button').first().click();
  await page.waitForTimeout(250);
  check('scrubbing back shows the review notice',
    (await page.locator('.status-strip').innerText()).includes('Reviewing'));
  await shot(page, '07-scrubbed');

  await ctx.close();
}

/* ---------------------------------------------------- desktop: vs computer */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'ai');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Play the computer/ }).click();
  await page.getByRole('button', { name: /Steady/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(300);

  const box = await page.locator('.board').boundingBox();
  const e2 = squareCenter(box, 4, 2);
  const e4 = squareCenter(box, 4, 4);
  await page.mouse.click(e2.x, e2.y);
  await page.waitForTimeout(150);
  await page.mouse.click(e4.x, e4.y);

  await page.waitForFunction(() => document.querySelectorAll('.moves button').length >= 2, null, { timeout: 20000 })
    .catch(() => {});
  const replies = await page.locator('.moves button').count();
  check('computer replies to a move', replies >= 2, `${replies} half-moves`);
  await shot(page, '08-vs-computer');
  await ctx.close();
}

/* ------------------------------------------------------ desktop: checkers */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'checkers');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Checkers' }).click();
  await page.getByRole('button', { name: /Pass . play/ }).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(300);
  const discs = await page.locator('.layer .cell .piece').count();
  check('checkers board sets up 24 discs', discs === 24, `${discs} rendered`);
  await shot(page, '09-checkers');

  const box = await page.locator('.board').boundingBox();
  const red = squareCenter(box, 2, 3);
  await page.mouse.click(red.x, red.y);
  await page.waitForTimeout(200);
  check('selecting a checker shows moves', (await page.locator('.hint').count()) > 0);
  const dest = squareCenter(box, 1, 4);
  await page.mouse.click(dest.x, dest.y);
  await page.waitForTimeout(300);
  const ckMoves = (await page.locator('.moves').innerText()).replace(/\s+/g, ' ').trim();
  check('checkers move is recorded', /\d+-\d+/.test(ckMoves), ckMoves.slice(0, 30));

  // Every disc must sit on a dark square — the light diagonal is never in play.
  const offColour = await page.evaluate(() => {
    const board = document.querySelector('.board');
    const size = board.getBoundingClientRect();
    const squares = [...board.querySelectorAll('.sq')];
    let wrong = 0;
    for (const cell of board.querySelectorAll('.layer .cell')) {
      const r = cell.getBoundingClientRect();
      const col = Math.round((r.left - size.left) / (size.width / 8));
      const row = Math.round((r.top - size.top) / (size.height / 8));
      const sq = squares[row * 8 + col];
      if (sq && !sq.classList.contains('dark')) wrong++;
    }
    return wrong;
  });
  check('every checker sits on a dark square', offColour === 0, `${offColour} off-colour`);
  await shot(page, '10-checkers-moved');
  await ctx.close();
}

/* ------------------------------------------------------------- mobile */
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  watch(page, 'mobile');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, '11-mobile-lobby');
  const overflowLobby = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check('lobby does not scroll sideways on a phone', overflowLobby <= 1, `${overflowLobby}px overflow`);

  await page.getByRole('button', { name: /Pass . play/ }).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(400);
  await shot(page, '12-mobile-board');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check('game does not scroll sideways on a phone', overflow <= 1, `${overflow}px overflow`);

  const scrolled = await page.evaluate(() => window.scrollY);
  check('the page does not scroll itself on load', scrolled === 0, `scrolled ${scrolled}px`);

  const headerBottom = await page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().bottom);
  const barTop = await page.evaluate(() => document.querySelector('.player-bar').getBoundingClientRect().top);
  check('both name bars clear the header', barTop >= headerBottom - 1,
    `bar at ${Math.round(barTop)}, header ends ${Math.round(headerBottom)}`);

  const box = await page.locator('.board').boundingBox();
  const view = page.viewportSize();
  check('board fills the phone width', box.width > view.width * 0.82,
    `${Math.round(box.width)}px of ${view.width}px`);
  check('board is square', Math.abs(box.width - box.height) < 2);
  check('board sits above the fold', box.y + box.height < view.height + 40,
    `bottom at ${Math.round(box.y + box.height)} of ${view.height}`);

  const e2 = squareCenter(box, 4, 2);
  const e4 = squareCenter(box, 4, 4);
  await page.touchscreen.tap(e2.x, e2.y);
  await page.waitForTimeout(250);
  check('tapping a piece on touch shows moves', (await page.locator('.hint').count()) === 2);
  await shot(page, '13-mobile-selected');
  await page.touchscreen.tap(e4.x, e4.y);
  await page.waitForTimeout(350);
  const mMoves = (await page.locator('.mobile-panel').first().innerText()).replace(/\s+/g, ' ');
  check('touch move is recorded', mMoves.includes('e4'), mMoves.slice(0, 40));
  await shot(page, '14-mobile-moved');

  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.waitForTimeout(250);
  check('mobile tabs switch panels', (await page.locator('.swatch').count()) > 0);
  await shot(page, '15-mobile-board-tab');

  const cramped = await page.evaluate(() =>
    [...document.querySelectorAll('.btn, .seg button')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.getBoundingClientRect().height)
      .filter((h) => h < 36).length
  );
  check('no cramped touch targets', cramped === 0, `${cramped} under 36px`);
  await ctx.close();
}

/* ------------------------------------------------------- online, two tabs */
{
  const hostCtx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const host = await hostCtx.newPage();
  watch(host, 'host');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByRole('button', { name: /Play online/ }).click();
  await host.locator('.input').first().fill('Brian');
  await host.getByRole('button', { name: /Play as White/ }).click();
  await host.waitForSelector('.share-code b', { timeout: 20000 });
  const code = (await host.locator('.share-code b').innerText()).trim();
  check('online game gets a share code', /^[A-Z0-9]{4}$/.test(code), code);
  await shot(host, '16-online-host-waiting');

  const guestCtx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const guest = await guestCtx.newPage();
  watch(guest, 'guest');
  await guest.goto(`${BASE}/g/${code}`, { waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 20000 });
  await guest.waitForTimeout(900);
  check('guest joins by link', (await guest.locator('.board').count()) === 1);

  const seatText = await host.locator('.player-bar').first().innerText();
  check('host sees the guest seated', !seatText.includes('Waiting'), seatText.replace(/\s+/g, ' '));
  await shot(host, '17-online-host-joined');

  const topRank = await guest.evaluate(() => document.querySelector('.board .sq .coord.rank')?.textContent);
  check('guest board is oriented to their own side', topRank === '1', `top rank label ${topRank}`);

  const hbox = await host.locator('.board').boundingBox();
  const h1 = squareCenter(hbox, 4, 2);
  const h2 = squareCenter(hbox, 4, 4);
  await host.mouse.click(h1.x, h1.y);
  await host.waitForTimeout(150);
  await host.mouse.click(h2.x, h2.y);
  await guest.waitForFunction(() => document.querySelector('.moves')?.innerText.includes('e4'), null, { timeout: 15000 })
    .then(() => check('move reaches the other player live', true))
    .catch(() => check('move reaches the other player live', false, 'timed out'));
  await shot(guest, '18-online-guest-sees-move');

  // The guest plays Black on a board flipped to their own side: e7 -> e5.
  const gbox = await guest.locator('.board').boundingBox();
  const gFrom = squareAt(gbox, 12, true);
  const gTo = squareAt(gbox, 28, true);
  await guest.mouse.click(gFrom.x, gFrom.y);
  await guest.waitForTimeout(200);
  await guest.mouse.click(gTo.x, gTo.y);
  await host.waitForFunction(
    () => document.querySelector('.moves')?.innerText.includes('e5'),
    null, { timeout: 15000 }
  ).then(() => check('reply reaches the host live', true))
    .catch(() => check('reply reaches the host live', false, 'timed out'));
  await shot(host, '19-online-host-sees-reply');

  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForSelector('.board', { timeout: 20000 });
  await guest.waitForTimeout(1200);
  const afterReload = (await guest.locator('.moves').innerText()).replace(/\s+/g, ' ');
  check('refreshing keeps your seat and the position', afterReload.includes('e4'), afterReload.slice(0, 40));
  await shot(guest, '20-online-after-reload');

  await hostCtx.close();
  await guestCtx.close();
}

await browser.close();

const realErrors = errors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
check('no console errors', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
