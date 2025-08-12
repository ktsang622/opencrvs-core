import { query } from '../client';

export async function getParentsFromFamilyLink(personId: string): Promise<any[]> {
  return (
    await query(
      `
      SELECT 
        related_person_id AS parent_person_id, 
        relationship_type, 
        start_date, 
        end_date
      FROM family_links_bidirectional
      WHERE person_id = $1
        AND relationship_type IN ('mother','father')
      `,
      [personId]
    )
  ) ?? [];
}

export async function getChildrenFromFamilyLink(personId: string): Promise<any[]> {
  return (
    await query(
      `
      SELECT 
        related_person_id AS child_id, 
        relationship_type, 
        start_date, 
        end_date
      FROM family_links_bidirectional
      WHERE person_id = $1
        AND relationship_type = 'child'
      `,
      [personId]
    )
  ) ?? [];
}

export async function getSpousesFromFamilyLink(personId: string): Promise<any[]> {
  return (
    await query(
      `
      SELECT 
        related_person_id AS spouse_id, 
        relationship_type, 
        relationship_subtype,
        start_date, 
        end_date
      FROM family_links_bidirectional
      WHERE person_id = $1
        AND relationship_type = 'spouse'
      `,
      [personId]
    )
  ) ?? [];
}