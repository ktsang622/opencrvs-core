import { Node, Link } from '@opencrvs/toppan-common';
import { getPersonById } from './getPersonById';
import { getParentsFromFamilyLink, getChildrenFromFamilyLink, getSpousesFromFamilyLink } from './getFamilyRelationships';

export async function getFamilyLevels(
  rootId: string,
  depthUp = 1,
  depthDown = 1,
  existingTree: Node[] = [],
  baseLevel = 0,
  existingLinks: Link[] = []
): Promise<{ nodes: Node[]; links: Link[] }> {
  const visited = new Set(existingTree.map((p) => p.id));
  const existingLinkKeys = new Set(
    existingLinks.map((l) => `${l.from}-${l.to}-${l.relationship}`)
  );

  const newNodes: Node[] = [];
  const links: Link[] = [];

  const linkKey = (from: string, to: string, rel: string) => `${from}-${to}-${rel}`;

  const getPerson = async (id: string, level: number, relationshipEndDate?: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const person = await getPersonById(id);
    if (person.length > 0) {
      newNodes.push({ ...person[0], level, end_date: relationshipEndDate });
    }
  };

  const getAncestors = async (id: string, level: number) => {
    if (level < baseLevel - depthUp) return;

    const parents = await getParentsFromFamilyLink(id);
    for (const p of parents) {
      const parentId = p.parent_person_id;
      const key = linkKey(parentId, id, p.relationship_type);

      if (!existingLinkKeys.has(key)) {
        links.push({
          from: parentId,
          to: id,
          relationship: p.relationship_type,
          start_date: p.start_date,
          end_date: p.end_date,
        });
        existingLinkKeys.add(key);
      }

      if (!visited.has(parentId)) {
        await getPerson(parentId, level, p.end_date);
        await getAncestors(parentId, level - 1);
      }
    }
  };

  const getDescendants = async (id: string, level: number) => {
    if (level > baseLevel + depthDown) return;

    const children = await getChildrenFromFamilyLink(id);
    for (const c of children) {
      const childId = c.child_id;
      const key = linkKey(id, childId, c.relationship_type);

      if (!existingLinkKeys.has(key)) {
        links.push({
          from: id,
          to: childId,
          relationship: c.relationship_type,
          start_date: c.start_date,
          end_date: c.end_date,
        });
        existingLinkKeys.add(key);
      }

      if (!visited.has(childId)) {
        await getPerson(childId, level, c.end_date);
        await getDescendants(childId, level + 1);
        await getAncestors(childId, level - 1);
      }
    }
  };

  const getSpouses = async (id: string, level: number) => {
    const spouses = await getSpousesFromFamilyLink(id);
    for (const s of spouses) {
      const spouseId = s.spouse_id;
      const key = linkKey(id, spouseId, s.relationship_type);

      if (!existingLinkKeys.has(key)) {
        links.push({
          from: id,
          to: spouseId,
          relationship: s.relationship_type,
          start_date: s.start_date,
          end_date: s.end_date,
        });
        existingLinkKeys.add(key);
      }

      if (!visited.has(spouseId)) {
        await getPerson(spouseId, level, s.end_date);
      }
    }
  };

  // Seed tree
  await getPerson(rootId, baseLevel);
  await getSpouses(rootId, baseLevel);
  await getAncestors(rootId, baseLevel - 1);
  await getDescendants(rootId, baseLevel + 1);

  return { nodes: newNodes, links };
}

export async function expandNode(
  nodeId: string,
  existingTree: Node[] = [],
  existingLinks: Link[] = [],
  returnDelta = true
): Promise<
  | { deltaNodes: Node[]; deltaLinks: Link[] }
  | { fullTree: Node[]; fullLinks: Link[] }
> {
  const node = existingTree.find((n) => n.id === nodeId);
  const baseLevel = node?.level ?? 0;

  const { nodes: newNodes, links: newLinks } = await getFamilyLevels(
    nodeId,
    1,
    1,
    existingTree,
    baseLevel,
    existingLinks
  );

  const updatedTree = [...existingTree, ...newNodes];
  const updatedLinks = [...existingLinks, ...newLinks];

  return returnDelta
    ? { deltaNodes: newNodes, deltaLinks: newLinks }
    : { fullTree: updatedTree, fullLinks: updatedLinks };
}