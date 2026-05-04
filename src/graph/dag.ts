import { ForeignKeyInfo } from '../profiler/schema-reader';

export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>; // parent -> Set of children
  inDegree: Map<string, number>;   // table -> count of parents
}

/**
 * Build a directed dependency graph from FK relationships.
 * Edges point from parent table to child table.
 */
export function buildDependencyGraph(
  tableNames: string[],
  foreignKeys: ForeignKeyInfo[]
): DependencyGraph {
  const nodes = new Set<string>(tableNames);
  const edges = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  // Initialize all tables with inDegree = 0
  for (const name of nodes) {
    edges.set(name, new Set());
    inDegree.set(name, 0);
  }

  // Add edges: parent_table → child_table
  for (const fk of foreignKeys) {
    // Skip self-referencing FKs
    if (fk.parent_table === fk.child_table) continue;

    // Only add edges for tables we know about
    if (!nodes.has(fk.parent_table) || !nodes.has(fk.child_table)) continue;

    const children = edges.get(fk.parent_table)!;
    if (!children.has(fk.child_table)) {
      children.add(fk.child_table);
      inDegree.set(fk.child_table, (inDegree.get(fk.child_table) ?? 0) + 1);
    }
  }

  return { nodes, edges, inDegree };
}
