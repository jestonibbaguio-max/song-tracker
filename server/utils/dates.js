// Onboarding input normalisers: dates to MM/DD/YYYY, yes/no, years, skill tags.

function normalizeDateToUs(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slashMatch) {
    return raw;
  }

  let first = Number(slashMatch[1]);
  let second = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);

  if (first > 12 && second <= 12) {
    [first, second] = [second, first];
  }

  return `${String(first).padStart(2, '0')}/${String(second).padStart(2, '0')}/${year}`;
}

function normalizeYesNo(value) {
  return String(value || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
}

function normalizeYears(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : raw;
}

function normalizeSkillTags(value) {
  const tags = Array.isArray(value) ? value : String(value || '').split(',');
  const unique = new Set();

  for (const tag of tags) {
    const normalized = String(tag || '').trim();

    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

module.exports = {
  normalizeDateToUs,
  normalizeYesNo,
  normalizeYears,
  normalizeSkillTags
};
