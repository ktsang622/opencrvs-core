import { query } from '../client';
import { Node } from '@opencrvs/toppan-common';

export async function getPersonById(id: string): Promise<Node[]> {
  const result = await query(
    `WITH filtered_ids AS (
        SELECT p.id, jsonb_array_elements(p.identifiers)::jsonb AS id_obj
        FROM public.person p
        WHERE p.id = $1
      ), deduplicated_ids AS (
        SELECT DISTINCT id, id_obj ->> 'type' AS id_type, id_obj ->> 'value' AS id_value
        FROM filtered_ids
      ), indexed_ids AS (
        SELECT id, id_type, id_value,
          ROW_NUMBER() OVER (
            PARTITION BY id
            ORDER BY CASE WHEN id_type = 'crvs' THEN 2 ELSE 1 END, id_type
          ) AS rn
        FROM deduplicated_ids
      )
      SELECT p.id, p.full_name, p.dob, p.death_date AS death,
             AGE(COALESCE(p.death_date, NOW()), p.dob) AS age,
             MAX(CASE WHEN i.rn = 1 THEN i.id_type END) AS id_type_1,
             MAX(CASE WHEN i.rn = 1 THEN i.id_value END) AS id_1,
             MAX(CASE WHEN i.rn = 2 THEN i.id_type END) AS id_type_2,
             MAX(CASE WHEN i.rn = 2 THEN i.id_value END) AS id_2,
             MAX(CASE WHEN i.rn = 3 THEN i.id_type END) AS id_type_3,
             MAX(CASE WHEN i.rn = 3 THEN i.id_value END) AS id_3
      FROM public.person p
      LEFT JOIN indexed_ids i ON p.id = i.id
      WHERE p.id = $1
      GROUP BY p.id, p.full_name, p.dob, p.death_date`,
    [id]
  );
  return result || [];
}