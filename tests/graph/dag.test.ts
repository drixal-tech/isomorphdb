import { buildDependencyGraph } from '../../src/graph/dag';
import { ForeignKeyInfo } from '../../src/profiler/schema-reader';

describe('DAG Builder', () => {
  it('should build an empty graph with no FKs', () => {
    const graph = buildDependencyGraph(['users', 'products'], []);

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.has('users')).toBe(true);
    expect(graph.nodes.has('products')).toBe(true);
    expect(graph.inDegree.get('users')).toBe(0);
    expect(graph.inDegree.get('products')).toBe(0);
    expect(graph.edges.get('users')!.size).toBe(0);
  });

  it('should build a simple parent-child graph', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'orders', child_column: 'user_id', parent_table: 'users', parent_column: 'id', constraint_name: 'fk_user' },
    ];

    const graph = buildDependencyGraph(['users', 'orders'], fks);

    expect(graph.edges.get('users')!.has('orders')).toBe(true);
    expect(graph.inDegree.get('users')).toBe(0);
    expect(graph.inDegree.get('orders')).toBe(1);
  });

  it('should handle multiple FK levels (A → B → C)', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'orders', child_column: 'user_id', parent_table: 'users', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'order_items', child_column: 'order_id', parent_table: 'orders', parent_column: 'id', constraint_name: 'fk2' },
    ];

    const graph = buildDependencyGraph(['users', 'orders', 'order_items'], fks);

    expect(graph.inDegree.get('users')).toBe(0);
    expect(graph.inDegree.get('orders')).toBe(1);
    expect(graph.inDegree.get('order_items')).toBe(1);
  });

  it('should skip self-referencing FKs', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'categories', child_column: 'parent_id', parent_table: 'categories', parent_column: 'id', constraint_name: 'fk_self' },
    ];

    const graph = buildDependencyGraph(['categories'], fks);

    expect(graph.inDegree.get('categories')).toBe(0);
  });

  it('should skip FKs referencing unknown tables', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'orders', child_column: 'user_id', parent_table: 'unknown_table', parent_column: 'id', constraint_name: 'fk1' },
    ];

    const graph = buildDependencyGraph(['orders'], fks);

    expect(graph.inDegree.get('orders')).toBe(0);
  });

  it('should handle diamond dependency (A → C, B → C)', () => {
    const fks: ForeignKeyInfo[] = [
      { child_table: 'order_items', child_column: 'order_id', parent_table: 'orders', parent_column: 'id', constraint_name: 'fk1' },
      { child_table: 'order_items', child_column: 'product_id', parent_table: 'products', parent_column: 'id', constraint_name: 'fk2' },
    ];

    const graph = buildDependencyGraph(['orders', 'products', 'order_items'], fks);

    expect(graph.inDegree.get('orders')).toBe(0);
    expect(graph.inDegree.get('products')).toBe(0);
    expect(graph.inDegree.get('order_items')).toBe(2);
  });
});
