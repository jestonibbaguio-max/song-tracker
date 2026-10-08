import { test, expect, Page } from '@playwright/test';

const TABS = [
  'AM Call w/ group',
  'AM Call w/ Execs',
  'EOD Call',
  'How to prepare report',
  'New sprint prep',
];

async function appendAndSave(page: Page, text: string) {
  await page.getByRole('button', { name: 'Edit' }).click();

  // Append a testing string (instead of retyping the whole document)
  const editor = page.locator('.ql-editor');
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await editor.pressSequentially(text);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Edit only reappears once the save has resolved
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
}

test.describe('PoC How-to Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'POC TOOLS' })
      .getByRole('button', { name: 'POC how-to' })
      .click();
  });

  for (const [i, tab] of TABS.entries()) {
    const other = TABS[(i + 1) % TABS.length];

    test(`POC how-to - ${tab}: appended text persists after switching tabs`, async ({ page }) => {
      // Unique per run, so a leftover from a previous run can't cause a false pass
      const marker = `test-${Date.now()}`;

      await page.getByRole('tab', { name: tab }).click();
      await appendAndSave(page, marker);

      // Change tab and return, then verify persistence
      await page.getByRole('tab', { name: other }).click();
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByText(marker)).toBeVisible();

      // // Page reload, verify persistence; temporarily disabled until actual API call has been implemented
      // await page.reload();
      // await expect(page.getByText(marker)).toBeVisible();
    });
  }
});
