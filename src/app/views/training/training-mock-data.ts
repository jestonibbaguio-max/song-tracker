export interface TrainingCourse {
  id: string;
  title: string;
  length: string;
  link: string;
}

export interface TrainingTrack {
  id: string;
  label: string;
  icon: string;
  courses: TrainingCourse[];
}

/**
 * Temporary stand-in for a real backend response. Keyed by attendance
 * group value (see SharedDataService.groupOptions) — only Group 5
 * ("AEM/Angular") has a stack assigned for now.
 */
export const TRAINING_TRACKS_BY_GROUP: Record<string, TrainingTrack[]> = {
  '5': [
    {
      id: 'angular',
      label: 'Angular',
      icon: 'bi-code-slash',
      courses: [
        { id: 'ang-1', title: 'Angular 16: Getting Started with Angular', length: '40m 44s', link: 'https://accenture.percipio.com/courses/263a9bdd-1925-43b6-af81-d7492b0a4333' },
        { id: 'ang-2', title: 'Angular 16: Introduction to Components', length: '49m 57s', link: 'https://accenture.percipio.com/courses/c30b884a-d4b1-4ff0-a335-e9891722b0ae' },
        { id: 'ang-3', title: 'Angular 16: Working with Angular Modules', length: '49m 9s', link: 'https://accenture.percipio.com/courses/10ad0943-5f98-4258-8a48-4e886a055d7e' },
        { id: 'ang-4', title: 'Angular 16: Working with Components', length: '43m 10s', link: 'https://accenture.percipio.com/courses/04aaedd0-d1f3-4db9-b852-adb01c685876' },
        { id: 'ang-5', title: 'Angular 16: Directives and Pipes', length: '56m 42s', link: 'https://accenture.percipio.com/courses/a6844c27-87f7-4dd9-baf4-4e68a86cab46' },
        { id: 'ang-6', title: 'Angular 16: Reactive Programming With RxJS and Observables', length: '38m 37s', link: 'https://accenture.percipio.com/courses/332682fa-aac9-458d-99ee-7994ff79fd33' },
        { id: 'ang-7', title: 'Angular 16: Working With Forms', length: '48m 36s', link: 'https://accenture.percipio.com/courses/d2aacf6d-5840-40a6-9286-98a409bd4ff6' },
        { id: 'ang-8', title: 'Angular 16: Navigation and Routing in Angular', length: '45m 20s', link: 'https://accenture.percipio.com/courses/883152da-da4a-4782-8c23-40893f4abe0f' },
        { id: 'ang-9', title: 'Angular 16: Services and Dependency Injection', length: '32m 55s', link: 'https://accenture.percipio.com/courses/f00d6862-8d05-4cf4-941b-40f17b04a148' },
        { id: 'ang-10', title: 'Angular 16: Security and Deployment in Angular', length: '41m 58s', link: 'https://accenture.percipio.com/courses/b2106560-5b03-436b-a806-346a0bbd85cb' },
        { id: 'ang-11', title: 'Angular 17 and 18 New Features', length: '41m 16s', link: 'https://accenture.percipio.com/courses/9d2b542c-d61e-4ffd-a7e0-99df49567f0e' },
        { id: 'ang-12', title: 'Angular 16: Change Detection and State Management June 2024: Session 1 Replay', length: '2h 31m 31s', link: 'https://accenture.percipio.com/courses/b65336be-1c79-487f-a49e-ab22792605fa' },
        { id: 'ang-13', title: 'Angular 16: Change Detection and State Management June 2024: Session 2 Replay', length: '2h 35m 33s', link: 'https://accenture.percipio.com/courses/007a4ea5-8166-482e-9912-5612fbf3f0e1' },
        { id: 'ang-14', title: 'Angular 16: State Management and Change Detection January 2024: Session 1 Replay', length: '2h 40m', link: 'https://accenture.percipio.com/courses/5501f037-e96b-4d87-bf10-ac09c21ac2c3' },
        { id: 'ang-15', title: 'Angular 16: State Management and Change Detection January 2024: Session 2 Replay', length: '2h 43m 9s', link: 'https://accenture.percipio.com/courses/8982d17c-1246-4e09-90f9-8cc2d016817b' },
        { id: 'ang-16', title: 'Angular 16: Routing with Services November 2023 : Session 1 Replay', length: '2h 30m 48s', link: 'https://accenture.percipio.com/courses/d323593e-3e4b-4728-8bf9-ebdaf97d608f' },
        { id: 'ang-17', title: 'Angular 16: Routing with Services November 2023 : Session 2 Replay', length: '2h 37m 17s', link: 'https://accenture.percipio.com/courses/f199f00a-e7e8-4dcf-818f-81e9d0d3c0f1' },
        { id: 'ang-18', title: 'Angular 16: Template-driven and Reactive Forms October 2023 : Session 1 Replay', length: '2h 30m 31s', link: 'https://accenture.percipio.com/courses/c2a13545-707d-4bc7-b45e-e57c388f6dff' },
        { id: 'ang-19', title: 'Angular 16: Template-driven and Reactive Forms October 2023 : Session 2 Replay', length: '2h 37m 2s', link: 'https://accenture.percipio.com/courses/3673cb45-a088-4a1d-ad34-9b636edafb5f' },
        { id: 'ang-20', title: 'Angular 16: Templates and Components September 2023 : Session 1 Replay', length: '2h 33m 3s', link: 'https://accenture.percipio.com/courses/80bd6a68-949f-4179-bf54-9d7a3134d382' },
        { id: 'ang-21', title: 'Angular 16: Templates and Components September 2023 : Session 2 Replay', length: '2h 33m 23s', link: 'https://accenture.percipio.com/courses/4ed7bca6-e8c8-4b26-a218-9d36b89831ce' },
        { id: 'ang-22', title: 'Introduction to Angular Bootcamp September 2025: Session 2 Replay', length: '1h 52m 54s', link: 'https://accenture.percipio.com/courses/a9626c32-62c4-4b71-a383-e016f72eefe9' },
        { id: 'ang-23', title: 'Introduction to Angular Bootcamp September 2025: Session 1 Replay', length: '1h 56m 27s', link: 'https://accenture.percipio.com/courses/931d5cfd-94ca-47e2-9500-9bc3daef4958' },
        { id: 'ang-24', title: 'Angular Bootcamp January 2025: Session 1 Replay', length: '2h 31m 28s', link: 'https://accenture.percipio.com/courses/d686de95-1552-4c8c-b81e-05df6a9e9666' },
        { id: 'ang-25', title: 'Angular Bootcamp January 2025: Session 2 Replay', length: '2h 32m 43s', link: 'https://accenture.percipio.com/courses/1bc8c739-93d2-407a-84e3-f438f0440095' },
        { id: 'ang-26', title: 'Angular Bootcamp: Routing & Services with Copilot May 2024 Session 1 Replay', length: '2h 36m 30s', link: 'https://accenture.percipio.com/courses/39c52e15-6676-4886-81ae-07b63ed03bae' },
        { id: 'ang-27', title: 'Angular Bootcamp: Routing & Services with Copilot May 2024 Session 2 Replay', length: '2h 31m 56s', link: 'https://accenture.percipio.com/courses/aabba076-585b-4860-8ecd-432d5dcb3b8b' },
        { id: 'ang-28', title: 'Angular: Template-driven and Reactive Forms April 2024 : Session 1 Replay', length: '2h 32m 7s', link: 'https://accenture.percipio.com/courses/9e16a2e3-0e88-44cd-bf9a-f4abca8446c0' },
        { id: 'ang-29', title: 'Angular: Template-driven and Reactive Forms April 2024 : Session 2 Replay', length: '2h 30m 56s', link: 'https://accenture.percipio.com/courses/462fbca4-ddd3-4d67-9d28-1a1745f2f1f2' },
        { id: 'ang-30', title: 'Angular: Templates and Components March 2024 : Session 1 Replay', length: '2h 33m 9s', link: 'https://accenture.percipio.com/courses/03c61651-add5-4c42-ae21-d2c181dd3b69' },
        { id: 'ang-31', title: 'Angular: Templates and Components March 2024: Session 2 Replay', length: '2h 34m 23s', link: 'https://accenture.percipio.com/courses/da7270a9-fcf6-4719-a571-6fcf85a4f767' },
        { id: 'ang-32', title: 'Introduction to Angular 17 February 2024: Session 1 Replay', length: '2h 31m 57s', link: 'https://accenture.percipio.com/courses/b8130e6f-bb79-45c1-91f5-19b130b0ffa8' },
        { id: 'ang-33', title: 'Introduction to Angular 17 February 2024: Session 2 Replay', length: '2h 31m 58s', link: 'https://accenture.percipio.com/courses/0a46fb16-5dc9-4955-bbf8-75f070500f9c' },
      ],
    },
    {
      id: 'aem',
      label: 'AEM',
      icon: 'bi-layers',
      courses: [
        { id: 'aem-1', title: 'AEM Edge Delivery Services - Developer Professional', length: '13h 30m', link: 'https://certification.adobe.com/courses/1308' },
        { id: 'aem-2', title: 'Experience Modernization Agent - Getting Started', length: '', link: 'https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/agents/brand-experience/modernization/overview' },
        { id: 'aem-3', title: 'Experience Modernization Agent - Prompting Guide', length: '', link: 'https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/agents/brand-experience/modernization/prompting-guide' },
        { id: 'aem-4', title: 'Adobe Target Foundations', length: '1h 30m', link: 'https://certification.adobe.com/courses/1060' },
      ],
    },
  ],
};
