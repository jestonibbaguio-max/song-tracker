import { test, expect, Page, APIRequestContext } from '@playwright/test';

// The specs talk to the real API (and so to the real server/data/db.json), so every
// item created here, through the UI or the API, is deleted in afterEach.
const API = 'http://localhost:3000';

// Tests work in an old sprint rather than the current one (which depends on today's
// date), so the board starts from a known state. OTHER_SPRINT is only switched to.
const SPRINT = { id: 1, name: 'Sprint 1' };
const OTHER_SPRINT = { id: 2, name: 'Sprint 2' };
const GROUP = 5;
const GROUP_LABEL = 'Group 5 - AEM/Angular';
const OTHER_GROUP = 4;

type Category = 'improve' | 'didnt-go-well' | 'went-well';

/** The three columns, in board order (sprint-retros.component.ts). */
const COLUMNS: { category: Category; title: string; placeholder: string }[] = [
  { category: 'improve', title: 'What we can improve', placeholder: 'Add an improvement idea' },
  { category: 'didnt-go-well', title: "What didn't go well", placeholder: 'Add a challenge' },
  { category: 'went-well', title: 'What went well', placeholder: 'Add a win' },
];
const [IMPROVE] = COLUMNS;

function ui(page: Page) {
  // Columns are plain <section>s with an <h2>, so they're found through their heading
  const column = (title: string, scope = page.locator('body')) =>
    scope.locator('.retro-column').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

  return {
    groupFilter: page.getByRole('complementary').getByRole('combobox'),
    // exact: the board itself is labelled "Sprint N retrospective"
    sprint: page.getByRole('combobox', { name: 'Sprint', exact: true }),
    noGroupNotice: page.getByRole('status').filter({ hasText: 'Select a group from the sidebar' }),
    addButtons: page.getByRole('button', { name: 'Add item' }),
    column,
    /** The column's item count badge (a plain span). */
    count: (title: string) => column(title).locator('.retro-count'),
    draft: (c: (typeof COLUMNS)[number]) => column(c.title).getByPlaceholder(c.placeholder),
    addButton: (title: string) => column(title).getByRole('button', { name: 'Add item' }),
    card: (text: string) => page.getByRole('article').filter({ hasText: text }),
    editButton: (text: string) => page.getByRole('button', { name: `Edit: ${text}`, exact: true }),
    removeButton: (text: string) => page.getByRole('button', { name: `Remove: ${text}`, exact: true }),
    /** Only the card being edited has a textbox. */
    editBox: page.getByRole('article').getByRole('textbox'),
    groupToggle: (label: string) => page.getByRole('button', { name: label }),
  };
}

/** Unique per run, so a leftover from a previous run can't cause a false pass. */
const marker = (label: string) => `test-${label}-${Date.now()}`;

// ---------- API: seeding and cleanup ----------

async function seedItem(
  request: APIRequestContext,
  item: { sprintId?: number; groupNumber?: number; category?: Category; text: string },
): Promise<number> {
  const res = await request.post(`${API}/api/sprint-retros`, {
    data: { sprintId: SPRINT.id, groupNumber: GROUP, category: IMPROVE.category, ...item },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

// ---------- UI ----------

async function openView(page: Page) {
  await page.goto('/');
  // Sprint Retrospective sits in Planner's submenu, which starts collapsed
  await page.getByRole('button', { name: 'Planner' }).click();
  await page.getByRole('button', { name: 'Sprint Retrospective' }).click();
}

/** Pick a sprint and wait for its items to load. */
async function selectSprint(page: Page, sprint: { id: number; name: string }) {
  const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/sprint-retros?sprintId=${sprint.id}`));
  await ui(page).sprint.selectOption({ label: sprint.name });
  expect((await loaded).ok()).toBeTruthy();
  await expect(page.getByText('Loading retrospective...')).toHaveCount(0);
}

async function readCount(page: Page, title: string) {
  return Number(await ui(page).count(title).innerText());
}

// ---------- Tests ----------

test.describe('Sprint Retrospective', () => {
  // Tests add to and count the same sprint's columns, so this file runs in one worker, in order
  test.describe.configure({ mode: 'default' });

  let created: number[];

  test.beforeEach(async ({ page }) => {
    created = [];
    await openView(page);
  });

  test.afterEach(async ({ request }) => {
    // Runs even when the test fails. A 404 means the test already removed it.
    for (const id of created) {
      const res = await request.delete(`${API}/api/sprint-retros/${id}`);
      expect([200, 404]).toContain(res.status());
    }
  });

  test.describe('without a group selected', () => {
    test('shows a read-only overview of every group', async ({ page, request }) => {
      const text = marker('overview');
      created.push(await seedItem(request, { text }));
      const { noGroupNotice, addButtons, groupToggle, card, editButton, removeButton } = ui(page);

      await selectSprint(page, SPRINT);

      await expect(noGroupNotice).toBeVisible();
      await expect(groupToggle(GROUP_LABEL)).toHaveAttribute('aria-expanded', 'true');
      await expect(card(text)).toBeVisible();
      // Read-only: no add, edit or remove controls
      await expect(addButtons).toHaveCount(0);
      await expect(editButton(text)).toHaveCount(0);
      await expect(removeButton(text)).toHaveCount(0);
    });

    test('a group section collapses and expands', async ({ page, request }) => {
      const text = marker('collapse');
      created.push(await seedItem(request, { text }));
      const { groupToggle, card } = ui(page);

      await selectSprint(page, SPRINT);
      const toggle = groupToggle(GROUP_LABEL);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(card(text)).toHaveCount(0);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(card(text)).toBeVisible();
    });
  });

  test.describe(`with group ${GROUP} selected`, () => {
    test.beforeEach(async ({ page }) => {
      await ui(page).groupFilter.selectOption(String(GROUP));
      await selectSprint(page, SPRINT);
    });

    for (const col of COLUMNS) {
      test(`add an item to "${col.title}"`, async ({ page }) => {
        const text = marker(col.category);
        const { draft, addButton, column, card, count } = ui(page);
        const before = await readCount(page, col.title);

        await draft(col).fill(text);
        const saved = page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith('/api/sprint-retros'),
        );
        await addButton(col.title).click();
        const res = await saved;
        expect(res.status()).toBe(201);
        created.push((await res.json()).id);

        await expect(column(col.title).getByRole('article').filter({ hasText: text })).toBeVisible();
        await expect(card(text)).toHaveCount(1); // in this column only
        await expect(count(col.title)).toHaveText(String(before + 1));
        await expect(draft(col)).toHaveValue('');

        // The view and the group are kept in localStorage; the sprint resets to the current one
        await page.reload();
        await selectSprint(page, SPRINT);
        await expect(column(col.title).getByRole('article').filter({ hasText: text })).toBeVisible();
      });
    }

    test('Add item stays disabled for blank or whitespace-only text', async ({ page }) => {
      const { draft, addButton } = ui(page);

      await expect(addButton(IMPROVE.title)).toBeDisabled();
      await draft(IMPROVE).fill('   ');
      await expect(addButton(IMPROVE.title)).toBeDisabled();
      await draft(IMPROVE).fill('x');
      await expect(addButton(IMPROVE.title)).toBeEnabled();
    });

    test('edit an item', async ({ page, request }) => {
      const text = marker('edit');
      const edited = `${text}-edited`;
      created.push(await seedItem(request, { text }));
      const { card, editButton, editBox } = ui(page);

      await selectSprint(page, SPRINT); // pick up the seeded item
      await editButton(text).click();
      await expect(editBox).toHaveValue(text);
      await editBox.fill(edited);
      await page.getByRole('article').getByRole('button', { name: 'Save' }).click();

      await expect(editBox).toHaveCount(0);
      await expect(card(edited)).toBeVisible();

      await page.reload();
      await selectSprint(page, SPRINT);
      await expect(card(edited)).toBeVisible();
    });

    test('cancelling an edit keeps the original text', async ({ page, request }) => {
      const text = marker('cancel');
      created.push(await seedItem(request, { text }));
      const { card, editButton, editBox } = ui(page);

      await selectSprint(page, SPRINT);
      await editButton(text).click();
      await editBox.fill(`${text}-discarded`);
      await page.getByRole('article').getByRole('button', { name: 'Cancel' }).click();

      await expect(editBox).toHaveCount(0);
      await expect(card(text)).toHaveText(text);
    });

    test('remove an item', async ({ page, request }) => {
      const text = marker('remove');
      created.push(await seedItem(request, { text }));
      const { card, removeButton, count } = ui(page);

      await selectSprint(page, SPRINT);
      await expect(card(text)).toBeVisible();
      const before = await readCount(page, IMPROVE.title);

      await removeButton(text).click();
      await expect(card(text)).toHaveCount(0);
      await expect(count(IMPROVE.title)).toHaveText(String(before - 1));

      await page.reload();
      await selectSprint(page, SPRINT);
      await expect(card(text)).toHaveCount(0);
    });

    test("switching sprint shows only that sprint's items", async ({ page, request }) => {
      const text = marker('sprint');
      created.push(await seedItem(request, { text }));
      const { card } = ui(page);

      await selectSprint(page, SPRINT);
      await expect(card(text)).toBeVisible();

      await selectSprint(page, OTHER_SPRINT);
      await expect(card(text)).toHaveCount(0);

      await selectSprint(page, SPRINT);
      await expect(card(text)).toBeVisible();
    });

    test("another group's items are hidden", async ({ page, request }) => {
      const text = marker('group');
      created.push(await seedItem(request, { groupNumber: OTHER_GROUP, text }));
      const { card, groupFilter } = ui(page);

      await selectSprint(page, SPRINT);
      await expect(card(text)).toHaveCount(0);

      // The board filters by the sidebar group as soon as it changes
      await groupFilter.selectOption(String(OTHER_GROUP));
      await expect(card(text)).toBeVisible();
    });
  });
});
