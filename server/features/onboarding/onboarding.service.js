const onboardingStore = require('../../persistence/roster-file.repository');
const {
  normalizeDateToUs,
  normalizeYesNo,
  normalizeYears,
  normalizeSkillTags
} = require('../../utils/dates');

function normalizeOnboardingPayload(body) {
  const projectDeployed = normalizeYesNo(body?.projectDeployed || body?.project_deployed || 'No');
  const projectName = projectDeployed === 'No' ? 'Song Bench' : String(body?.projectName || body?.project_name || '').trim();
  const pocRaw = String(body?.poc || '').trim();
  const poc = projectName === 'Song Bench' && !pocRaw ? 'hannahdel.l.orellosa' : pocRaw;

  return {
    name: String(body?.name || '').trim(),
    eid: String(body?.eid || '').trim().split('@')[0].toLowerCase(),
    hireDate: normalizeDateToUs(body?.hireDate || body?.hire_date || ''),
    rollInDate: normalizeDateToUs(body?.rollInDate || body?.roll_in_date || ''),
    projectDeployed,
    deploymentDate: normalizeDateToUs(body?.deploymentDate || body?.deployment_date || ''),
    projectName,
    poc,
    dn: normalizeYesNo(body?.dn || 'No'),
    rollOffDate: normalizeDateToUs(body?.rollOffDate || body?.roll_off_date || ''),
    fromProject: String(body?.fromProject || body?.from_project || '').trim(),
    clLevel: String(body?.clLevel || body?.cl_level || '').trim(),
    groupNumber: normalizeGroupNumber(body?.groupNumber || body?.group_number || ''),
    primarySkill: String(body?.primarySkill || body?.primary_skill || '').trim(),
    primaryYears: normalizeYears(body?.primaryYears || body?.primary_years || ''),
    secondarySkill: String(body?.secondarySkill || body?.secondary_skill || '').trim(),
    secondaryYears: normalizeYears(body?.secondaryYears || body?.secondary_years || ''),
    anotherSkills: normalizeSkillTags(body?.anotherSkills || body?.another_skills || []),
    officeLocation: String(body?.officeLocation || body?.office_location || '').trim()
  };
}

function normalizeGroupNumber(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
    return null;
  }

  return parsed;
}

function mapPayloadToStorage(payload) {
  const groupNum = payload.groupNumber !== undefined && payload.groupNumber !== null
    ? Number(payload.groupNumber)
    : (payload.group_number != null ? Number(payload.group_number) : null);
  const skills = Array.isArray(payload.anotherSkills) ? payload.anotherSkills : (payload.another_skills || []);
  return {
    name: payload.name,
    eid: payload.eid,
    hireDate: payload.hireDate || payload.hire_date || '',
    rollInDate: payload.rollInDate || payload.roll_in_date || '',
    projectDeployed: payload.projectDeployed || payload.project_deployed || 'No',
    deploymentDate: payload.deploymentDate || payload.deployment_date || '',
    projectName: payload.projectName || payload.project_name || (payload.project_deployed === 'No' ? 'Song Bench' : ''),
    poc: payload.poc || '',
    dn: payload.dn || 'No',
    rollOffDate: payload.rollOffDate || payload.roll_off_date || '',
    fromProject: payload.fromProject || payload.from_project || '',
    clLevel: payload.clLevel || payload.cl_level || '',
    groupNumber: groupNum,
    primarySkill: payload.primarySkill || payload.primary_skill || '',
    primaryYears: payload.primaryYears || payload.primary_years || '',
    secondarySkill: payload.secondarySkill || payload.secondary_skill || '',
    secondaryYears: payload.secondaryYears || payload.secondary_years || '',
    anotherSkills: skills,
    officeLocation: payload.officeLocation || payload.office_location || ''
  };
}

function validateOnboardingPayload(payload, requireDates = true) {
  if (!payload.name || !payload.eid) {
    return 'name and eid are required';
  }

  if (requireDates && (!payload.hireDate || !payload.rollInDate)) {
    return 'hireDate and rollInDate are required';
  }

  if (!/^[a-z0-9._-]+$/i.test(payload.eid)) {
    return 'eid can only contain letters, numbers, dot, underscore, or dash';
  }

  if (payload.hireDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(payload.hireDate)) {
    return 'hireDate must use MM/DD/YYYY format';
  }

  if (payload.rollInDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(payload.rollInDate)) {
    return 'rollInDate must use MM/DD/YYYY format';
  }

  for (const dateValue of [payload.deploymentDate, payload.rollOffDate]) {
    if (dateValue && !/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      return 'optional dates must use MM/DD/YYYY format';
    }
  }

  if (payload.groupNumber !== null && (payload.groupNumber < 1 || payload.groupNumber > 6)) {
    return 'group must be between 1 and 6';
  }

  return '';
}

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
  normalizeOnboardingPayload,
  normalizeGroupNumber,
  mapPayloadToStorage,
  validateOnboardingPayload,
  formatOnboardingResource,
  parseSkillTags,
  getSkillOptions
};
