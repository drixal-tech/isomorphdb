import { IsomorphProfile } from '../profiler/profile-writer';
import { GeneratedData } from '../generator/index';
import logger from '../utils/logger';

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  warnings: number;
  errors: number;
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  isWarning: boolean;
  message: string;
}

/**
 * Post-generation validator — runs integrity checks on generated data.
 */
export function validateGeneratedData(
  profile: IsomorphProfile,
  generatedTables: GeneratedData[]
): ValidationResult {
  const checks: ValidationCheck[] = [];
  const tableMap = new Map(generatedTables.map(t => [t.tableName, t]));

  // 1. FK Integrity
  checks.push(checkFKIntegrity(profile, tableMap));

  // 2. Unique constraints
  checks.push(checkUniqueConstraints(profile, tableMap));

  // 3. NOT NULL constraints
  checks.push(checkNotNull(profile, tableMap));

  // 4. Null ratio drift
  checks.push(checkNullRatioDrift(profile, tableMap));

  // 5. ENUM validity
  checks.push(checkEnumValidity(profile, tableMap));

  // 6. Row count sanity
  checks.push(checkRowCounts(tableMap));

  const errors = checks.filter(c => !c.passed && !c.isWarning).length;
  const warnings = checks.filter(c => c.isWarning).length;

  // Print validation report
  logger.blank();
  logger.info('Validation report');
  logger.divider();
  for (const check of checks) {
    if (check.isWarning) {
      logger.warn(`${check.name.padEnd(20)} ${check.message}`);
    } else if (check.passed) {
      logger.success(`${check.name.padEnd(20)} ${check.message}`);
    } else {
      logger.error(`${check.name.padEnd(20)} ${check.message}`);
    }
  }
  logger.divider();

  if (errors > 0) {
    logger.error(`Validation failed with ${errors} error(s) and ${warnings} warning(s)`);
  } else if (warnings > 0) {
    logger.success(`Validation passed with ${warnings} warning(s)`);
  } else {
    logger.success('Validation passed — all checks clean');
  }

  return { passed: errors === 0, checks, warnings, errors };
}

function checkFKIntegrity(
  profile: IsomorphProfile,
  tableMap: Map<string, GeneratedData>
): ValidationCheck {
  let totalRelationships = 0;
  let violations = 0;

  for (const fk of profile.foreign_keys) {
    const childData = tableMap.get(fk.child_table);
    const parentData = tableMap.get(fk.parent_table);
    if (!childData || !parentData) continue;

    const childColIdx = childData.columns.indexOf(fk.child_column);
    const parentColIdx = parentData.columns.indexOf(fk.parent_column);
    if (childColIdx === -1 || parentColIdx === -1) continue;

    const parentPKs = new Set(parentData.rows.map(r => String(r[parentColIdx])));

    for (const row of childData.rows) {
      const fkValue = row[childColIdx];
      if (fkValue === null) continue;
      totalRelationships++;
      if (!parentPKs.has(String(fkValue))) {
        violations++;
        logger.debug(`FK violation: ${fk.child_table}.${fk.child_column} -> ${fk.parent_table}.${fk.parent_column} (value: ${fkValue})`);
      }
    }
  }

  if (violations > 0) {
    return {
      name: 'FK integrity',
      passed: false,
      isWarning: false,
      message: `${violations} FK violations found out of ${logger.formatNumber(totalRelationships)} relationships`,
    };
  }

  return {
    name: 'FK integrity',
    passed: true,
    isWarning: false,
    message: `${logger.formatNumber(totalRelationships)} relationships — all valid`,
  };
}

function checkUniqueConstraints(
  profile: IsomorphProfile,
  tableMap: Map<string, GeneratedData>
): ValidationCheck {
  let uniqueCols = 0;
  let duplicates = 0;

  for (const [tableName, table] of Object.entries(profile.tables)) {
    const data = tableMap.get(tableName);
    if (!data) continue;

    for (const [colName, col] of Object.entries(table.columns)) {
      if (!col.is_unique) continue;
      uniqueCols++;

      const colIdx = data.columns.indexOf(colName);
      if (colIdx === -1) continue;

      const seen = new Set<string>();
      for (const row of data.rows) {
        const val = row[colIdx];
        if (val === null) continue;
        const key = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (seen.has(key)) {
          duplicates++;
          logger.debug(`Unique violation: ${tableName}.${colName} (value: ${key})`);
        }
        seen.add(key);
      }
    }
  }

  if (duplicates > 0) {
    return {
      name: 'Unique constraints',
      passed: false,
      isWarning: false,
      message: `${duplicates} duplicate(s) found in ${uniqueCols} unique columns`,
    };
  }

  return {
    name: 'Unique constraints',
    passed: true,
    isWarning: false,
    message: `${uniqueCols} columns — no duplicates`,
  };
}

function checkNotNull(
  profile: IsomorphProfile,
  tableMap: Map<string, GeneratedData>
): ValidationCheck {
  let violations = 0;

  for (const [tableName, table] of Object.entries(profile.tables)) {
    const data = tableMap.get(tableName);
    if (!data) continue;

    for (const [colName, col] of Object.entries(table.columns)) {
      if (col.is_nullable) continue;
      const colIdx = data.columns.indexOf(colName);
      if (colIdx === -1) continue;

      for (const row of data.rows) {
        if (row[colIdx] === null || row[colIdx] === undefined) violations++;
      }
    }
  }

  if (violations > 0) {
    return {
      name: 'NOT NULL',
      passed: false,
      isWarning: false,
      message: `${violations} NOT NULL violation(s) found`,
    };
  }

  return { name: 'NOT NULL', passed: true, isWarning: false, message: 'All constraints satisfied' };
}

function checkNullRatioDrift(
  profile: IsomorphProfile,
  tableMap: Map<string, GeneratedData>
): ValidationCheck {
  const drifts: string[] = [];

  for (const [tableName, table] of Object.entries(profile.tables)) {
    const data = tableMap.get(tableName);
    if (!data || data.rows.length === 0) continue;

    for (const [colName, col] of Object.entries(table.columns)) {
      if (col.null_ratio === 0) continue;
      const colIdx = data.columns.indexOf(colName);
      if (colIdx === -1) continue;

      const nulls = data.rows.filter(r => r[colIdx] === null).length;
      const actualRatio = nulls / data.rows.length;
      const drift = Math.abs(actualRatio - col.null_ratio);

      if (drift > 0.10) {
        drifts.push(
          `${tableName}.${colName}: expected ${(col.null_ratio * 100).toFixed(0)}%, got ${(actualRatio * 100).toFixed(0)}%`
        );
      }
    }
  }

  if (drifts.length > 0) {
    return {
      name: 'Null ratio drift',
      passed: true,
      isWarning: true,
      message: drifts.join('; '),
    };
  }

  return { name: 'Null ratio drift', passed: true, isWarning: false, message: 'All within tolerance' };
}

function checkEnumValidity(
  profile: IsomorphProfile,
  tableMap: Map<string, GeneratedData>
): ValidationCheck {
  let enumCols = 0;
  let invalid = 0;

  for (const [tableName, table] of Object.entries(profile.tables)) {
    const data = tableMap.get(tableName);
    if (!data) continue;

    for (const [colName, col] of Object.entries(table.columns)) {
      if (col.data_type !== 'user-defined') continue;
      const enumDef = profile.enums[col.udt_name];
      if (!enumDef) continue;

      enumCols++;
      const colIdx = data.columns.indexOf(colName);
      if (colIdx === -1) continue;

      const validSet = new Set(enumDef);
      for (const row of data.rows) {
        const val = row[colIdx];
        if (val === null) continue;
        if (!validSet.has(String(val))) invalid++;
      }
    }
  }

  if (invalid > 0) {
    return {
      name: 'ENUM validity',
      passed: false,
      isWarning: false,
      message: `${invalid} invalid enum value(s) found in ${enumCols} columns`,
    };
  }

  return {
    name: 'ENUM validity',
    passed: true,
    isWarning: false,
    message: `${enumCols} enum columns — all values valid`,
  };
}

function checkRowCounts(tableMap: Map<string, GeneratedData>): ValidationCheck {
  const emptyTables = [...tableMap.entries()]
    .filter(([_, data]) => data.rows.length === 0)
    .map(([name]) => name);

  if (emptyTables.length > 0) {
    return {
      name: 'Row counts',
      passed: true,
      isWarning: true,
      message: `Tables with 0 rows: ${emptyTables.join(', ')}`,
    };
  }

  return {
    name: 'Row counts',
    passed: true,
    isWarning: false,
    message: `${tableMap.size} tables — all have rows`,
  };
}
