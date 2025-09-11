import { Request, ResponseToolkit } from '@hapi/hapi';
import { Client } from '@opensearch-project/opensearch';
import { subYears, formatISO } from 'date-fns';
import { OPENSEARCH_HOST, OPENSEARCH_ADMIN_PASSWORD } from '../../environment';

const osClient = new Client({
  node: OPENSEARCH_HOST,
  auth: {
    username: 'admin',
    password: OPENSEARCH_ADMIN_PASSWORD,
  },
});

export const searchPersonHandler = async (request: Request, h: ResponseToolkit) => {
  const {
    page = 1,
    pageSize = 10,
    full_name,
    gender,
    dob,
    age,
    identifier,
    searchMode = 'relaxer',
  } = request.payload as any;

  if (!full_name && !gender && !dob && !identifier) {
    return h.response({ error: 'At least one field must be provided' }).code(400);
  }

  try {
    const must: any[] = [];

    if (full_name) {
      if (searchMode === 'strict') {
        must.push({
          multi_match: {
            query: full_name,
            fields: ['full_name.keyword^3', 'given_name.keyword', 'family_name.keyword'],
            type: 'phrase',
          },
        });
      } else if (searchMode === 'relaxer') {
        must.push({
          bool: {
            should: [
              {
                multi_match: {
                  query: full_name,
                  type: 'most_fields',
                  fields: [
                    'full_name^3',
                    'full_name.keyword^2',
                    'full_name.ngram^2.5',
                    'given_name^2',
                    'family_name^2',
                  ],
                  fuzziness: 1,
                },
              },
              {
                match_phrase_prefix: {
                  "full_name": {
                    "query": full_name,
                    "boost": 5
                  }
                }
              },
              {
                multi_match: {
                  query: full_name,
                  type: 'best_fields',
                  fields: [
                    'full_name.phonetic^4',
                    'given_name.phonetic^2',
                    'family_name.phonetic^2',
                  ],
                  operator: 'or',
                },
              },
            ],
            minimum_should_match: 1,
          },
        });
      } else {
        must.push({
          bool: {
            should: [
              {
                multi_match: {
                  query: full_name,
                  type: 'most_fields',
                  fields: [
                    'full_name^3',
                    'full_name.keyword^2',
                    'full_name.ngram^2',
                    'given_name^2',
                    'family_name^2',
                  ],
                  fuzziness: 'AUTO',
                },
              },
              {
                multi_match: {
                  query: full_name,
                  type: 'best_fields',
                  fields: [
                    'full_name.phonetic^6',
                    'given_name.phonetic^3',
                    'family_name.phonetic^3',
                  ],
                  operator: 'and',
                },
              },
              {
                bool: {
                  should: [
                    {
                      wildcard: {
                        'full_name.keyword': {
                          value: `*${full_name.toLowerCase()}*`,
                          boost: 30
                        },
                      },
                    },
                    {
                      wildcard: {
                        'given_name.keyword': {
                          value: `*${full_name.toLowerCase()}*`,
                          boost: 30
                        },
                      },
                    },
                    {
                      wildcard: {
                        'family_name.keyword': {
                          value: `*${full_name.toLowerCase()}*`,
                          boost: 30
                        },
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            minimum_should_match: 1,
          },
        });
      }
    }

    if (gender) {
      must.push({ term: { gender: gender.toLowerCase() } });
    }

    if (dob) {
      must.push({ term: { dob } });
    } else if (age) {
      const ageInt = parseInt(age);
      if (!isNaN(ageInt)) {
        const today = new Date();
        const dobUpper = formatISO(subYears(today, ageInt));
        const dobLower = formatISO(subYears(today, ageInt + 1));
        must.push({
          range: {
            dob: {
              gte: dobLower,
              lt: dobUpper,
            },
          },
        });
      }
    }

    if (identifier) {
      must.push({
        nested: {
          path: 'identifiers',
          query: {
            bool: {
              should: [{ term: { 'identifiers.value': identifier } }],
            },
          },
        },
      });
    }

    const from = (parseInt(page) - 1) * parseInt(pageSize);

    const result = await osClient.search({
      index: 'person_read',
      from,
      size: parseInt(pageSize),
      track_total_hits: true,
      body: {
        query: {
          bool: { must },
        },
      },
    });

    const total =
      typeof result.body.hits.total === 'object'
        ? result.body.hits.total.value
        : result.body.hits.total;

    const hits = result.body?.hits?.hits?.map((hit: any) => ({
      ...hit._source,
      _score: hit._score,
    }));

    return h.response({ hits, total }).code(200);
  } catch (err: any) {
    console.error('Search error:', err);
    return h.response({ error: 'Search failed', detail: err.message || err.toString() }).code(500);
  }
};

export const detailedPersonSearchHandler = async (request: Request, h: ResponseToolkit) => {
  const {
    page = 1,
    pageSize = 10,
    given_name,
    family_name,
    full_name,
    gender,
    dob,
    age,
    identifier,
  } = request.payload as any;

  if (!given_name && !family_name && !full_name && !gender && !dob && !identifier) {
    return h.response({ error: 'At least one field must be provided' }).code(400);
  }

  try {
    const must: any[] = [];
    const should: any[] = [];

    if (given_name) {
      should.push({
        multi_match: {
          query: given_name,
          fields: ['given_name.keyword^5', 'given_name^3', 'given_name.phonetic^2'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (family_name) {
      should.push({
        multi_match: {
          query: family_name,
          fields: ['family_name.keyword^5', 'family_name^3', 'family_name.phonetic^2'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (full_name) {
      should.push({
        multi_match: {
          query: full_name,
          fields: ['full_name^3', 'full_name.keyword^2', 'full_name.ngram^1.5', 'full_name.phonetic'],
          fuzziness: 'AUTO',
        },
      });
    }

    if (should.length > 0) {
      must.push({
        bool: {
          should,
          minimum_should_match: 1,
        },
      });
    }

    if (gender) {
      must.push({ term: { gender: gender.toLowerCase() } });
    }

    if (dob) {
      must.push({ term: { dob } });
    } else if (age) {
      const ageInt = parseInt(age);
      if (!isNaN(ageInt)) {
        const today = new Date();
        const dobUpper = formatISO(subYears(today, ageInt));
        const dobLower = formatISO(subYears(today, ageInt + 1));
        must.push({
          range: {
            dob: {
              gte: dobLower,
              lt: dobUpper,
            },
          },
        });
      }
    }

    if (identifier) {
      must.push({
        nested: {
          path: 'identifiers',
          query: {
            bool: {
              should: [{ term: { 'identifiers.value': identifier } }],
            },
          },
        },
      });
    }

    const from = (parseInt(page) - 1) * parseInt(pageSize);

    const result = await osClient.search({
      index: 'person_read',
      from,
      size: parseInt(pageSize),
      track_total_hits: true,
      body: {
        query: {
          bool: { must },
        },
      },
    });

    const total =
      typeof result.body.hits.total === 'object'
        ? result.body.hits.total.value
        : result.body.hits.total;

    const hits = result.body?.hits?.hits?.map((hit: any) => ({
      ...hit._source,
      _score: hit._score,
    }));

    return h.response({ hits, total }).code(200);
  } catch (err: any) {
    console.error('Search error:', err);
    return h.response({ error: 'Search failed', detail: err.message || err.toString() }).code(500);
  }
};

export const advancedPersonSearchHandler = async (request: Request, h: ResponseToolkit) => {
  const {
    full_name,
    father_name,
    mother_name,
    spouse_name,
    child_name,
    dob,
    gender,
    identifier,
  } = request.payload as any;

  const must: any[] = [];

  if (full_name) {
    must.push({
      multi_match: {
        query: full_name,
        fields: ['full_name^2', 'full_name.phonetic', 'full_name.ngram'],
        fuzziness: 'AUTO',
      },
    });
  }

  if (dob) must.push({ match: { dob } });
  if (gender) must.push({ match: { gender } });

  if (identifier) {
    must.push({
      nested: {
        path: 'identifiers',
        query: {
          match: { 'identifiers.value': identifier },
        },
      },
    });
  }

  const addFamilyQuery = (role: string, name: string) => {
    must.push({
      nested: {
        path: 'linked_persons',
        query: {
          bool: {
            must: [
              { term: { 'linked_persons.role': role } },
              {
                multi_match: {
                  query: name,
                  fields: [
                    'linked_persons.full_name^2',
                    'linked_persons.full_name.phonetic',
                    'linked_persons.full_name.ngram',
                  ],
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
      },
    });
  };

  if (father_name) addFamilyQuery('father', father_name);
  if (mother_name) addFamilyQuery('mother', mother_name);
  if (spouse_name) addFamilyQuery('spouse', spouse_name);
  if (child_name) addFamilyQuery('child', child_name);

  if (must.length === 0) {
    return h.response({ error: 'At least one field must be provided' }).code(400);
  }

  try {
    const result = await osClient.search({
      index: 'person_read',
      size: 20,
      body: {
        query: { bool: { must } },
      },
    });

    const hits = result.body?.hits?.hits?.map((hit: any) => ({
      ...hit._source,
      _score: hit._score,
    })) ?? [];

    const total = typeof result.body.hits.total === 'object'
      ? result.body.hits.total.value
      : result.body.hits.total;

    return h.response({ hits, total }).code(200);
  } catch (err: any) {
    console.error('Advanced search error:', err);
    return h.response({
      error: 'Search failed',
      detail: err.message || err.toString(),
    }).code(500);
  }
};

export const debugHandler = async (request: Request, h: ResponseToolkit) => {
  return h.response({
    message: 'API working',
    env: {
      TOPPAN_DB_USER: process.env.TOPPAN_DB_USER,
      TOPPAN_DB_HOST: process.env.TOPPAN_DB_HOST,
      TOPPAN_DB_NAME: process.env.TOPPAN_DB_NAME,
      TOPPAN_DB_PORT: process.env.TOPPAN_DB_PORT,
      OSHOST: process.env.OSHOST,
      OPENSEARCH_HOST: process.env.OPENSEARCH_HOST
    }
  }).code(200);
};