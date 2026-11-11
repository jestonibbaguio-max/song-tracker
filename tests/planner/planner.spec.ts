import { test, expect, Page, APIRequestContext, APIResponse, Response } from '@playwright/test';

// The specs talk to the real API (which runs on its own copy of server/data; see playwright.config.ts), so every
// task created here, through the UI or the API, is deleted in afterEach, and the one
// capacity entry edited is restored.
//
// Some planner writes can't be undone through the API, so the tests avoid them:
// - Picking a sprint that has no bucket on the board POSTs a new bucket (no DELETE
//   route). The tests only pick sprints whose bucket already exists (guarded below).
// - Deleting a task from the UI also POSTs a deletion log (no DELETE route), so that
//   request is intercepted and never reaches the server.
// - Capacity entries are upserts with no DELETE, so only an existing entry is edited.
const API = 'http://localhost:3000';
const GROUP = '5';
const OTHER_GROUP = '4';
const BOARD = { id: 5, name: 'Group 5 - AEM/Angular' };
const OTHER_BOARD_NAME = 'Group 4 - Mobile Technologies';
const JOSH = { name: 'Josh Soriaga', eid: 'joshua.a.b.soriaga' }; // group 5

// Old sprints rather than the current one (which depends on today's date), so the
// tests don't move with the calendar. Both have a bucket on BOARD.
const SPRINT = { name: 'Sprint 12', dateRange: 'Aug 10 – Aug 21' }; // 2026-08-10 → 2026-08-21
const OTHER_SPRINT = { name: 'Sprint 11', workingDays: 10 }; // 2026-07-27 → 2026-08-07, has capacity entries

type Task = {
  id: number;
  boardId: number;
  bucketId: number;
  title: string;
  status: string;
  completed: boolean;
  dueDate: string;
  checklist: { id: number; text: string; done: boolean }[];
  comments: { id: number; author: string; text: string; createdAt: string }[];
};
type CapacityEntry = { id: number; sprintName: string; eid: string; cadence: number; admin: number; holiday: number };

/** Kanban column labels, in board order (planner.component.ts kanbanCols). */
type Column = 'New' | 'In Progress' | 'Review' | 'Done';

function ui(page: Page) {
  const main = page.getByRole('main');
  // Kanban columns are plain <div>s, so they're found through their label
  const column = (label: Column) =>
    page.locator('.kanban-col').filter({ has: page.locator('.kanban-col-label', { hasText: new RegExp(`^${label}$`) }) });
  const taskDialog = page.getByRole('dialog');
  // The modal's field labels aren't tied to their controls
  const taskField = (label: string) => taskDialog.locator('.task-field').filter({ hasText: label }).getByRole('combobox');
  const capacityRow = (name: string) =>
    page.locator('.cap-main-table').getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });

  return {
    groupFilter: page.getByRole('complementary').getByRole('combobox'),
    /** A plan card on the board list. Its name starts with the board name, then the description. */
    boardCard: (name: string) => main.getByRole('button', { name: iconName(name, '(\\s|$)') }),
    myPlans: main.getByRole('button', { name: 'My plans', exact: true }),
    /** The toolbar's sprint selector (no label; it's the only select listing sprints). */
    sprint: main.getByRole('combobox').filter({ hasText: SPRINT.name }),
    tab: (name: 'Grid' | 'Board' | 'Dashboard') => main.getByRole('button', { name: iconName(name) }),
    column,
    count: (label: Column) => column(label).locator('.kanban-col-count'),
    // Icon-only buttons: their name is the glyph, and the label is only in the title
    addTask: main.getByTitle('Add task', { exact: true }),
    /** A kanban card, found by its (unique) title. */
    card: (title: string, scope = page.locator('body')) => scope.locator('.planner-card').filter({ hasText: title }),
    markComplete: (title: string) => page.getByRole('button', { name: `Mark ${title} complete`, exact: true }),
    taskDialog,
    taskTitle: taskDialog.getByPlaceholder('Task title'),
    taskStatus: taskField('Status'),
    checklistInput: taskDialog.getByPlaceholder('Add an item'),
    commentAuthor: taskDialog.getByRole('combobox').filter({ hasText: '— Select your name —' }),
    commentInput: taskDialog.getByPlaceholder('Write a comment…'),
    deleteDialog: page.locator('.del-dialog').filter({ has: page.getByRole('heading', { name: 'Delete Task', exact: true }) }),
    gridRow: (title: string) => main.getByRole('row').filter({ hasText: title }),
    search: main.getByPlaceholder('Search tasks…'),
    highlight: (label: string) => main.getByRole('listitem').filter({ hasText: label }).locator('strong'),
    capacityButton: main.getByRole('button', { name: iconName('Capacity Plan') }),
    capacityPanel: page.locator('.planner-capacity-panel'),
    /** Cells of a member's row in the left capacity table: 3 = CADENCE, 6 = CAPACITY. */
    cadence: (name: string) => capacityRow(name).getByRole('cell').nth(3).getByRole('spinbutton'),
    capacity: (name: string) => capacityRow(name).getByRole('cell').nth(6),
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Bootstrap icons render as a private-use glyph that ends up in the accessible name
 * (e.g. "<glyph> Grid"), so match the label after any leading non-word characters.
 * Anchored and case-sensitive, unlike a plain substring match.
 */
const iconName = (label: string, end = '$') => new RegExp(`^\\W*${escapeRegExp(label)}${end}`);

/** Unique per run, so a leftover from a previous run can't cause a false pass. */
const marker = (label: string) => `test-${label}-${Date.now()}`;

/** Fails with the response's status and body, so a setup or cleanup failure explains itself. */
async function expectStatus(res: APIResponse | Response, expected: number[], what: string) {
  expect(expected, `${what} → ${res.status()} ${(await res.text()).slice(0, 300)}`).toContain(res.status());
}

// ---------- API: seeding and cleanup ----------

/** Bucket ids by sprint name on BOARD. */
async function bucketIds(request: APIRequestContext): Promise<Record<string, number>> {
  const res = await request.get(`${API}/api/planner-buckets?boardId=${BOARD.id}`);
  await expectStatus(res, [200], 'GET planner-buckets');
  const buckets: { id: number; name: string }[] = await res.json();
  return Object.fromEntries(buckets.map((b) => [b.name, Number(b.id)]));
}

/** Posts a task the way the task modal does (planner.component.ts emptyTask). */
async function seedTask(request: APIRequestContext, bucketId: number, task: Partial<Task> & { title: string }) {
  const res = await request.post(`${API}/api/planner-tasks`, {
    data: {
      boardId: BOARD.id, bucketId,
      status: 'Not started', priority: 'Medium', startDate: '', dueDate: '',
      labels: [], assignee: '', checklist: [], description: '', acceptanceCriteria: '', comments: [],
      completed: false,
      ...task,
    },
  });
  await expectStatus(res, [201], `POST planner-tasks "${task.title}"`);
  return (await res.json()).id as number;
}

async function capacityEntry(request: APIRequestContext, sprintName: string, eid: string) {
  const res = await request.get(`${API}/api/capacity-entries?sprintName=${encodeURIComponent(sprintName)}`);
  await expectStatus(res, [200], 'GET capacity-entries');
  return ((await res.json()) as CapacityEntry[]).find((e) => e.eid === eid);
}

// ---------- UI ----------

async function openView(page: Page) {
  const boards = page.waitForResponse((r) => r.url().endsWith('/api/planner-boards'));
  const sprints = page.waitForResponse((r) => r.url().endsWith('/api/sprints'));
  await page.goto('/');
  await ui(page).groupFilter.selectOption(GROUP);
  // Sprint Dashboard sits in Planner's submenu, which starts collapsed
  await page.getByRole('button', { name: 'Planner' }).click();
  await page.getByRole('button', { name: 'Sprint Dashboard' }).click();
  // Opening a board needs the sprint list, to pick its default sprint
  await Promise.all([boards, sprints]);
}

/** Open BOARD, wait for its buckets and tasks, then pick a sprint. */
async function openBoard(page: Page, sprint = SPRINT.name) {
  // The buckets response picks the board's default sprint, so it must land before ours
  const loaded = (path: string) =>
    page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith(`${path}?boardId=${BOARD.id}`));
  const buckets = loaded('/api/planner-buckets');
  const tasks = loaded('/api/planner-tasks');
  await ui(page).boardCard(BOARD.name).click();
  await Promise.all([buckets, tasks]);
  await expect(page.getByText('Loading board…')).toHaveCount(0);
  await ui(page).sprint.selectOption(sprint);
  await expect(ui(page).sprint).toHaveValue(sprint);
}

/** The view and the group are kept in localStorage; the board and sprint are not. */
async function reloadAndReopen(page: Page, sprint = SPRINT.name) {
  const sprints = page.waitForResponse((r) => r.url().endsWith('/api/sprints'));
  await page.reload();
  await sprints;
  await openBoard(page, sprint);
}

async function readCount(page: Page, label: Column) {
  return Number(await ui(page).count(label).innerText());
}

// ---------- Tests ----------

test.describe('Planner → Sprint Dashboard', () => {
  // Tests add tasks to the same bucket and count them, so this file runs in one worker, in order
  test.describe.configure({ mode: 'default' });

  let buckets: Record<string, number>;
  let created: number[];
  let capacityToRestore: CapacityEntry | undefined;

  test.beforeEach(async ({ request }) => {
    created = [];
    capacityToRestore = undefined;
    buckets = await bucketIds(request);
    // Selecting a sprint without a bucket would create one, which can't be deleted
    for (const name of [SPRINT.name, OTHER_SPRINT.name]) {
      expect(buckets[name], `board ${BOARD.id} has a bucket for ${name}`).toBeDefined();
    }
  });

  test.afterEach(async ({ request }) => {
    // Runs even when the test fails. A 404 means the test already deleted it.
    for (const id of created) {
      await expectStatus(await request.delete(`${API}/api/planner-tasks/${id}`), [200, 404], `DELETE planner-tasks/${id}`);
    }
    if (capacityToRestore) {
      const { sprintName, eid, cadence, admin, holiday } = capacityToRestore;
      const res = await request.post(`${API}/api/capacity-entries`, { data: { sprintName, eid, cadence, admin, holiday } });
      await expectStatus(res, [200], `restore capacity ${sprintName}/${eid}`);
    }
  });

  test('the board list shows the sidebar group\'s plan and opens it', async ({ page }) => {
    await openView(page);
    const { boardCard, groupFilter, myPlans, column } = ui(page);

    await expect(boardCard(BOARD.name)).toBeVisible();
    await expect(boardCard(OTHER_BOARD_NAME)).toHaveCount(0);

    await boardCard(BOARD.name).click();
    await expect(myPlans).toBeVisible();
    await expect(page.getByRole('main').getByText(BOARD.name, { exact: true })).toBeVisible(); // breadcrumb
    for (const label of ['New', 'In Progress', 'Review', 'Done'] as const) {
      await expect(column(label)).toBeVisible();
    }

    await myPlans.click();
    await groupFilter.selectOption(OTHER_GROUP);
    await expect(boardCard(OTHER_BOARD_NAME)).toBeVisible();
    await expect(boardCard(BOARD.name)).toHaveCount(0);
  });

  test.describe('kanban board', () => {
    test('create a task', async ({ page }) => {
      const title = marker('create');
      await openView(page);
      await openBoard(page);
      const { addTask, taskDialog, taskTitle, column, card, count } = ui(page);
      const before = await readCount(page, 'New');

      await addTask.click();
      await expect(taskDialog).toBeVisible();
      const create = taskDialog.getByRole('button', { name: 'Create task' });
      await expect(create).toBeDisabled();
      await taskTitle.fill('   ');
      await expect(create).toBeDisabled(); // whitespace doesn't count
      await taskTitle.fill(title);

      const saved = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/planner-tasks'),
      );
      await create.click();
      const res = await saved;
      await expectStatus(res, [201], 'create task');
      const task: Task = await res.json();
      created.push(task.id);
      expect(task.bucketId).toBe(buckets[SPRINT.name]); // saved under the selected sprint

      await expect(taskDialog).toHaveCount(0);
      await expect(card(title, column('New'))).toBeVisible();
      await expect(count('New')).toHaveText(String(before + 1));

      await reloadAndReopen(page);
      await expect(card(title, column('New'))).toBeVisible();
    });

    test('edit a task: status, checklist and comment are saved with it', async ({ page, request }) => {
      const title = marker('edit');
      const item = marker('checklist');
      const comment = marker('comment');
      const id = await seedTask(request, buckets[SPRINT.name], { title });
      created.push(id);
      await openView(page);
      await openBoard(page);
      const { card, column, taskDialog, taskStatus, checklistInput, commentAuthor, commentInput } = ui(page);

      await card(title).click();
      await expect(ui(page).taskTitle).toHaveValue(title);
      await taskStatus.selectOption('In progress');
      await checklistInput.fill(item);
      await taskDialog.getByRole('button', { name: 'Add', exact: true }).click();
      await commentAuthor.selectOption(JOSH.name);
      await commentInput.fill(comment);
      await taskDialog.getByRole('button', { name: 'Post', exact: true }).click();
      await expect(taskDialog.getByText(comment)).toBeVisible();

      const saved = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/planner-tasks/${id}`),
      );
      await taskDialog.getByRole('button', { name: 'Save changes' }).click();
      const res = await saved;
      await expectStatus(res, [200], 'save task');
      // Checklist and comments are embedded in the task and saved with it
      const stored: Task = await res.json();
      expect(stored.status).toBe('In progress');
      expect(stored.checklist).toEqual([expect.objectContaining({ text: item, done: false })]);
      expect(stored.comments).toEqual([expect.objectContaining({ author: JOSH.name, text: comment })]);

      await expect(taskDialog).toHaveCount(0);
      await expect(card(title, column('In Progress'))).toBeVisible();

      await reloadAndReopen(page);
      await card(title, column('In Progress')).click();
      await expect(taskDialog.getByText(item)).toBeVisible();
      await expect(taskDialog.getByText(comment)).toBeVisible();
    });

    test('mark a task complete from its card', async ({ page, request }) => {
      const title = marker('complete');
      const id = await seedTask(request, buckets[SPRINT.name], { title });
      created.push(id);
      await openView(page);
      await openBoard(page);
      const { card, column, count, markComplete } = ui(page);
      await expect(card(title, column('New'))).toBeVisible();
      const before = await readCount(page, 'Done');

      const saved = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/planner-tasks/${id}`),
      );
      await markComplete(title).click();
      await expectStatus(await saved, [200], 'complete task');

      await expect(card(title, column('Done'))).toBeVisible();
      await expect(card(title, column('Done'))).toContainText('Completed');
      await expect(count('Done')).toHaveText(String(before + 1));

      await reloadAndReopen(page);
      await expect(card(title, column('Done'))).toBeVisible();
    });

    test('delete a task', async ({ page, request }) => {
      const title = marker('delete');
      const id = await seedTask(request, buckets[SPRINT.name], { title });
      created.push(id);
      // The deletion log can't be deleted afterwards, so it's answered here instead
      const logs: unknown[] = [];
      await page.route(`${API}/api/deletion-logs`, async (route) => {
        logs.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: {} });
      });
      await openView(page);
      await openBoard(page);
      const { card, column, count, taskDialog, deleteDialog } = ui(page);
      const before = await readCount(page, 'New');

      await card(title).click();
      await taskDialog.getByTitle('Delete task', { exact: true }).click();
      await expect(deleteDialog).toBeVisible();
      await expect(deleteDialog).toContainText(title);
      const confirm = deleteDialog.getByRole('button', { name: iconName('Delete Task') });
      await expect(confirm).toBeDisabled();
      await deleteDialog.getByPlaceholder('DELETE').fill('delete');
      await expect(confirm).toBeDisabled(); // must be upper case
      await deleteDialog.getByPlaceholder('DELETE').fill('DELETE');

      const deleted = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/planner-tasks/${id}`),
      );
      await confirm.click();
      await expectStatus(await deleted, [200], 'delete task');

      await expect(deleteDialog).toHaveCount(0);
      await expect(taskDialog).toHaveCount(0);
      await expect(card(title)).toHaveCount(0);
      await expect(count('New')).toHaveText(String(before - 1));
      expect(logs).toEqual([expect.objectContaining({ type: 'task-deletion', taskId: id, taskTitle: title })]);

      await reloadAndReopen(page);
      await expect(column('New')).toBeVisible();
      await expect(card(title)).toHaveCount(0);
    });

    test("switching sprint shows only that sprint's tasks", async ({ page, request }) => {
      const title = marker('sprint');
      created.push(await seedTask(request, buckets[SPRINT.name], { title }));
      await openView(page);
      await openBoard(page);
      const { card, sprint } = ui(page);
      await expect(card(title)).toBeVisible();

      await sprint.selectOption(OTHER_SPRINT.name);
      await expect(card(title)).toHaveCount(0);

      await sprint.selectOption(SPRINT.name);
      await expect(card(title)).toBeVisible();
    });
  });

  test('Grid lists the sprint\'s tasks and search filters them', async ({ page, request }) => {
    const first = marker('grid-a');
    const second = marker('grid-b');
    created.push(await seedTask(request, buckets[SPRINT.name], { title: first }));
    created.push(await seedTask(request, buckets[SPRINT.name], { title: second }));
    await openView(page);
    await openBoard(page);
    const { tab, gridRow, search } = ui(page);

    await tab('Grid').click();
    await expect(gridRow(first)).toBeVisible();
    await expect(gridRow(first)).toContainText(SPRINT.name); // Bucket column
    await expect(gridRow(first)).toContainText('Not started');
    await expect(gridRow(second)).toBeVisible();

    await search.fill(first);
    await expect(gridRow(first)).toBeVisible();
    await expect(gridRow(second)).toHaveCount(0);

    await search.fill('');
    await expect(gridRow(second)).toBeVisible();
  });

  test('Dashboard burndown counts the sprint\'s tasks', async ({ page, request }) => {
    await openView(page);
    await openBoard(page);
    const { tab, highlight } = ui(page);
    const main = page.getByRole('main');

    await tab('Dashboard').click();
    await expect(main.getByText('Sprint Burndown Chart')).toBeVisible();
    await expect(main.getByText(`${SPRINT.dateRange} • 2 weeks`)).toBeVisible();
    // The highlights only show once the sprint has a task
    await expect(highlight('Total sprint tasks:'), `${SPRINT.name} already has tasks`).toBeVisible();
    const total = Number(await highlight('Total sprint tasks:').innerText());
    const completed = Number(await highlight('Completed so far:').innerText());

    // One open task, and one completed task due inside the (past) sprint, which counts as burned
    created.push(await seedTask(request, buckets[SPRINT.name], { title: marker('burndown-open') }));
    created.push(
      await seedTask(request, buckets[SPRINT.name], {
        title: marker('burndown-done'), status: 'Completed', completed: true, dueDate: '2026-08-12',
      }),
    );
    await reloadAndReopen(page);
    await tab('Dashboard').click();

    await expect(highlight('Total sprint tasks:')).toHaveText(String(total + 2));
    await expect(highlight('Completed so far:')).toHaveText(String(completed + 1));
    await expect(highlight('Remaining (latest day):')).toHaveText(String(total + 2 - (completed + 1)));
  });

  test('Capacity Plan shows the sprint and saves a cadence edit', async ({ page, request }) => {
    const original = await capacityEntry(request, OTHER_SPRINT.name, JOSH.eid);
    expect(original, `${JOSH.eid} has a capacity entry for ${OTHER_SPRINT.name}`).toBeDefined();
    await openView(page);
    await openBoard(page, OTHER_SPRINT.name);
    const { capacityButton, capacityPanel, cadence, capacity } = ui(page);

    await capacityButton.click();
    await expect(capacityPanel).toContainText(`Capacity Plan — ${OTHER_SPRINT.name}`);
    await expect(capacityPanel).toContainText(`Group ${GROUP} – ${OTHER_SPRINT.name}`);
    await expect(capacityPanel.locator('.cap-sprint-info-cell').filter({ hasText: 'DAYS IN SPRINT' })).toContainText(
      String(OTHER_SPRINT.workingDays),
    );
    await expect(page.getByText('Loading attendance data…')).toHaveCount(0);
    await expect(cadence(JOSH.name)).toHaveValue(String(original!.cadence));
    const before = Number(await capacity(JOSH.name).innerText());
    expect(before, `${JOSH.name} has capacity left to reduce`).toBeGreaterThan(0);

    capacityToRestore = original;
    // The panel polls attendance and tasks every 2.5 s, so wait for this exact save
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/capacity-entries'),
    );
    await cadence(JOSH.name).fill(String(original!.cadence + 1));
    await cadence(JOSH.name).blur(); // saves on change, not on every keystroke
    const res = await saved;
    await expectStatus(res, [200], 'save capacity');
    expect(res.request().postDataJSON()).toMatchObject({
      sprintName: OTHER_SPRINT.name, eid: JOSH.eid, cadence: original!.cadence + 1,
    });

    await expect(capacity(JOSH.name)).toHaveText(String(before - 1));
    expect((await capacityEntry(request, OTHER_SPRINT.name, JOSH.eid))?.cadence).toBe(original!.cadence + 1);
  });
});
