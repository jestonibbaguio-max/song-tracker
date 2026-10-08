import { test, expect, Page } from '@playwright/test';

const ADRIAN = 'adrian.m.bartolome';
const ALDHEN = 'aldhen.a.dignaran';

function ui(page: Page) {
  return {
    resource: page.getByLabel('Resource'),
    saving: page.getByRole('status').filter({ hasText: 'Saving' }),
    course: (title: string) => page.getByRole('checkbox', { name: new RegExp(title) }),
  };
}

test.describe('Bench Trainings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bench Trainings' }).click();
  });

  test('add and remove a course', async ({ page }) => {
    const title = `test-${Date.now()}`;

    await page.getByRole('textbox', { name: 'Course title' }).fill(title);
    await page.getByRole('textbox', { name: 'e.g. 2h 30m' }).fill('1h');
    await page.getByRole('textbox', { name: 'https://' }).fill('https://www.google.com');
    await page.getByTitle('Add course').click();

    // Assert the link instead of opening it, so the public internet stays off the critical path
    const link = page.getByRole('link', { name: title });
    await expect(link).toHaveAttribute('href', 'https://www.google.com');
    await expect(link).toHaveAttribute('target', '_blank');

    // Scope the delete to this course's own row rather than an nth() index
    await page.getByRole('row').filter({ has: link }).getByTitle('Remove course').click();
    await expect(link).toHaveCount(0);
  });

  test.describe('progress per resource', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('complementary').getByRole('combobox').selectOption('5');
    });

    /** Pick a resource and wait for its progress to load (checkboxes stay disabled until then). */
    const selectResource = async (page: Page, eid: string) => {
      const { resource, course } = ui(page);
      await resource.selectOption(eid);
      await expect(course('TQ Training on Udacity')).toBeEnabled();
    };

    test('resource picker and checkboxes are locked while a save is in progress', async ({ page }) => {
      const { resource, saving, course } = ui(page);
      const tq = course('TQ Training on Udacity');
      const ethics = course('Ethics and Compliance');

      await selectResource(page, ADRIAN);
      await tq.click();

      await expect(tq).toBeChecked(); // optimistic
      await expect(saving).toBeVisible();
      await expect(resource).toBeDisabled();
      await expect(ethics).toBeDisabled();

      await expect(saving).toHaveCount(0);
      await expect(resource).toBeEnabled();
      await expect(ethics).toBeEnabled();
      await expect(tq).toBeChecked();
    });

    test('checkbox state is kept per resource', async ({ page }) => {
      const { saving, course } = ui(page);
      const tq = course('TQ Training on Udacity');

      await selectResource(page, ADRIAN);
      await expect(tq).not.toBeChecked();
      await tq.click();
      await expect(saving).toHaveCount(0);

      // Another resource is unaffected
      await selectResource(page, ALDHEN);
      await expect(tq).not.toBeChecked();

      // The original resource kept its tick
      await selectResource(page, ADRIAN);
      await expect(tq).toBeChecked();
    });
  });
});
