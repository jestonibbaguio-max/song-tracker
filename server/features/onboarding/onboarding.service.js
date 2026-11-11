// Onboarding resources and skill options, through the onboarding store
// (list/findById/findByEid/append/update/remove; each call queries the table
// again). The try/catch boundaries are exactly as before. Bugs H4, L5, L10 and M10 in
// docs/found-bugs.md are kept.
const repository = require('./onboarding.repository');
const { normalizeEid } = require('../../utils/eid');
const {
  normalizeDateToUs,
  normalizeYesNo,
  normalizeYears,
  normalizeSkillTags
} = require('../../utils/dates');
const { formatOnboardingResource, parseSkillTags } = require('./onboarding.format');

function normalizeOnboardingPayload(body) {
  const projectDeployed = normalizeYesNo(body?.projectDeployed || body?.project_deployed || 'No');
  const projectName = projectDeployed === 'No' ? 'Song Bench' : String(body?.projectName || body?.project_name || '').trim();
  const pocRaw = String(body?.poc || '').trim();
  const poc = projectName === 'Song Bench' && !pocRaw ? 'hannahdel.l.orellosa' : pocRaw;

  return {
    name: String(body?.name || '').trim(),
    eid: normalizeEid(body?.eid),
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

/**
 * Every skill on the roster, sorted. Records are read the way the resources
 * list reads them (camelCase first, then snake_case), so skills on camelCase
 * records count too (M5).
 */
function getSkillOptions() {
  const records = repository.list().map(formatOnboardingResource);
  const skills = new Set();

  records.forEach((record) => {
    if (record.primarySkill) {
      skills.add(record.primarySkill);
    }
    if (record.secondarySkill) {
      skills.add(record.secondarySkill);
    }
    record.anotherSkills.forEach((skill) => {
      if (skill) {
        skills.add(skill);
      }
    });
  });

  return [...skills].sort((a, b) => a.localeCompare(b));
}

// ── Request-level operations ─────────────────────────────────────────────────
// body is req.body exactly as Express parsed it (possibly undefined).
// Results: { invalid } → 400, { notFound } → 404, { conflict } → 409,
// { failed } → 500, otherwise { resource, created } → 201 or 200.

/** Every resource, newest created_at first, then highest id, formatted for the client. One roster read. */
function listResources() {
  return repository.list()
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return (b.id || 0) - (a.id || 0);
    })
    .map(formatOnboardingResource);
}

/**
 * Creates a resource, or upserts the one with the same eid. Validation runs
 * first, with no roster read. The try/catch covers exactly what it did before:
 * the lookup by eid, the mapping, the update or append and the formatting, so
 * any failure there is the JSON 500.
 */
function createResource(body) {
  const payload = normalizeOnboardingPayload(body);
  const validationError = validateOnboardingPayload(payload);

  if (validationError) {
    return { invalid: validationError };
  }

  try {
    const existing = repository.findByEid(payload.eid);
    const storagePayload = mapPayloadToStorage(payload);

    if (existing) {
      const resource = repository.update(existing.id, storagePayload);
      return { resource: formatOnboardingResource(resource), created: false };
    }

    const resource = repository.append(storagePayload);
    return { resource: formatOnboardingResource(resource), created: true };
  } catch (error) {
    return { failed: 'failed to save onboarding resource' };
  }
}

/**
 * Full replace of a resource (bug H4). The lookup by id is OUTSIDE the
 * try/catch, as before, so a failing read is an uncaught 500 here; a
 * non-numeric or fractional id matches nothing. Dates are optional. A changed
 * eid appends a new record (201) and leaves the old one; an eid another record
 * has is a 409.
 */
function updateResource(id, body) {
  const existing = repository.findById(id);

  if (!existing) {
    return { notFound: true };
  }

  const payload = normalizeOnboardingPayload(body);
  const validationError = validateOnboardingPayload(payload, false);

  if (validationError) {
    return { invalid: validationError };
  }

  try {
    const holder = repository.findByEid(payload.eid);
    if (holder && holder.id !== id) {
      return { conflict: 'eid already exists' };
    }
    const storagePayload = mapPayloadToStorage(payload);

    if (payload.eid !== existing.eid) {
      const resource = repository.append(storagePayload);
      return { resource: formatOnboardingResource(resource), created: true };
    }

    const resource = repository.update(id, storagePayload);
    return { resource: formatOnboardingResource(resource), created: false };
  } catch (error) {
    return { failed: 'failed to update onboarding resource' };
  }
}

/** false when the id is unknown (nothing written). No try/catch, as before. Related rows stay (bug M13). */
function deleteResource(id) {
  return repository.remove(id);
}

module.exports = {
  normalizeOnboardingPayload,
  normalizeGroupNumber,
  mapPayloadToStorage,
  validateOnboardingPayload,
  formatOnboardingResource,
  parseSkillTags,
  getSkillOptions,
  listResources,
  createResource,
  updateResource,
  deleteResource
};
