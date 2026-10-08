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

test.describe('Group Trainings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Group Trainings' }).click();
    // Sidebar-scoped: the view adds its own Resource combobox once the table renders.
    // Group 5 is the only group with training tracks.
    await page.getByRole('complementary').getByRole('combobox').selectOption('5');
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
    /** Pick a resource and wait for its progress to load (checkboxes stay disabled until then). */
    const selectResource = async (page: Page, eid: string) => {
      const { resource, course } = ui(page);
      await resource.selectOption(eid);
      await expect(course('Angular 16: Getting Started')).toBeEnabled();
    };

    test('resource picker, track tabs and checkboxes are locked while a save is in progress', async ({ page }) => {
      const { resource, saving, course } = ui(page);
      const gettingStarted = course('Angular 16: Getting Started');
      const components = course('Angular 16: Introduction to Components');
      const otherTab = page.getByRole('tab', { selected: false }).first();

      await selectResource(page, ADRIAN);
      await gettingStarted.click();

      await expect(gettingStarted).toBeChecked(); // optimistic
      await expect(saving).toBeVisible();
      await expect(resource).toBeDisabled();
      await expect(components).toBeDisabled();
      await expect(otherTab).toBeDisabled();

      await expect(saving).toHaveCount(0);
      await expect(resource).toBeEnabled();
      await expect(components).toBeEnabled();
      await expect(otherTab).toBeEnabled();
      await expect(gettingStarted).toBeChecked();
    });

    test('checkbox state is kept per resource', async ({ page }) => {
      const { saving, course } = ui(page);
      const gettingStarted = course('Angular 16: Getting Started');

      await selectResource(page, ADRIAN);
      await expect(gettingStarted).not.toBeChecked();
      await gettingStarted.click();
      await expect(saving).toHaveCount(0);

      // Another resource is unaffected
      await selectResource(page, ALDHEN);
      await expect(gettingStarted).not.toBeChecked();

      // The original resource kept its tick
      await selectResource(page, ADRIAN);
      await expect(gettingStarted).toBeChecked();
    });
  });
});
