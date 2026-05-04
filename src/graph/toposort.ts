import { DependencyGraph } from './dag';
import logger from '../utils/logger';

/**
 * Kahn's algorithm for topological sort.
 * Returns tables in generation order (parents before children).
 * Detects cycles and appends cyclic nodes at end with a warning.
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const queue: string[] = [];
  const result: string[] = [];
  const inDegree = new Map(graph.inDegree);

  // Start with all nodes that have no dependencies
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const child of graph.edges.get(node) ?? []) {
      const newDegree = inDegree.get(child)! - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) queue.push(child);
    }
  }

  // Any node not in result = part of a cycle
  const cycleNodes = [...graph.nodes].filter(n => !result.includes(n));
  if (cycleNodes.length > 0) {
    logger.warn(
      `Circular FK detected in: ${cycleNodes.join(', ')}. These tables will be generated last with FK checks disabled.`
    );
    result.push(...cycleNodes);
  }

  return result;
}
