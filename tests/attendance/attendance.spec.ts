import { test, expect, Page, APIRequestContext } from '@playwright/test';

// The specs talk to the real API (and so to the real server/data/db.json), so every
// entry made on the test days is deleted in afterEach.
const API = 'http://localhost:3000';
const GROUP = '5';
const EID = 'joshua.a.b.soriaga'; // group 5
// July 2026 is the view's default month. Both days are weekdays with no entry for EID.
const YEAR = 2026;
const MONTH = 7;
const DAY = 2; // Thursday
const RTO_DAY = 3; // Friday
const OFFICE = 'Manila';

type Entry = { id: number; eid: string; year: number; month: number; day: number; status: string };

function ui(page: Page) {
  const resourceRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: EID, exact: true }) });
  return {
    /** The status select for EID on a day. Column 0 is the EID, so day N is cell N. */
    cell: (day: number) => resourceRow.getByRole('cell').nth(day),
    status: (day: number) => resourceRow.getByRole('cell').nth(day).getByRole('combobox'),
    totalPresent: (day: number) =>
      page.getByRole('row').filter({ hasText: 'Total Present' }).getByRole('cell').nth(day),
    rtoDialog: page.getByRole('dialog').filter({ hasText: 'Select Office Location' }),
    rtoSummary: page.locator('.att-rto-summary'),
  };
}

async function entriesOn(request: APIRequestContext, day: number): Promise<Entry[]> {
  const all: Entry[] = await (await request.get(`${API}/api/attendance`)).json();
  return all.filter((e) => e.eid === EID && e.year === YEAR && e.month === MONTH && e.day === day);
}

async function openView(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/attendance'));
  await page.goto('/');
  await page.getByRole('complementary').getByRole('combobox').selectOption(GROUP);
  await page.getByRole('button', { name: 'Attendance Tracker' }).click();
  await loaded;
  await expect(ui(page).status(DAY)).toBeVisible();
}

/** The Total Present badge is left out when the count is 0. */
async function readTotalPresent(page: Page, day: number) {
  return Number((await ui(page).totalPresent(day).innerText()).trim() || 0);
}

/** Run a cell edit and wait for the save it triggers. */
async function saveVia(page: Page, method: 'POST' | 'PATCH' | 'DELETE', edit: () => Promise<unknown>) {
  const saved = page.waitForResponse((r) => r.request().method() === method && r.url().includes('/api/attendance'));
  await edit();
  expect((await saved).ok()).toBeTruthy();
}

test.describe('Attendance Tracker', () => {
  // Tests share the same resource and days, so this file runs in one worker, in order
  test.describe.configure({ mode: 'default' });

  test.beforeEach(async ({ page, request }) => {
    // Cleanup deletes everything on these days, so they must start empty
    for (const day of [DAY, RTO_DAY]) {
      expect(await entriesOn(request, day), `${EID} has no entry on ${YEAR}-${MONTH}-${day}`).toHaveLength(0);
    }
    await openView(page);
  });

  test.afterEach(async ({ request }) => {
    for (const day of [DAY, RTO_DAY]) {
      for (const e of await entriesOn(request, day)) {
        expect((await request.delete(`${API}/api/attendance/${e.id}`)).ok()).toBeTruthy();
      }
    }
  });

  test('mark a day Present', async ({ page }) => {
    const { status, cell, totalPresent } = ui(page);
    const before = await readTotalPresent(page, DAY);

    await saveVia(page, 'POST', () => status(DAY).selectOption('Present'));
    await expect(cell(DAY)).toHaveClass(/att-c-present/);
    await expect(totalPresent(DAY)).toHaveText(String(before + 1));

    // The view and the group are kept in localStorage
    await page.reload();
    await expect(status(DAY)).toHaveValue('Present');
  });

  test('clearing a day removes the entry', async ({ page, request }) => {
    const res = await request.post(`${API}/api/attendance`, {
      data: { eid: EID, year: YEAR, month: MONTH, day: DAY, status: 'Present' },
    });
    expect(res.ok()).toBeTruthy();
    await openView(page); // pick up the seeded entry
    const { status, totalPresent } = ui(page);
    await expect(status(DAY)).toHaveValue('Present');
    const before = await readTotalPresent(page, DAY);

    await saveVia(page, 'DELETE', () => status(DAY).selectOption(''));
    await expect(totalPresent(DAY)).toHaveText(before - 1 ? String(before - 1) : '');

    await page.reload();
    await expect(status(DAY)).toHaveValue('');
  });

  test('RTO asks for an office location', async ({ page }) => {
    const { status, cell, rtoDialog, rtoSummary } = ui(page);

    await status(RTO_DAY).selectOption('RTO');
    await expect(rtoDialog).toBeVisible();
    const confirm = rtoDialog.getByRole('button', { name: 'Confirm RTO' });
    await expect(confirm).toBeDisabled();

    await rtoDialog.getByRole('combobox').selectOption(OFFICE);
    await saveVia(page, 'POST', () => confirm.click());

    await expect(rtoDialog).toHaveCount(0);
    await expect(status(RTO_DAY)).toHaveValue('RTO');
    await expect(cell(RTO_DAY)).toHaveAttribute('title', `Office: ${OFFICE}`);
    await expect(rtoSummary).toContainText(OFFICE);
  });

  test('cancelling the RTO dialog leaves the day empty', async ({ page, request }) => {
    // Regression: the dropdown used to keep showing RTO after Cancel, though nothing was saved
    const { status, rtoDialog } = ui(page);

    await status(RTO_DAY).selectOption('RTO');
    await rtoDialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(rtoDialog).toHaveCount(0);
    expect(await entriesOn(request, RTO_DAY)).toHaveLength(0); // nothing saved
    await expect(status(RTO_DAY)).toHaveValue('');
  });

  test('switching month', async ({ page }) => {
    await expect(page.getByText(/^July 2026 — /)).toBeVisible();

    await page.getByRole('combobox').filter({ hasText: 'August 2026' }).selectOption('2026-08');
    await expect(page.getByText(/^August 2026 — /)).toBeVisible();

    // The month is kept in localStorage
    await page.reload();
    await expect(page.getByText(/^August 2026 — /)).toBeVisible();
  });
});
