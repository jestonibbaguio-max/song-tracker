export const MOCK_ASSESSMENT_TABS = {
  SUMMARY: { id: 'summary', title: 'Summary Table', targetId: 'summary-table' },
  FEEDBACK: { id: 'feedback', title: 'Feedback', targetId: 'feedback' },
  HEAD_COUNT: { id: 'headcount', title: 'Head Count', targetId: 'head-count' },
} as const;

export type MockAssessmentTab = typeof MOCK_ASSESSMENT_TABS[keyof typeof MOCK_ASSESSMENT_TABS]['id'];
export const MOCK_ASSESSMENT_PAGE_SIZE = 10;