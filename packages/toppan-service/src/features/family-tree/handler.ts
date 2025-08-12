import { Request, ResponseToolkit } from '@hapi/hapi';
import { getFamilyLevels, expandNode } from '@opencrvs/toppan-db';

export const familyTreeInitHandler = async (request: Request, h: ResponseToolkit) => {
  const { person_id } = request.params;

  if (!person_id) {
    return h.response({ error: 'Missing person_id parameter' }).code(400);
  }

  try {
    const { nodes, links } = await getFamilyLevels(person_id, 1, 1, [], 0);
    return h.response({ nodes, links, expanded: person_id }).code(200);
  } catch (error) {
    console.error('Error in family tree init:', error);
    return h.response({ error: 'Failed to fetch tree' }).code(500);
  }
};

export const familyTreeExpandHandler = async (request: Request, h: ResponseToolkit) => {
  const { nodeId, nodes = [], links = [] } = request.payload as any;

  if (!nodeId) {
    return h.response({ error: 'Missing nodeId in request body' }).code(400);
  }

  try {
    const result = await expandNode(nodeId, nodes, links, true);

    if ('deltaNodes' in result) {
      return h.response(result).code(200);
    } else {
      return h.response({ error: 'Unexpected return structure from expandNode' }).code(500);
    }
  } catch (error) {
    console.error('Error in family tree expand:', error);
    return h.response({ error: 'Failed to expand node' }).code(500);
  }
};