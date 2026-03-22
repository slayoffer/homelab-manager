import { execSync } from 'child_process';
import { Buffer } from 'node:buffer';
import config from '../../config.js';
import { audit } from '../../db.js';

const ALLOWED_DATABASES = Object.values(config.wow.databases);
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function validateDatabase(db) {
  if (!ALLOWED_DATABASES.includes(db)) {
    throw new Error(`Database "${db}" is not allowed`);
  }
}

function validateIdentifier(name, label = 'identifier') {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${label}: "${name}"`);
  }
}

function execQuery(database, sql) {
  const { dbContainer, dbUser, dbPassword } = config.wow;
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(
    `echo "${b64}" | base64 -d | docker exec -i ${dbContainer} mysql -u"${dbUser}" -p"${dbPassword}" "${database}" -N -B 2>/dev/null`,
    { encoding: 'utf-8', timeout: 30000, shell: '/bin/bash' }
  ).trim();
}

function execQueryWithHeaders(database, sql) {
  const { dbContainer, dbUser, dbPassword } = config.wow;
  const b64 = Buffer.from(sql).toString('base64');
  return execSync(
    `echo "${b64}" | base64 -d | docker exec -i ${dbContainer} mysql -u"${dbUser}" -p"${dbPassword}" "${database}" --column-names -B 2>/dev/null`,
    { encoding: 'utf-8', timeout: 30000, shell: '/bin/bash' }
  ).trim();
}

function parseTsv(output) {
  if (!output) return [];
  return output.split('\n').map(line => line.split('\t'));
}

function parseTsvWithHeaders(output) {
  if (!output) return { columns: [], rows: [] };
  const lines = output.split('\n');
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split('\t');
  const rows = lines.slice(1).map(line => line.split('\t'));
  return { columns, rows };
}

function escapeValue(value) {
  if (value === null || value === 'NULL') return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '\\0')}'`;
}

export function listDatabases() {
  return ALLOWED_DATABASES.map(db => {
    try {
      const output = execQuery(db, 'SHOW TABLES');
      const tables = parseTsv(output).filter(r => r[0]);
      return { name: db, tableCount: tables.length };
    } catch {
      return { name: db, tableCount: 0, error: 'Cannot connect' };
    }
  });
}

export function listTables(database) {
  validateDatabase(database);
  const sql = `SELECT TABLE_NAME, TABLE_ROWS, ENGINE, DATA_LENGTH, INDEX_LENGTH, TABLE_COLLATION
FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${database}' ORDER BY TABLE_NAME`;
  const output = execQuery(database, sql);
  return parseTsv(output).map(row => ({
    name: row[0],
    rows: parseInt(row[1]) || 0,
    engine: row[2],
    dataSize: parseInt(row[3]) || 0,
    indexSize: parseInt(row[4]) || 0,
    collation: row[5],
  }));
}

export function describeTable(database, table) {
  validateDatabase(database);
  validateIdentifier(table, 'table name');

  // Verify table exists
  const exists = execQuery(database, `SHOW TABLES LIKE '${table}'`);
  if (!exists) throw new Error(`Table "${table}" not found`);

  const colOutput = execQueryWithHeaders(database, `SHOW FULL COLUMNS FROM \`${table}\``);
  const { rows: colRows } = parseTsvWithHeaders(colOutput);

  const columns = colRows.map(row => ({
    field: row[0],
    type: row[1],
    collation: row[2],
    null: row[3],
    key: row[4],
    default: row[5],
    extra: row[6],
    comment: row[8],
  }));

  const idxOutput = execQueryWithHeaders(database, `SHOW INDEX FROM \`${table}\``);
  const { rows: idxRows } = parseTsvWithHeaders(idxOutput);

  const indexMap = {};
  for (const row of idxRows) {
    const name = row[2];
    if (!indexMap[name]) {
      indexMap[name] = { name, unique: row[1] === '0', columns: [], type: row[10] };
    }
    indexMap[name].columns.push({ column: row[4], seq: parseInt(row[3]), cardinality: parseInt(row[6]) || 0 });
  }
  const indexes = Object.values(indexMap);

  let createStatement = '';
  try {
    const createOutput = execQuery(database, `SHOW CREATE TABLE \`${table}\``);
    createStatement = createOutput.split('\t').slice(1).join('\t');
  } catch { /* ignore */ }

  return { columns, indexes, createStatement };
}

export function queryTable(database, table, options = {}) {
  validateDatabase(database);
  validateIdentifier(table, 'table name');

  const page = Math.max(1, parseInt(options.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(options.pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  // Get columns for validation
  const colOutput = execQuery(database, `SHOW COLUMNS FROM \`${table}\``);
  const validColumns = parseTsv(colOutput).map(r => r[0]);

  // Build WHERE clause
  let whereClause = '';
  if (options.search && options.searchColumn) {
    if (!validColumns.includes(options.searchColumn)) {
      throw new Error(`Invalid column: "${options.searchColumn}"`);
    }
    const escaped = escapeValue(`%${options.search}%`);
    whereClause = `WHERE \`${options.searchColumn}\` LIKE ${escaped}`;
  } else if (options.search) {
    // Search across all columns
    const conditions = validColumns.slice(0, 10).map(col =>
      `CAST(\`${col}\` AS CHAR) LIKE ${escapeValue(`%${options.search}%`)}`
    );
    if (conditions.length) whereClause = `WHERE ${conditions.join(' OR ')}`;
  }

  // Build ORDER BY
  let orderClause = '';
  if (options.orderBy && validColumns.includes(options.orderBy)) {
    const dir = options.orderDir === 'desc' ? 'DESC' : 'ASC';
    orderClause = `ORDER BY \`${options.orderBy}\` ${dir}`;
  }

  // Get total count
  let total;
  if (!whereClause && !options.search) {
    // Use approximate count for unfiltered queries
    const approx = execQuery(database,
      `SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}' AND TABLE_NAME='${table}'`
    );
    total = parseInt(approx) || 0;
  } else {
    const countResult = execQuery(database, `SELECT COUNT(*) FROM \`${table}\` ${whereClause}`);
    total = parseInt(countResult) || 0;
  }

  // Get column metadata
  const colMeta = parseTsv(execQuery(database, `SHOW COLUMNS FROM \`${table}\``)).map(r => ({
    name: r[0],
    type: r[1],
    key: r[3],
    nullable: r[2] === 'YES',
    default: r[4],
  }));

  // Get rows
  const dataSql = `SELECT * FROM \`${table}\` ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`;
  const dataOutput = execQueryWithHeaders(database, dataSql);
  const { rows } = parseTsvWithHeaders(dataOutput);

  return {
    columns: colMeta,
    rows,
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize) || 1,
  };
}

export function updateRow(database, table, primaryKey, updates) {
  validateDatabase(database);
  validateIdentifier(table, 'table name');

  // Validate columns exist
  const colOutput = execQuery(database, `SHOW COLUMNS FROM \`${table}\``);
  const validColumns = parseTsv(colOutput).map(r => r[0]);

  const setClauses = [];
  for (const [col, val] of Object.entries(updates)) {
    if (!validColumns.includes(col)) throw new Error(`Invalid column: "${col}"`);
    validateIdentifier(col, 'column name');
    setClauses.push(`\`${col}\` = ${escapeValue(val)}`);
  }

  const whereClauses = [];
  for (const [col, val] of Object.entries(primaryKey)) {
    if (!validColumns.includes(col)) throw new Error(`Invalid primary key column: "${col}"`);
    validateIdentifier(col, 'column name');
    whereClauses.push(`\`${col}\` = ${escapeValue(val)}`);
  }

  if (!setClauses.length || !whereClauses.length) {
    throw new Error('Updates and primary key are required');
  }

  const sql = `UPDATE \`${table}\` SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} LIMIT 1`;
  try {
    execQuery(database, sql);
    // Get affected rows
    const affected = execQuery(database, 'SELECT ROW_COUNT()');
    audit('db.update', `${database}.${table}`, { primaryKey, columns: Object.keys(updates) });
    return { success: true, affectedRows: parseInt(affected) || 0 };
  } catch (err) {
    audit('db.update', `${database}.${table}`, { primaryKey, error: err.message }, 'failed');
    return { success: false, error: err.message };
  }
}
