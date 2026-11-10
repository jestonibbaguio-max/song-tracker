import { test, expect, Page } from '@playwright/test';

// Mock Interview is a frontend-only mock: the summary, highlights, head count statuses
// and feedback all live in localStorage. Each test gets a fresh browser context, so it
// starts from the defaults and needs no cleanup, and the tests can run in parallel.
const API = 'http://localhost:3000';
const GROUP = '5';
const JOSH = { name: 'Josh Soriaga', eid: 'joshua.a.b.soriaga' };
const ADRIAN = { name: 'Adrian Bartolome', eid: 'adrian.m.bartolome' };

const STREAMS = ['Step 1: Communication', 'Step 2: Technical', 'Step 3: Client Interviews'];

/** Cell positions in the summary table. */
const SUMMARY_COL = {
  totalResources: 1,
  totalConducted: 3,
  totalPassed: 4,
  totalFailed: 5,
  passRate: 6,
  failRate: 7,
} as const;

function ui(page: Page) {
  const rowWith = (text: string) =>
    page.getByRole('row').filter({ has: page.getByRole('cell', { name: text, exact: true }) });
  const modal = page.locator('.modal-content');
  const highlights = page.locator('.mock-summary__highlights');

  return {
    // The tabs are plain <span>s without a tab role
    tab: (name: 'Summary Table' | 'Feedback' | 'Head Count') => page.getByText(name, { exact: true }),

    // ----- Summary Table -----
    summaryRow: rowWith,
    summaryCell: (stream: string, col: keyof typeof SUMMARY_COL) =>
      rowWith(stream).getByRole('cell').nth(SUMMARY_COL[col]),
    // The two "+" buttons have no accessible name beyond the "+"
    addRowButton: page.locator('.btn-add-row'),
    modal,
    /** A modal field, found by its label text (the labels aren't linked to their inputs). */
    modalField: (label: string) => modal.locator('.form-group').filter({ hasText: label }).locator('input, textarea'),
    modalSave: modal.getByRole('button', { name: 'Save' }),
    modalCancel: modal.getByRole('button', { name: 'Cancel' }),
    highlights,
    highlight: (text: string) => highlights.getByRole('listitem').filter({ hasText: text }),
    addHighlightButton: highlights.locator('.btn-add-highlight'),

    // ----- Head Count -----
    headCountFilter: page.getByLabel('Filter Head Count'),
    headCountRow: rowWith,
    status: (name: string, field: 'Communication' | 'Technical' | 'Client interview') =>
      rowWith(name).getByRole('button', { name: new RegExp(`^${field} status:`) }),
    columnHeader: (prefix: string) => page.getByRole('columnheader', { name: new RegExp(`^${prefix} \\(\\d+\\)$`) }),

    // ----- Feedback -----
    feedbackFilter: page.getByLabel('Filter Feedback'),
    feedbackHeader: (name: string) => page.locator('.feedback-item__header').filter({ hasText: name }),
    feedbackEditor: page.locator('.feedback-item .ql-editor'),
    submission: (text: string) => page.locator('.feedback-item__submission').filter({ hasText: text }),
  };
}

/** Unique per run, so a leftover can't cause a false pass. */
const marker = (label: string) => `test-${label}-${Date.now()}`;

async function openView(page: Page) {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('combobox').selectOption(GROUP);
  await page.getByRole('button', { name: 'Mock Interview' }).click();
  await expect(ui(page).summaryRow(STREAMS[0])).toBeVisible();
}

/** Narrow the Head Count table to one resource, and close the suggestions so they don't cover the rows. */
async function filterHeadCount(page: Page, term: string) {
  const { tab, headCountFilter } = ui(page);
  await tab('Head Count').click();
  await headCountFilter.fill(term);
  await headCountFilter.blur();
}

/** Each click moves a status one step along this cycle, back to Pending after Fail. */
const STATUS_CYCLE = ['Pending', 'Conducted', 'Pass', 'Fail'] as const;

/**
 * Click a Pending status forward to the wanted label, waiting for each step.
 * (The label updates just after the click, so reading it straight back can be stale.)
 */
async function setStatus(page: Page, name: string, field: 'Communication', label: (typeof STATUS_CYCLE)[number]) {
  const button = ui(page).status(name, field);
  await expect(button).toHaveText('Pending');
  for (const next of STATUS_CYCLE.slice(1, STATUS_CYCLE.indexOf(label) + 1)) {
    await button.click();
    await expect(button).toHaveText(next);
  }
}

test.describe('Mock Interview', () => {
  test.beforeEach(async ({ page }) => {
    // confirm() guards the deletes; accept unless a test says otherwise
    page.on('dialog', (dialog) => dialog.accept());
    await openView(page);
  });

  test.describe('Summary Table', () => {
    test("lists the three streams with the group's resource count", async ({ page, request }) => {
      const roster = await (await request.get(`${API}/api/onboarding-resources`)).json();
      const groupSize = roster.filter((r: { groupNumber: unknown }) => String(r.groupNumber) === GROUP).length;
      const { summaryRow, summaryCell, highlights } = ui(page);

      for (const stream of STREAMS) {
        await expect(summaryRow(stream)).toBeVisible();
        await expect(summaryCell(stream, 'totalResources')).toHaveText(String(groupSize));
        await expect(summaryCell(stream, 'totalConducted')).toHaveText('0');
      }
      // A group starts with no highlights
      await expect(highlights.getByRole('listitem')).toHaveCount(0);
    });

    test('add a row', async ({ page }) => {
      const stream = marker('stream');
      const { addRowButton, modal, modalField, modalSave, summaryRow } = ui(page);

      await addRowButton.click();
      await expect(modal.getByRole('heading', { name: 'Edit Assessment Row' })).toBeVisible();
      await expect(modalField('Assessment Stream:')).toHaveValue('New Step');
      await modalField('Assessment Stream:').fill(stream);
      await modalSave.click();

      await expect(modal).toHaveCount(0);
      await expect(summaryRow(stream)).toBeVisible();

      await page.reload();
      await expect(summaryRow(stream)).toBeVisible();
    });

    test('cancelling a new row adds nothing', async ({ page }) => {
      // Regression: the new row used to be added before the modal opened, so Cancel left it behind
      const { addRowButton, modal, modalCancel, summaryRow } = ui(page);

      await addRowButton.click();
      await modalCancel.click();

      await expect(modal).toHaveCount(0);
      await expect(summaryRow('New Step')).toHaveCount(0);
    });

    test('edit a stream name', async ({ page }) => {
      const renamed = marker('renamed');
      const { summaryRow, modal, modalField, modalSave } = ui(page);

      await summaryRow(STREAMS[0]).getByTitle('Edit').click();
      // The first three streams take their pass/fail counts from Head Count
      await expect(modal.getByText('Pass/fail counts are calculated from Head Count results.')).toBeVisible();
      await expect(modalField('Total Passed:')).toHaveAttribute('readonly', '');
      await modalField('Assessment Stream:').fill(renamed);
      await modalSave.click();

      await expect(summaryRow(renamed)).toBeVisible();
      await expect(summaryRow(STREAMS[0])).toHaveCount(0);

      await page.reload();
      await expect(summaryRow(renamed)).toBeVisible();
    });

    test('cancelling an edit keeps the row as it was', async ({ page }) => {
      const { summaryRow, modal, modalField, modalCancel } = ui(page);

      await summaryRow(STREAMS[0]).getByTitle('Edit').click();
      await modalField('Assessment Stream:').fill(marker('discarded'));
      await modalCancel.click();

      await expect(modal).toHaveCount(0);
      await expect(summaryRow(STREAMS[0])).toBeVisible();
    });

    test('delete a row', async ({ page }) => {
      const { summaryRow } = ui(page);

      await summaryRow(STREAMS[2]).getByTitle('Delete').click();
      await expect(summaryRow(STREAMS[2])).toHaveCount(0);
      await expect(summaryRow(STREAMS[0])).toBeVisible();

      await page.reload();
      await expect(summaryRow(STREAMS[2])).toHaveCount(0);
    });

    test('dismissing the delete confirmation keeps the row', async ({ page }) => {
      const { summaryRow } = ui(page);
      page.removeAllListeners('dialog');
      page.once('dialog', (dialog) => dialog.dismiss());

      await summaryRow(STREAMS[2]).getByTitle('Delete').click();
      await expect(summaryRow(STREAMS[2])).toBeVisible();
    });

    test('add, edit and delete a highlight', async ({ page }) => {
      const text = marker('highlight');
      const edited = `${text}-edited`;
      const { addHighlightButton, modal, modalField, modalSave, highlight } = ui(page);

      await addHighlightButton.click();
      await expect(modal.getByRole('heading', { name: 'Add Highlight' })).toBeVisible();
      await modalField('Highlight Text:').fill(text);
      await modalSave.click();
      await expect(highlight(text)).toBeVisible();

      await highlight(text).getByTitle('Edit').click();
      await expect(modal.getByRole('heading', { name: 'Edit Highlight' })).toBeVisible();
      await expect(modalField('Highlight Text:')).toHaveValue(text);
      await modalField('Highlight Text:').fill(edited);
      await modalSave.click();
      await expect(highlight(edited)).toBeVisible();

      await page.reload();
      await expect(highlight(edited)).toBeVisible();

      await highlight(edited).getByTitle('Delete').click();
      await expect(highlight(edited)).toHaveCount(0);
    });
  });

  test.describe('Head Count', () => {
    test('a status cycles Pending → Conducted → Pass → Fail → Pending', async ({ page }) => {
      await filterHeadCount(page, JOSH.eid);
      const button = ui(page).status(JOSH.name, 'Communication');

      await expect(button).toHaveText('Pending');
      await expect(button).toHaveAttribute('aria-pressed', 'false');

      // One full lap, ending back on Pending
      for (const next of [...STATUS_CYCLE.slice(1), 'Pending'] as const) {
        await button.click();
        await expect(button).toHaveText(next);
        await expect(button).toHaveAttribute('aria-pressed', String(next !== 'Pending'));
      }
    });

    test('statuses feed the column total and the summary table, and persist after reload', async ({ page }) => {
      const { columnHeader, tab, summaryCell } = ui(page);
      const stream = STREAMS[0];

      await filterHeadCount(page, JOSH.eid);
      await setStatus(page, JOSH.name, 'Communication', 'Pass');
      await filterHeadCount(page, ADRIAN.eid);
      await setStatus(page, ADRIAN.name, 'Communication', 'Fail');
      await expect(columnHeader('Communication')).toHaveText('Communication (2)');
      await expect(columnHeader('Technical')).toHaveText('Technical (0)');

      const expectSummary = async () => {
        await tab('Summary Table').click();
        await expect(summaryCell(stream, 'totalConducted')).toHaveText('2');
        await expect(summaryCell(stream, 'totalPassed')).toHaveText('1');
        await expect(summaryCell(stream, 'totalFailed')).toHaveText('1');
        await expect(summaryCell(stream, 'passRate')).toHaveText('50%');
        await expect(summaryCell(stream, 'failRate')).toHaveText('50%');
        // Other streams are untouched
        await expect(summaryCell(STREAMS[1], 'totalConducted')).toHaveText('0');
      };

      await expectSummary();
      await page.reload();
      await expectSummary();
    });

    test('filter by name or EID', async ({ page }) => {
      const { headCountRow, headCountFilter } = ui(page);

      await filterHeadCount(page, 'soriaga');
      await expect(headCountRow(JOSH.name)).toBeVisible();
      await expect(headCountRow(ADRIAN.name)).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear filter' }).click();
      await expect(headCountFilter).toHaveValue('');
      // Sorted by name, so Adrian is back on page 1
      await expect(headCountRow(ADRIAN.name)).toBeVisible();
    });

    test('clicking a column header shows only resources with a status in it', async ({ page }) => {
      const { headCountRow, columnHeader } = ui(page);

      await filterHeadCount(page, JOSH.eid);
      await setStatus(page, JOSH.name, 'Communication', 'Conducted');
      await page.getByRole('button', { name: 'Clear filter' }).click();
      await expect(headCountRow(ADRIAN.name)).toBeVisible();

      await columnHeader('Communication').click();
      await expect(headCountRow(JOSH.name)).toBeVisible();
      await expect(headCountRow(ADRIAN.name)).toHaveCount(0);

      // Clicking again clears the column filter
      await columnHeader('Communication').click();
      await expect(headCountRow(ADRIAN.name)).toBeVisible();
    });
  });

  test.describe('Feedback', () => {
    test('submit feedback for a resource', async ({ page }) => {
      const text = marker('feedback');
      const { tab, feedbackFilter, feedbackHeader, feedbackEditor, submission } = ui(page);

      await tab('Feedback').click();
      await feedbackFilter.fill(JOSH.eid);
      await feedbackFilter.blur();
      await feedbackHeader(JOSH.name).click();

      await feedbackEditor.click();
      await feedbackEditor.pressSequentially(text);
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(submission(text)).toBeVisible();
      await expect(submission(text)).toContainText('Date Posted:');

      // Expanded sections aren't remembered, but submissions are
      await page.reload();
      await tab('Feedback').click();
      await feedbackFilter.fill(JOSH.eid);
      await feedbackFilter.blur();
      await feedbackHeader(JOSH.name).click();
      await expect(submission(text)).toBeVisible();
    });
  });
});
