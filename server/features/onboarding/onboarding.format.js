// How a stored roster record reads as an onboarding resource: one key per
// field, camelCase first with the snake_case fallback (custom-onboarding.json
// stores some records in one style, some in the other, and some in both: bug L9).
// Moved out of onboarding.service.js unchanged, so other code can read the
// roster the same way.

function formatOnboardingResource(resource) {
  return {
    id: resource.id,
    name: resource.name || '',
    eid: resource.eid || '',
    hireDate: resource.hireDate || resource.hire_date || '',
    rollInDate: resource.rollInDate || resource.roll_in_date || '',
    projectDeployed: resource.projectDeployed || resource.project_deployed || 'No',
    deploymentDate: resource.deploymentDate || resource.deployment_date || '',
    projectName: resource.projectName || resource.project_name || '',
    poc: resource.poc || '',
    dn: resource.dn || 'No',
    rollOffDate: resource.rollOffDate || resource.roll_off_date || '',
    fromProject: resource.fromProject || resource.from_project || '',
    clLevel: resource.clLevel || resource.cl_level || '',
    groupNumber: resource.groupNumber != null ? Number(resource.groupNumber) : (resource.group_number != null ? Number(resource.group_number) : null),
    primarySkill: resource.primarySkill || resource.primary_skill || '',
    primaryYears: resource.primaryYears || resource.primary_years || '',
    secondarySkill: resource.secondarySkill || resource.secondary_skill || '',
    secondaryYears: resource.secondaryYears || resource.secondary_years || '',
    anotherSkills: parseSkillTags(resource.anotherSkills || resource.another_skills),
    officeLocation: resource.officeLocation || resource.office_location || '',
    createdAt: resource.createdAt || resource.created_at || '',
    updatedAt: resource.updatedAt || resource.updated_at || ''
  };
}

function parseSkillTags(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = { formatOnboardingResource, parseSkillTags };
