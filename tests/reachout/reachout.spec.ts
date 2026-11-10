import { test, expect, Page, APIRequestContext } from '@playwright/test';

// The specs talk to the real API (and so to the real server/data/db.json), so every
// reachout created here, through the UI or the API, is deleted in afterEach.
const API = 'http://localhost:3000';
const GROUP = '5';
const GROUP_LABEL = 'Group 5 - AEM/Angular';
const JOSH = { name: 'Josh Soriaga', eid: 'joshua.a.b.soriaga' }; // group 5
const POC = 'hannahdel.l.orellosa';

type Reachout = {
  eid: string;
  projectName: string;
  techRole: string;
  pocEid: string;
  status?: string;
  details?: string;
  groupNumber: number | null;
};

function ui(page: Page) {
  const dialog = (title: string) =>
    page.locator('.del-dialog').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const formDialog = page.locator('.reachout-form-dialog');
  // Each field is a <label> wrapping its control; anchored so "EID" doesn't also match "POC EID"
  const field = (label: string) => formDialog.getByLabel(new RegExp(`^${label}`));

  return {
    addButton: page.getByRole('button', { name: 'Add new reachout' }),
    /** "Showing N reachouts for <group>" */
    scope: page.locator('.reachout-scope'),
    /** A row, found by its (unique) project name. */
    row: (projectName: string) => page.getByRole('row').filter({ hasText: projectName }),
    statusSelect: (projectName: string) =>
      page.getByRole('row').filter({ hasText: projectName }).getByRole('combobox', { name: /^Status for / }),
    newDialog: dialog('New reachout'),
    editDialog: dialog('Edit reachout'),
    deleteDialog: dialog('Delete reachout'),
    field: {
      eid: field('EID'),
      group: field('Group'),
      projectName: field('Project Name'),
      techRole: field('Tech / Role'),
      pocEid: field('POC EID'),
      status: field('Status'),
      details: field('Details'),
    },
  };
}

/** Unique per run, so a leftover can't cause a false pass. */
const marker = (label: string) => `test-${label}-${Date.now()}`;

// ---------- API: seeding ----------

async function seedReachout(request: APIRequestContext, overrides: Partial<Reachout> & { projectName: string }) {
  const res = await request.post(`${API}/api/project-reachouts`, {
    data: {
      eid: JOSH.eid,
      techRole: 'Angular Developer',
      pocEid: POC,
      groupNumber: Number(GROUP),
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id as number;
}

// ---------- UI ----------

async function openView(page: Page, group = GROUP) {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('combobox').selectOption(group);
  await page.getByRole('button', { name: 'Project Reachouts' }).click();
  await expect(page.getByText('Loading reachouts…')).toHaveCount(0);
}

async function readShowing(page: Page) {
  const text = await ui(page).scope.innerText();
  return Number(/Showing (\d+)/.exec(text)?.[1]);
}

// ---------- Tests ----------

test.describe('Project Reachouts', () => {
  // Tests count the rows of the same group, so this file runs in one worker, in order
  test.describe.configure({ mode: 'default' });

  let created: number[];

  test.beforeEach(() => {
    created = [];
  });

  test.afterEach(async ({ request }) => {
    // Runs even when the test fails. A 404 means the test already deleted it.
    for (const id of created) {
      const res = await request.delete(`${API}/api/project-reachouts/${id}`);
      expect([200, 404]).toContain(res.status());
    }
  });

  test.describe('add', () => {
    test.beforeEach(async ({ page }) => {
      await openView(page);
    });

    test('add a reachout', async ({ page }) => {
      const project = marker('add');
      const { addButton, newDialog, field, row, scope } = ui(page);
      const before = await readShowing(page);

      await addButton.click();
      await expect(newDialog).toBeVisible();
      await expect(newDialog).toContainText('Status defaults to CV Requested');
      // Pre-filled from the sidebar, so the new row stays visible after saving
      await expect(field.group).toHaveValue(GROUP);
      await expect(field.status).toHaveValue('CV Requested');

      await field.eid.fill(JOSH.eid);
      await field.projectName.fill(project);
      await field.techRole.fill('Angular Developer');
      await field.pocEid.fill(POC);

      const saved = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/project-reachouts'),
      );
      await newDialog.getByRole('button', { name: 'Add reachout' }).click();
      const res = await saved;
      expect(res.status()).toBe(201);
      created.push((await res.json()).id);

      await expect(newDialog).toHaveCount(0);
      await expect(row(project)).toContainText(JOSH.eid);
      await expect(row(project)).toContainText(JOSH.name); // name from the onboarding profile
      await expect(row(project)).toContainText(`Group ${GROUP}`);
      await expect(row(project)).toContainText('—'); // no details
      await expect(ui(page).statusSelect(project)).toHaveValue('CV Requested');
      await expect(scope).toContainText(`Showing ${before + 1}`);

      // The view and the group are kept in localStorage
      await page.reload();
      await expect(row(project)).toBeVisible();
    });

    test('Add reachout stays disabled until every required field is filled', async ({ page }) => {
      const { addButton, newDialog, field } = ui(page);
      const submit = newDialog.getByRole('button', { name: 'Add reachout' });

      await addButton.click();
      await expect(submit).toBeDisabled();

      await field.eid.fill(JOSH.eid);
      await field.projectName.fill(marker('required'));
      await field.techRole.fill('Angular Developer');
      await expect(submit).toBeDisabled(); // POC EID still missing

      await field.pocEid.fill('   ');
      await expect(submit).toBeDisabled(); // whitespace doesn't count

      await field.pocEid.fill(POC);
      await expect(submit).toBeEnabled();

      await newDialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(newDialog).toHaveCount(0);
    });

    test("typing a known EID fills in that resource's group", async ({ page, request }) => {
      const roster: { eid: string; groupNumber: unknown }[] = await (
        await request.get(`${API}/api/onboarding-resources`)
      ).json();
      const other = roster.find((r) => String(r.groupNumber) === '4');
      expect(other, 'a group 4 resource on the roster').toBeDefined();
      const { addButton, field } = ui(page);

      await addButton.click();
      await expect(field.group).toHaveValue(GROUP);
      await field.eid.fill(other!.eid);
      await expect(field.group).toHaveValue('4');
    });
  });

  test.describe('existing reachout', () => {
    let project: string;

    test.beforeEach(async ({ page, request }) => {
      project = marker('existing');
      created.push(await seedReachout(request, { projectName: project }));
      await openView(page);
      await expect(ui(page).row(project)).toBeVisible();
    });

    test('edit a reachout', async ({ page }) => {
      const renamed = `${project}-edited`;
      const details = marker('details');
      const { row, editDialog, field } = ui(page);

      await row(project).getByTitle('Edit reachout').click();
      await expect(editDialog).toBeVisible();
      await expect(field.eid).toHaveValue(JOSH.eid);
      await expect(field.projectName).toHaveValue(project);
      await expect(field.group).toHaveValue(GROUP);

      await field.projectName.fill(renamed);
      await field.details.fill(details);
      await editDialog.getByRole('button', { name: 'Save changes' }).click();

      await expect(editDialog).toHaveCount(0);
      await expect(row(renamed)).toContainText(details);

      await page.reload();
      await expect(row(renamed)).toContainText(details);
    });

    test('change the status inline', async ({ page }) => {
      const { statusSelect } = ui(page);
      const select = statusSelect(project);
      await expect(select).toHaveValue('CV Requested');

      const saved = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().includes('/api/project-reachouts/'),
      );
      await select.selectOption('Interview Scheduled');
      const res = await saved;
      expect(res.ok()).toBeTruthy();
      // Only the status is sent
      expect(res.request().postDataJSON()).toEqual({ status: 'Interview Scheduled' });

      await expect(select).toHaveValue('Interview Scheduled');
      // The pill colour follows the status
      await expect(select).toHaveClass(/reachout-status-interview-scheduled/);

      await page.reload();
      await expect(select).toHaveValue('Interview Scheduled');
    });

    test('delete a reachout', async ({ page }) => {
      const { row, deleteDialog, scope } = ui(page);
      const before = await readShowing(page);

      await row(project).getByTitle('Delete reachout').click();
      await expect(deleteDialog).toBeVisible();
      await expect(deleteDialog).toContainText(project);
      await expect(deleteDialog).toContainText(JOSH.eid);
      await expect(deleteDialog).toContainText(`Group ${GROUP}`);

      await deleteDialog.getByRole('button', { name: 'Delete reachout' }).click();
      await expect(deleteDialog).toHaveCount(0);
      await expect(row(project)).toHaveCount(0);
      await expect(scope).toContainText(`Showing ${before - 1}`);

      await page.reload();
      await expect(row(project)).toHaveCount(0);
    });

    test('cancelling the delete keeps the row', async ({ page }) => {
      const { row, deleteDialog } = ui(page);

      await row(project).getByTitle('Delete reachout').click();
      await deleteDialog.getByRole('button', { name: 'Cancel' }).click();

      await expect(deleteDialog).toHaveCount(0);
      await expect(row(project)).toBeVisible();
    });
  });

  test('the sidebar group filters the table', async ({ page, request }) => {
    const project = marker('group4');
    created.push(await seedReachout(request, { projectName: project, groupNumber: 4 }));
    const { row, scope } = ui(page);

    await openView(page);
    await expect(scope).toContainText(GROUP_LABEL);
    await expect(row(project)).toHaveCount(0);

    // Filtering is client-side, so it changes without a refetch
    const sidebar = page.getByRole('complementary').getByRole('combobox');
    await sidebar.selectOption('');
    await expect(scope).toContainText('All Groups');
    await expect(row(project)).toBeVisible();

    await sidebar.selectOption('4');
    await expect(row(project)).toContainText('Group 4');
  });
});
