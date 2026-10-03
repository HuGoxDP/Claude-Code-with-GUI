import type { SequenceSource } from './AbstractEntityCollection';
import { SystemSequenceCollection } from './system/SystemSequence.collection';

/**
 * Where a collection takes its ids from unless told otherwise.
 *
 * In a module of its own so that the collections which need numbers can reach
 * the collection that stores them without that one importing them back.
 */
export function defaultSequences(): SequenceSource {
  return new SystemSequenceCollection();
}
