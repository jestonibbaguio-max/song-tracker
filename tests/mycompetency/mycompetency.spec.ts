import { test, expect, Page, APIRequestContext } from '@playwright/test';

// The specs talk to the real API (and so to the real server/data/db.json), so every
// record touched here is restored in afterEach. See CLAUDE.md "Gotchas".
const API = 'http://localhost:3000';
const GROUP = '5'; // the view's default group

// Both are in group 5 and have saved competency records (restoring a default row
// would otherwise create one). Their CL levels put them on either side of the bar.
const JOSHUA = 'joshua.a.b.soriaga'; // CL 10 → minimum P3
const KRIZEL = 'krizel.b.bartolome'; // CL 11 → minimum P2
const TOUCHED = [JOSHUA, KRIZEL];

type Proficiency = 'N/A' | 'TBD' | 'P1' | 'P2' | 'P3' | 'P3+' | 'P4' | 'P5';
type Fields = { primaryProficiency: Proficiency; secondarySkill: string; secondaryProficiency: Proficiency };
const FIELDS = ['primaryProficiency', 'secondarySkill', 'secondaryProficiency'] as const;

/** Cell positions in the details grid (mycompetency.component.html). */
const COL = { primaryProficiency: 3, secondarySkill: 6, secondaryProficiency: 7 } as const;

/** Column order of each half of the MYCOMPETENCY STATUS table. */
const SUMMARY_COLUMNS = ['completed', 'notStarted', 'belowP2', 'p2AndAbove', 'noAssessment'] as const;
type SummaryColumn = (typeof SUMMARY_COLUMNS)[number];
type Summary = Record<SummaryColumn, number>;
type Side = 'primary' | 'secondary';

/** Row backgrounds from DASHBOARD_POLICIES.md §5, as computed styles. */
const ROW_COLOUR = { green: 'rgb(200, 230, 201)', yellow: 'rgb(255, 241, 118)' } as const; // #c8e6c9, #fff176

function ui(page: Page) {
  const statusTable = page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Primary Skill Assessment' }) });
  /** The resource's row in the details grid. Its Name column shows the EID. */
  const row = (eid: string) =>
    page.getByRole('row').filter({ has: page.getByRole('cell', { name: eid, exact: true }) });
  const cell = (eid: string, col: keyof typeof COL) => row(eid).getByRole('cell').nth(COL[col]);
  // The requirement counters are plain spans, with no role or label to target
  const counter = (label: string) =>
    page.locator('.comp-req-block').filter({ hasText: label }).locator('.comp-req-count');

  return {
    row,
    primaryProficiency: (eid: string) => cell(eid, 'primaryProficiency').getByRole('combobox'),
    secondaryProficiency: (eid: string) => cell(eid, 'secondaryProficiency').getByRole('combobox'),
    secondarySkill: (eid: string) => cell(eid, 'secondarySkill').getByRole('textbox'),
    /** e.g. summaryCell('secondary', 'noAssessment'). The secondary half starts at column 5. */
    summaryCell: (side: Side, column: SummaryColumn) =>
      statusTable
        .getByRole('row')
        .last()
        .getByRole('cell')
        .nth((side === 'secondary' ? SUMMARY_COLUMNS.length : 0) + SUMMARY_COLUMNS.indexOf(column)),
    primaryMeetsReq: counter('Primary — Meets Minimum Requirement'),
    secondaryMeetsReq: counter('Secondary — Meets P3 Minimum'),
  };
}

// ---------- API: seeding and restoring ----------

async function getRecord(request: APIRequestContext, eid: string) {
  const res = await request.get(`${API}/api/competency-records?group=${GROUP}`);
  expect(res.ok()).toBeTruthy();
  const record = (await res.json()).find((r: { eid: string }) => r.eid === eid);
  expect(record, `${eid} is in group ${GROUP}`).toBeDefined();
  return record as Fields & { clLevel: string | number };
}

async function patchRecord(request: APIRequestContext, eid: string, fields: Partial<Fields>) {
  const res = await request.patch(`${API}/api/competency-records/${eid}`, { data: fields });
  expect(res.ok()).toBeTruthy();
}

// ---------- UI ----------

/** Seed the record, open the view and wait until the seeded values are on screen. */
async function seedAndOpen(page: Page, request: APIRequestContext, eid: string, seed: Partial<Fields>) {
  await patchRecord(request, eid, seed);
  await page.goto('/');
  await page.getByRole('button', { name: 'myCompetency' }).click();

  const { row, primaryProficiency, secondaryProficiency, secondarySkill } = ui(page);
  await expect(row(eid)).toBeVisible();
  if (seed.primaryProficiency) await expect(primaryProficiency(eid)).toHaveValue(seed.primaryProficiency);
  if (seed.secondaryProficiency) await expect(secondaryProficiency(eid)).toHaveValue(seed.secondaryProficiency);
  if (seed.secondarySkill !== undefined) await expect(secondarySkill(eid)).toHaveValue(seed.secondarySkill);
}

/** Run a UI edit and wait for the PATCH it triggers to succeed. */
async function saveVia(page: Page, eid: string, edit: () => Promise<unknown>) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/competency-records/${eid}`),
  );
  await edit();
  expect((await saved).ok()).toBeTruthy();
}

/** A UI edit on one resource's row, with a label for the test title. */
type Edit = { label: string; run: (page: Page, eid: string) => Promise<void> };

const setPrimary = (value: Proficiency): Edit => ({
  label: `primary → ${value}`,
  run: (page, eid) => saveVia(page, eid, () => ui(page).primaryProficiency(eid).selectOption(value)),
});

const setSecondary = (value: Proficiency): Edit => ({
  label: `secondary → ${value}`,
  run: (page, eid) => saveVia(page, eid, () => ui(page).secondaryProficiency(eid).selectOption(value)),
});

const setSecondarySkill = (value: string): Edit => ({
  label: value ? `secondary skill → "${value}"` : 'secondary skill cleared',
  // The input saves on blur, not on every keystroke
  run: (page, eid) =>
    saveVia(page, eid, async () => {
      const input = ui(page).secondarySkill(eid);
      await input.fill(value);
      await input.blur();
    }),
});

// ---------- Summary and counters ----------

async function readSummary(page: Page, side: Side): Promise<Summary> {
  const { summaryCell } = ui(page);
  const entries = await Promise.all(
    SUMMARY_COLUMNS.map(async (col) => [col, Number(await summaryCell(side, col).innerText())] as const),
  );
  return Object.fromEntries(entries) as Summary;
}

function applyDelta(summary: Summary, delta: Partial<Summary>): Summary {
  const out = { ...summary };
  for (const [col, d] of Object.entries(delta)) out[col as SummaryColumn] += d;
  return out;
}

/** toHaveText retries, so this waits out Angular's change detection. */
async function expectSummary(page: Page, side: Side, expected: Summary) {
  const { summaryCell } = ui(page);
  for (const col of SUMMARY_COLUMNS) {
    await expect(summaryCell(side, col), `${side} summary "${col}"`).toHaveText(String(expected[col]));
  }
}

/** Parses a requirement counter, e.g. "12 / 36". */
async function readCounter(counter: ReturnType<typeof ui>['primaryMeetsReq']) {
  const [met, total] = (await counter.innerText()).split('/').map((s) => Number(s.trim()));
  return { met, total };
}

// ---------- Cases ----------

// docs/found-bugs.md L19: the PATCH response has no clLevel and replaces the row, so
// a CL 11/12 row is judged by the CL 10–6 bar until reload. Cases that hit it are
// marked test.fail, and start failing loudly (as "expected to fail") once it's fixed.
const BUG_L19 = 'L19: PATCH response drops clLevel, so CL 11/12 rows use the P3 bar until reload';

/**
 * Primary levels are bucketed as N/A/TBD → Not Started, P1 → Below P2,
 * P2 and up → P2 & Above.
 */
const PRIMARY_SUMMARY_CASES: { from: Proficiency; to: Proficiency; delta: Partial<Summary> }[] = [
  { from: 'N/A', to: 'P1', delta: { notStarted: -1, completed: +1, belowP2: +1 } },
  { from: 'P1', to: 'P2', delta: { belowP2: -1, p2AndAbove: +1 } },
  { from: 'P3+', to: 'TBD', delta: { p2AndAbove: -1, completed: -1, notStarted: +1 } },
  // Same bucket: the summary must not move
  { from: 'P2', to: 'P3+', delta: {} },
];

/** Green when the primary level meets the CL minimum (P2 for CL 11/12, P3 for CL 10–6). */
const ROW_COLOUR_CASES: {
  eid: string;
  cl: number;
  from: Proficiency;
  to: Proficiency;
  colours: [keyof typeof ROW_COLOUR, keyof typeof ROW_COLOUR];
  knownBug?: string;
}[] = [
  { eid: KRIZEL, cl: 11, from: 'P1', to: 'P2', colours: ['yellow', 'green'], knownBug: BUG_L19 },
  { eid: KRIZEL, cl: 11, from: 'P2', to: 'TBD', colours: ['green', 'yellow'] },
  { eid: JOSHUA, cl: 10, from: 'P2', to: 'P3', colours: ['yellow', 'green'] },
  // P2 is green for CL 11/12 but below the bar for CL 10–6
  { eid: JOSHUA, cl: 10, from: 'P3+', to: 'P2', colours: ['green', 'yellow'] },
];

/** Primary counter follows the same CL minimum as the row colour. */
const PRIMARY_REQ_CASES: { eid: string; seed: Partial<Fields>; edit: Edit; delta: number; knownBug?: string }[] = [
  { eid: KRIZEL, seed: { primaryProficiency: 'P1' }, edit: setPrimary('P2'), delta: +1, knownBug: BUG_L19 },
  { eid: JOSHUA, seed: { primaryProficiency: 'P1' }, edit: setPrimary('P2'), delta: 0 },
  { eid: JOSHUA, seed: { primaryProficiency: 'P2' }, edit: setPrimary('P3'), delta: +1 },
  { eid: JOSHUA, seed: { primaryProficiency: 'P3' }, edit: setPrimary('N/A'), delta: -1 },
];

/** Secondary counter needs a secondary skill and P3 or above, for every CL level. */
const SECONDARY_REQ_CASES: { eid: string; seed: Partial<Fields>; edit: Edit; delta: number }[] = [
  { eid: KRIZEL, seed: { secondarySkill: 'Java', secondaryProficiency: 'P2' }, edit: setSecondary('P3'), delta: +1 },
  { eid: JOSHUA, seed: { secondarySkill: 'Java', secondaryProficiency: 'P3+' }, edit: setSecondary('P1'), delta: -1 },
  { eid: JOSHUA, seed: { secondarySkill: '', secondaryProficiency: 'P3' }, edit: setSecondarySkill('Java'), delta: +1 },
  { eid: JOSHUA, seed: { secondarySkill: 'Java', secondaryProficiency: 'P3' }, edit: setSecondarySkill(''), delta: -1 },
];

/**
 * Secondary buckets match the primary ones, except that no skill and no level
 * counts as No Assessment Available instead of Not Started.
 */
const SECONDARY_SUMMARY_CASES: { seed: Partial<Fields>; edit: Edit; delta: Partial<Summary> }[] = [
  { seed: { secondarySkill: '', secondaryProficiency: 'N/A' }, edit: setSecondarySkill('Java'), delta: { noAssessment: -1, notStarted: +1 } },
  { seed: { secondarySkill: 'Java', secondaryProficiency: 'N/A' }, edit: setSecondarySkill(''), delta: { notStarted: -1, noAssessment: +1 } },
  { seed: { secondarySkill: 'Java', secondaryProficiency: 'N/A' }, edit: setSecondary('P1'), delta: { notStarted: -1, completed: +1, belowP2: +1 } },
  { seed: { secondarySkill: 'Java', secondaryProficiency: 'P1' }, edit: setSecondary('P3'), delta: { belowP2: -1, p2AndAbove: +1 } },
];

// ---------- Tests ----------

test.describe('myCompetency', () => {
  // Every test edits group 5's shared records and reads group-wide totals,
  // so this file runs in one worker, in order.
  test.describe.configure({ mode: 'default' });

  const originals = new Map<string, Fields>();

  test.beforeEach(async ({ request }) => {
    for (const eid of TOUCHED) {
      const record = await getRecord(request, eid);
      originals.set(eid, Object.fromEntries(FIELDS.map((f) => [f, record[f]])) as Fields);
    }
  });

  test.afterEach(async ({ request }) => {
    // Runs even when the test fails, so db.json is left as it was found
    for (const [eid, fields] of originals) await patchRecord(request, eid, fields);
  });

  test.describe('primary proficiency → status summary', () => {
    for (const { from, to, delta } of PRIMARY_SUMMARY_CASES) {
      test(`${from} → ${to} updates the summary and persists after reload`, async ({ page, request }) => {
        const select = ui(page).primaryProficiency(JOSHUA);

        await seedAndOpen(page, request, JOSHUA, { primaryProficiency: from });
        const after = applyDelta(await readSummary(page, 'primary'), delta);

        await setPrimary(to).run(page, JOSHUA);
        await expect(select).toHaveValue(to);
        await expectSummary(page, 'primary', after);

        // The active view is kept in localStorage, so a reload lands back on myCompetency
        await page.reload();
        await expect(select).toHaveValue(to);
        await expectSummary(page, 'primary', after);
      });
    }
  });

  test.describe('row colour', () => {
    for (const { eid, cl, from, to, colours: [before, after], knownBug } of ROW_COLOUR_CASES) {
      test(`CL ${cl}: ${from} (${before}) → ${to} (${after})`, async ({ page, request }) => {
        test.fail(!!knownBug, knownBug);
        // Guards against roster drift: the expected colours depend on the CL level
        expect(Number((await getRecord(request, eid)).clLevel), `${eid} CL level`).toBe(cl);
        const row = ui(page).row(eid);

        await seedAndOpen(page, request, eid, { primaryProficiency: from });
        await expect(row).toHaveCSS('background-color', ROW_COLOUR[before]);

        await setPrimary(to).run(page, eid);
        await expect(row).toHaveCSS('background-color', ROW_COLOUR[after]);
      });
    }

    test('CL 11: P2 stays green after editing another field', async ({ page, request }) => {
      test.fail(true, BUG_L19);
      expect(Number((await getRecord(request, KRIZEL)).clLevel), `${KRIZEL} CL level`).toBe(11);
      const row = ui(page).row(KRIZEL);

      await seedAndOpen(page, request, KRIZEL, { primaryProficiency: 'P2', secondarySkill: 'Java' });
      await expect(row).toHaveCSS('background-color', ROW_COLOUR.green);

      await setSecondary('P1').run(page, KRIZEL);
      await expect(row).toHaveCSS('background-color', ROW_COLOUR.green);
    });
  });

  test.describe('meets minimum requirement counters', () => {
    for (const { eid, seed, edit, delta, knownBug } of PRIMARY_REQ_CASES) {
      test(`primary: ${eid} ${seed.primaryProficiency} → ${edit.label} changes the count by ${delta}`, async ({ page, request }) => {
        test.fail(!!knownBug, knownBug);
        const { primaryMeetsReq } = ui(page);

        await seedAndOpen(page, request, eid, seed);
        const { met, total } = await readCounter(primaryMeetsReq);

        await edit.run(page, eid);
        await expect(primaryMeetsReq).toHaveText(`${met + delta} / ${total}`);
      });
    }

    for (const { eid, seed, edit, delta } of SECONDARY_REQ_CASES) {
      test(`secondary: ${eid} "${seed.secondarySkill}" ${seed.secondaryProficiency} → ${edit.label} changes the count by ${delta}`, async ({ page, request }) => {
        const { secondaryMeetsReq, primaryMeetsReq } = ui(page);

        await seedAndOpen(page, request, eid, seed);
        const secondary = await readCounter(secondaryMeetsReq);
        const primary = await readCounter(primaryMeetsReq);

        await edit.run(page, eid);
        await expect(secondaryMeetsReq).toHaveText(`${secondary.met + delta} / ${secondary.total}`);
        await expect(primaryMeetsReq).toHaveText(`${primary.met} / ${primary.total}`);
      });
    }
  });

  test.describe('secondary skill → status summary', () => {
    for (const { seed, edit, delta } of SECONDARY_SUMMARY_CASES) {
      test(`"${seed.secondarySkill}" ${seed.secondaryProficiency} → ${edit.label} updates the summary`, async ({ page, request }) => {
        await seedAndOpen(page, request, JOSHUA, seed);
        const primary = await readSummary(page, 'primary');
        const after = applyDelta(await readSummary(page, 'secondary'), delta);

        await edit.run(page, JOSHUA);
        await expectSummary(page, 'secondary', after);
        // The primary half is unaffected
        await expectSummary(page, 'primary', primary);
      });
    }
  });
});
