import { topologicalSort } from '../../src/graph/toposort';
import { buildDependencyGraph } from '../../src/graph/dag';
import { ForeignKeyInfo } from '../../src/profiler/schema-reader';

describe('Topological Sort', () => {
  it('should return all tables with no FKs', () => {
    const graph = buildDependencyGraph(['a', 'b', 'c'], []);
    const result = topologicalSort(graph);

    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('should sort linear chain (A → B → C)', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'b', child_column: 'a_id', parent_table: 'a', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'c', child_column: 'b_id', parent_table: 'b', parent_column: 'id', constraint_name: 'fk2' },
    ];
    const graph = buildDependencyGraph(['a', 'b', 'c'], fks);
    const result = topologicalSort(graph);

    expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('c'));
  });

  it('should sort diamond dependency correctly', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'c', child_column: 'a_id', parent_table: 'a', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'c', child_column: 'b_id', parent_table: 'b', parent_column: 'id', constraint_name: 'fk2' },
    ];
    const graph = buildDependencyGraph(['a', 'b', 'c'], fks);
    const result = topologicalSort(graph);

    expect(result.indexOf('a')).toBeLessThan(result.indexOf('c'));
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('c'));
  });

  it('should detect cycles and still produce a result', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'b', child_column: 'a_id', parent_table: 'a', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'a', child_column: 'b_id', parent_table: 'b', parent_column: 'id', constraint_name: 'fk2' },
    ];
    const graph = buildDependencyGraph(['a', 'b'], fks);

    // Suppress warn output
    const warn = jest.spyOn(console, 'log').mockImplementation();
    const result = topologicalSort(graph);
    warn.mockRestore();

    // Both nodes should appear (appended at end as cycle nodes)
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(['a', 'b']));
  });

  it('should handle mixed: some cyclic + some acyclic tables', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'b', child_column: 'a_id', parent_table: 'a', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'a', child_column: 'b_id', parent_table: 'b', parent_column: 'id', constraint_name: 'fk2' },
      { child_table: 'd', child_column: 'c_id', parent_table: 'c', parent_column: 'id', constraint_name: 'fk3' },
    ];
    const graph = buildDependencyGraph(['a', 'b', 'c', 'd'], fks);

    const warn = jest.spyOn(console, 'log').mockImplementation();
    const result = topologicalSort(graph);
    warn.mockRestore();

    expect(result).toHaveLength(4);
    // c comes before d
    expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
  });
});
