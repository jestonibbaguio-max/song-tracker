const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'data', 'custom.csv');
const jsonPath = path.join(__dirname, 'data', 'custom-onboarding.json');

function ensureDataDirectory() {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
}

function parseCsvRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvRow(lines.shift() || '');

  return lines.map((line) => {
    const values = parseCsvRow(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ? values[index].trim() : '';
    });

    return row;
  });
}

function normalizeCsvRecord(row) {
  const rawEid = String(row.EID || '').trim();
  let name = rawEid;
  let eid = rawEid.toLowerCase();

  if (/[\s,]/.test(rawEid)) {
    name = rawEid.replace(/^"|"$/g, '').trim();
    eid = name
      .toLowerCase()
      .replace(/,/g, '')
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '');
  }

  const groupNumber = Number(row.GROUP);

  return {
    name: name || eid || 'Unknown',
    eid: eid || name || 'unknown',
    hire_date: '',
    roll_in_date: '',
    project_deployed: 'No',
    deployment_date: '',
    project_name: 'Song Bench',
    poc: '',
    dn: 'No',
    roll_off_date: '',
    from_project: '',
    group_number: Number.isInteger(groupNumber) ? groupNumber : null,
    primary_skill: String(row['Primary Skill'] || '').trim(),
    primary_years: '',
    secondary_skill: '',
    secondary_years: '',
    another_skills: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function loadCsvRecords() {
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csvText);
  return rows.map(normalizeCsvRecord);
}

function ensureOnboardingJson() {
  ensureDataDirectory();

  if (!fs.existsSync(jsonPath)) {
    const records = loadCsvRecords();
    saveOnboardingRecords(records);
  }
}

function loadOnboardingRecords() {
  ensureOnboardingJson();

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const records = JSON.parse(raw);

  if (ensureRecordIds(records)) {
    saveOnboardingRecords(records);
  }

  return records;
}

function saveOnboardingRecords(records) {
  ensureDataDirectory();
  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
}

function ensureRecordIds(records) {
  let nextId = records.reduce((next, record) => Math.max(next, Number(record.id) || 0), 0) + 1;
  let updated = false;

  for (const record of records) {
    if (record.id === undefined || record.id === null || record.id === '') {
      record.id = nextId++;
      updated = true;
    } else {
      record.id = Number(record.id);
      if (!Number.isInteger(record.id) || record.id <= 0) {
        record.id = nextId++;
        updated = true;
      }
    }
  }

  return updated;
}

function getNextId(records) {
  return records.reduce((next, record) => Math.max(next, Number(record.id) || 0), 0) + 1;
}

function appendOnboardingRecord(record) {
  const records = loadOnboardingRecords();
  record.id = getNextId(records);
  record.created_at = new Date().toISOString();
  record.updated_at = record.created_at;
  records.unshift(record);
  saveOnboardingRecords(records);
  return record;
}

function updateOnboardingRecord(id, payload) {
  const records = loadOnboardingRecords();
  const existing = records.find((item) => Number(item.id) === Number(id));

  if (!existing) {
    return null;
  }

  Object.assign(existing, payload, { updated_at: new Date().toISOString() });
  saveOnboardingRecords(records);
  return existing;
}

module.exports = {
  loadOnboardingRecords,
  saveOnboardingRecords,
  appendOnboardingRecord,
  updateOnboardingRecord
};
