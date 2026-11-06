const onboardingStore = require('./persistence/roster-file.repository');

function getSkillOptions() {
  const records = onboardingStore.loadOnboardingRecords();
  const skills = new Set();

  records.forEach((record) => {
    if (record.primary_skill) {
      skills.add(record.primary_skill);
    }
    if (record.secondary_skill) {
      skills.add(record.secondary_skill);
    }
    if (Array.isArray(record.another_skills)) {
      record.another_skills.forEach((skill) => {
        if (skill) {
          skills.add(skill);
        }
      });
    }
  });

  return [...skills].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  getSkillOptions
};
