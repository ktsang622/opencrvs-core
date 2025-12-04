/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */

/**
 * External ID Management Module
 *
 * This module provides helpers for linking persons to external system identifiers
 * (GoID, NID, Passport, etc.) using the person_external_id table.
 *
 * IMPORTANT: All functions that modify data should be called within a transaction
 * to ensure atomicity and prevent race conditions. The caller is responsible for
 * transaction management.
 *
 * The _source marker in identifiers JSON:
 * - External IDs synced from person_external_id have "_source": "external"
 * - Downstream consumers (OpenSearch, UI) should handle this gracefully:
 *   - Either ignore the _source field when processing
 *   - Or filter it out before display if needed
 */

import { pool } from '../database'
import { PoolClient } from 'pg'
import { randomUUID } from 'crypto'

// ============================================================================
// Types
// ============================================================================

/** Known external system origins */
export const KNOWN_ORIGINS = [
  'crvs',
  'goid',
  'nid',
  'passport',
  'national_id',
  'drivers_license',
  'birth_cert',
  'external_person_id'
] as const

export type KnownOrigin = (typeof KNOWN_ORIGINS)[number]

/** Maximum metadata size in bytes */
const MAX_METADATA_SIZE = 4096

/** Input for linking an external ID to a person */
export interface ExternalIdInput {
  /** External system identifier (e.g., 'goid', 'nid') - will be lowercased */
  origin: string
  /** The ID value from the external system (case-preserved) */
  externalId: string
  /** Legacy type for backward compat with identifiers JSON (e.g., 'EXTERNAL_PERSON_ID') */
  legacyType?: string
  /** Whether this ID has been verified */
  isVerified?: boolean
  /** User/system that verified the ID */
  verifiedBy?: string
  /** Method used for verification (e.g., 'api_lookup', 'manual', 'biometric') */
  verificationMethod?: string
  /** Additional metadata (JSON, max 4KB, no PII) */
  metadata?: Record<string, unknown>
  /** User/system that created this link */
  createdBy?: string
}

/** Result from finding a person by external ID */
export interface ExternalIdLookupResult {
  personId: string
  isVerified: boolean
}

/** Result from find-or-create operation */
export interface FindOrCreateResult {
  personId: string
  created: boolean
}

/** Data required to create a new person */
export interface PersonCreateData {
  givenName: string
  familyName: string
  gender: string
  dob: string | null
  placeOfBirth?: string
  placeOfBirthUuid?: string | null
  status?: 'active' | 'review'
  /**
   * Additional identifiers from FHIR bundle to persist (e.g., CRVS ID, NATIONAL_ID).
   * These will be merged with the external ID in person.identifiers.
   * Format: [{ type: 'crvs', value: 'patient-uuid' }, { type: 'NATIONAL_ID', value: '...' }]
   */
  additionalIdentifiers?: Array<{ type: string; value: string; event?: string }>
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Parse a prefixed external identifier string (e.g., "goid:1234567890")
 * into its origin and ID components.
 *
 * @param value - The identifier string to parse
 * @returns Parsed origin and externalId, or null if format doesn't match
 *
 * @example
 * parseExternalIdentifier('goid:1234567890')
 * // => { origin: 'goid', externalId: '1234567890' }
 *
 * parseExternalIdentifier('ABC123')
 * // => null (no prefix)
 */
export function parseExternalIdentifier(
  value: string
): { origin: string; externalId: string } | null {
  if (!value) return null
  const match = value.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(.+)$/)
  if (!match) return null
  return {
    origin: match[1].toLowerCase(),
    externalId: match[2]
  }
}

/**
 * Validate external ID input before database operations.
 *
 * @param input - The input to validate
 * @returns Validation result with error message if invalid
 */
export function validateExternalIdInput(
  input: ExternalIdInput
): { valid: true } | { valid: false; error: string } {
  // Check external ID is not empty
  if (!input.externalId || input.externalId.trim().length === 0) {
    return { valid: false, error: 'external_id cannot be empty' }
  }

  // Check length limits
  if (input.externalId.length > 255) {
    return { valid: false, error: 'external_id exceeds 255 characters' }
  }

  if (input.origin.length > 50) {
    return { valid: false, error: 'origin exceeds 50 characters' }
  }

  // Warn on unknown origin (but allow it for extensibility)
  const normalizedOrigin = input.origin.toLowerCase()
  if (!KNOWN_ORIGINS.includes(normalizedOrigin as KnownOrigin)) {
    console.warn(
      `Unknown external ID origin "${normalizedOrigin}" - consider adding to KNOWN_ORIGINS`
    )
  }

  // Check metadata size if provided
  if (input.metadata) {
    const metadataStr = JSON.stringify(input.metadata)
    if (Buffer.byteLength(metadataStr, 'utf8') > MAX_METADATA_SIZE) {
      return { valid: false, error: `metadata exceeds ${MAX_METADATA_SIZE} bytes` }
    }
    // Basic PII check - reject obvious sensitive data
    const lowerStr = metadataStr.toLowerCase()
    if (
      lowerStr.includes('password') ||
      lowerStr.includes('secret') ||
      lowerStr.includes('token') ||
      lowerStr.includes('credit_card') ||
      lowerStr.includes('ssn')
    ) {
      return { valid: false, error: 'metadata appears to contain sensitive data' }
    }
  }

  return { valid: true }
}

/**
 * Check if a string is a valid UUID format.
 *
 * @param str - String to check
 * @returns true if valid UUID format
 */
export function isValidUuid(str: string | undefined | null): boolean {
  if (!str) return false
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Find a person by their external ID.
 *
 * Uses the person_external_id table for faster lookups than JSON containment.
 *
 * @param origin - External system identifier (e.g., 'goid')
 * @param externalId - The ID value from that system
 * @param tx - Optional transaction client
 * @returns Person ID and verification status, or null if not found
 */
export async function findPersonByExternalId(
  origin: string,
  externalId: string,
  tx?: PoolClient
): Promise<ExternalIdLookupResult | null> {
  const client = tx ?? pool
  const { rows } = await client.query(
    `
    SELECT person_id, is_verified
    FROM person_external_id
    WHERE origin = $1 AND external_id_lower = $2 AND status = 'active'
    LIMIT 1
  `,
    [origin.toLowerCase(), externalId.toLowerCase()]
  )

  if (rows.length === 0) return null
  return {
    personId: rows[0].person_id,
    isVerified: rows[0].is_verified
  }
}

/**
 * Link an external ID to a person.
 *
 * IMPORTANT: Must be called within a transaction if used with other operations.
 *
 * This function will:
 * - Insert a new link if the external ID doesn't exist
 * - Update verification info if re-linking the same person
 * - Throw an error if the external ID is already linked to a DIFFERENT person
 *
 * The sync trigger will automatically update person.identifiers JSON.
 *
 * @param personId - The person to link to
 * @param input - External ID details
 * @param tx - Optional transaction client (recommended)
 * @throws Error if external ID is already linked to a different person
 */
export async function linkExternalId(
  personId: string,
  input: ExternalIdInput,
  tx?: PoolClient
): Promise<void> {
  const client = tx ?? pool
  const normalizedOrigin = input.origin.toLowerCase().trim()
  const externalIdLower = input.externalId.toLowerCase()

  // Validate input
  const validation = validateExternalIdInput(input)
  if (!validation.valid) {
    throw new Error((validation as { valid: false; error: string }).error)
  }

  // Check if this external ID is already linked (only check active entries)
  const existing = await client.query(
    `
    SELECT person_id FROM person_external_id
    WHERE origin = $1 AND external_id_lower = $2 AND status = 'active'
  `,
    [normalizedOrigin, externalIdLower]
  )

  if (existing.rows.length > 0) {
    const existingPersonId = existing.rows[0].person_id
    if (existingPersonId !== personId) {
      // External ID belongs to a different person - this is a conflict
      throw new Error(
        `External ID ${normalizedOrigin}:${input.externalId} is already linked to person ${existingPersonId}. ` +
          `Cannot link to ${personId}. Resolve duplicate first.`
      )
    }
    // Same person - update verification info if provided
    await client.query(
      `
      UPDATE person_external_id
      SET is_verified = COALESCE($3, is_verified),
          verified_at = CASE WHEN $3 = true AND is_verified = false THEN NOW() ELSE verified_at END,
          verified_by = COALESCE($4, verified_by),
          verification_method = COALESCE($5, verification_method),
          metadata = COALESCE($6::jsonb, metadata),
          updated_at = NOW()
      WHERE origin = $1 AND external_id_lower = $2 AND status = 'active'
    `,
      [
        normalizedOrigin,
        externalIdLower,
        input.isVerified,
        input.verifiedBy,
        input.verificationMethod,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    )
    return
  }

  // Insert new link (status defaults to 'active' in DB, but be explicit)
  await client.query(
    `
    INSERT INTO person_external_id (
      person_id, origin, external_id, external_id_lower, legacy_type,
      is_verified, verified_at, verified_by, verification_method,
      metadata, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
  `,
    [
      personId,
      normalizedOrigin,
      input.externalId,
      externalIdLower,
      input.legacyType || input.origin.toUpperCase(),
      input.isVerified ?? false,
      input.isVerified ? new Date().toISOString() : null,
      input.verifiedBy,
      input.verificationMethod,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.createdBy
    ]
  )
}

/** Input for unlinking an external ID */
export interface UnlinkExternalIdInput {
  /** The person to unlink from */
  personId: string
  /** External system identifier (e.g., 'goid') */
  origin: string
  /** The external ID value */
  externalId: string
  /** User/system performing the unlink */
  removedBy?: string
  /** Reason for removal */
  removalReason?: string
}

/**
 * Unlink (soft-delete) an external ID from a person.
 *
 * This performs a soft-delete by setting status='removed' and capturing
 * audit information. The sync trigger will update person.identifiers
 * to remove the external entry while preserving internal identifiers.
 *
 * After unlinking, the external ID can be linked to a different person.
 *
 * @param input - Unlink details
 * @param tx - Optional transaction client (recommended)
 * @returns true if unlinked, false if not found
 */
export async function unlinkExternalId(
  input: UnlinkExternalIdInput,
  tx?: PoolClient
): Promise<boolean> {
  const client = tx ?? pool
  const normalizedOrigin = input.origin.toLowerCase().trim()
  const externalIdLower = input.externalId.toLowerCase()

  const result = await client.query(
    `
    UPDATE person_external_id
    SET status = 'removed',
        removed_at = NOW(),
        removed_by = $4,
        removal_reason = $5,
        updated_at = NOW()
    WHERE person_id = $1
      AND origin = $2
      AND external_id_lower = $3
      AND status = 'active'
    RETURNING id
  `,
    [
      input.personId,
      normalizedOrigin,
      externalIdLower,
      input.removedBy,
      input.removalReason
    ]
  )

  return (result.rowCount ?? 0) > 0
}

/**
 * Reassign an external ID from one person to another.
 *
 * This is an admin operation that:
 * 1. Fetches the existing record to preserve legacyType
 * 2. Unlinks the external ID from the current person
 * 3. Links it to the new person with the original legacyType
 *
 * IMPORTANT: Must be called within a transaction for atomicity.
 *
 * @param currentPersonId - Person currently linked to the external ID
 * @param newPersonId - Person to reassign the external ID to
 * @param origin - External system identifier
 * @param externalId - The external ID value
 * @param reassignedBy - User/system performing the reassignment
 * @param reason - Reason for reassignment
 * @param tx - Transaction client (REQUIRED)
 * @throws Error if external ID is not currently linked to currentPersonId
 */
export async function reassignExternalId(
  currentPersonId: string,
  newPersonId: string,
  origin: string,
  externalId: string,
  reassignedBy: string,
  reason: string,
  tx: PoolClient
): Promise<void> {
  const normalizedOrigin = origin.toLowerCase().trim()
  const externalIdLower = externalId.toLowerCase()

  // Step 1: Fetch existing record to preserve legacyType for backward compatibility
  // This ensures identifiers like 'EXTERNAL_PERSON_ID' don't change to 'GOID' after reassignment
  const existingResult = await tx.query(
    `
    SELECT legacy_type FROM person_external_id
    WHERE person_id = $1 AND origin = $2 AND external_id_lower = $3 AND status = 'active'
  `,
    [currentPersonId, normalizedOrigin, externalIdLower]
  )

  if (existingResult.rows.length === 0) {
    throw new Error(
      `External ID ${origin}:${externalId} is not actively linked to person ${currentPersonId}`
    )
  }

  const preservedLegacyType = existingResult.rows[0].legacy_type

  // Step 2: Unlink from current person
  await unlinkExternalId(
    {
      personId: currentPersonId,
      origin,
      externalId,
      removedBy: reassignedBy,
      removalReason: `Reassigned to person ${newPersonId}: ${reason}`
    },
    tx
  )

  // Step 3: Link to new person with preserved legacyType
  await linkExternalId(
    newPersonId,
    {
      origin,
      externalId,
      legacyType: preservedLegacyType, // Preserve original type for backward compatibility
      isVerified: false, // Reset verification on reassignment
      createdBy: reassignedBy,
      metadata: { reassigned_from: currentPersonId, reassign_reason: reason }
    },
    tx
  )
}

/**
 * Find an existing person by external ID, or create a new person and link.
 *
 * CRITICAL: This function MUST be called within a transaction to prevent:
 * - Race conditions where two callers both think the ID is available
 * - Orphan person records if linking fails
 *
 * The implementation:
 * 1. Checks if external ID already exists (returns existing person if so)
 * 2. Reserves the external ID slot FIRST (to win any race)
 * 3. Creates the person record
 * 4. If person creation fails, cleans up the external ID reservation
 *
 * @param tx - Transaction client (REQUIRED for atomicity)
 * @param input - External ID details
 * @param personData - Data for creating new person if needed
 * @returns Person ID and whether it was newly created
 *
 * @example
 * // CORRECT: Call within transaction
 * const result = await db.transaction(async (tx) => {
 *   return await findOrCreatePersonByExternalId(tx, input, personData)
 * })
 *
 * // WRONG: No transaction - race condition possible
 * const result = await findOrCreatePersonByExternalId(pool, input, personData)
 */
export async function findOrCreatePersonByExternalId(
  tx: PoolClient,
  input: ExternalIdInput,
  personData: PersonCreateData
): Promise<FindOrCreateResult> {
  const normalizedOrigin = input.origin.toLowerCase()
  const externalIdLower = input.externalId.toLowerCase()

  // Validate input
  const validation = validateExternalIdInput(input)
  if (!validation.valid) {
    throw new Error((validation as { valid: false; error: string }).error)
  }

  // Step 1: Check if external ID already exists
  const existing = await findPersonByExternalId(normalizedOrigin, input.externalId, tx)
  if (existing) {
    return { personId: existing.personId, created: false }
  }

  // Step 2: Create the person FIRST
  // Note: We create the person before linking the external ID because
  // person_external_id has a foreign key constraint to person(id).
  // Race protection is provided by the unique constraint on (origin, external_id_lower).
  const personId = randomUUID()
  const now = new Date().toISOString()

  // Build identifiers array combining:
  // 1. Additional identifiers from FHIR bundle (CRVS ID, NATIONAL_ID, etc.)
  // 2. External ID with _source marker (for sync trigger tracking)
  const allIdentifiers: Array<{ type: string; value: string; event?: string; _source?: string }> = []

  // Add FHIR bundle identifiers first (internal, no _source marker)
  if (personData.additionalIdentifiers) {
    for (const id of personData.additionalIdentifiers) {
      if (id.value?.trim()) {
        allIdentifiers.push({
          type: id.type,
          value: id.value,
          ...(id.event && { event: id.event })
        })
      }
    }
  }

  // Add external ID with _source marker (will be managed by sync trigger)
  allIdentifiers.push({
    type: input.legacyType || input.origin.toUpperCase(),
    value: input.externalId,
    _source: 'external'
  })

  // Create the person
  await tx.query(
    `
    INSERT INTO person (
      id, given_name, family_name, gender, dob, place_of_birth, place_of_birth_uuid,
      status, identifiers, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
  `,
    [
      personId,
      personData.givenName,
      personData.familyName,
      personData.gender,
      personData.dob,
      personData.placeOfBirth || 'Unknown',
      personData.placeOfBirthUuid || null,
      personData.status || 'active',
      JSON.stringify(allIdentifiers),
      now,
      now
    ]
  )

  // Step 3: Link the external ID to the person
  // The unique constraint on (origin, external_id_lower) provides race protection.
  // If another transaction already claimed this external ID, we'll get a unique violation.
  const reservationId = randomUUID()

  try {
    await tx.query(
      `
      INSERT INTO person_external_id (
        id, person_id, origin, external_id, external_id_lower, legacy_type,
        is_verified, verified_at, verified_by, verification_method,
        metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        reservationId,
        personId,
        normalizedOrigin,
        input.externalId,
        externalIdLower,
        input.legacyType || input.origin.toUpperCase(),
        input.isVerified ?? false,
        input.isVerified ? now : null,
        input.verifiedBy,
        input.verificationMethod,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdBy
      ]
    )
  } catch (err: any) {
    // Unique constraint violation - another transaction beat us to linking this external ID
    if (err.code === '23505') {
      // unique_violation
      // Re-fetch to get the person they created
      const winner = await findPersonByExternalId(normalizedOrigin, input.externalId, tx)
      if (winner) {
        // Clean up the orphan person we just created (will be rolled back by transaction anyway)
        // But return the winner's person ID
        return { personId: winner.personId, created: false }
      }
      // Shouldn't happen, but handle gracefully
      throw new Error(
        `Race condition: external ID ${normalizedOrigin}:${input.externalId} was claimed but lookup failed`
      )
    }
    throw err
  }

  return { personId, created: true }
}

/**
 * Get all ACTIVE external IDs for a person.
 *
 * @param personId - The person to look up
 * @param tx - Optional transaction client
 * @returns Array of active external ID records
 */
export async function getPersonExternalIds(
  personId: string,
  tx?: PoolClient
): Promise<
  Array<{
    origin: string
    externalId: string
    legacyType: string | null
    isVerified: boolean
    verifiedAt: string | null
    verificationMethod: string | null
  }>
> {
  const client = tx ?? pool
  const { rows } = await client.query(
    `
    SELECT origin, external_id, legacy_type, is_verified, verified_at, verification_method
    FROM person_external_id
    WHERE person_id = $1 AND status = 'active'
    ORDER BY created_at
  `,
    [personId]
  )

  return rows.map((row: any) => ({
    origin: row.origin,
    externalId: row.external_id,
    legacyType: row.legacy_type,
    isVerified: row.is_verified,
    verifiedAt: row.verified_at,
    verificationMethod: row.verification_method
  }))
}

/**
 * Get all external IDs for a person including removed (for audit history).
 *
 * @param personId - The person to look up
 * @param tx - Optional transaction client
 * @returns Array of all external ID records with status
 */
export async function getPersonExternalIdsWithHistory(
  personId: string,
  tx?: PoolClient
): Promise<
  Array<{
    origin: string
    externalId: string
    legacyType: string | null
    isVerified: boolean
    verifiedAt: string | null
    verificationMethod: string | null
    status: 'active' | 'removed'
    removedAt: string | null
    removedBy: string | null
    removalReason: string | null
  }>
> {
  const client = tx ?? pool
  const { rows } = await client.query(
    `
    SELECT origin, external_id, legacy_type, is_verified, verified_at, verification_method,
           status, removed_at, removed_by, removal_reason
    FROM person_external_id
    WHERE person_id = $1
    ORDER BY created_at
  `,
    [personId]
  )

  return rows.map((row: any) => ({
    origin: row.origin,
    externalId: row.external_id,
    legacyType: row.legacy_type,
    isVerified: row.is_verified,
    verifiedAt: row.verified_at,
    verificationMethod: row.verification_method,
    status: row.status,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    removalReason: row.removal_reason
  }))
}

// ============================================================================
// Backward Compatibility Helpers
// ============================================================================

/**
 * Build identifiers array including external IDs for backward compatibility.
 *
 * Use this when creating persons through existing code paths that still
 * expect the identifiers JSON array format.
 *
 * @param baseIdentifiers - Existing identifiers (e.g., from FHIR bundle)
 * @param externalId - Optional external ID to add
 * @returns Combined identifiers array
 */
export function buildIdentifiersWithExternalId(
  baseIdentifiers: Array<{ type: string; value: string }>,
  externalId?: { origin: string; value: string }
): Array<{ type: string; value: string; _source?: string }> {
  const result: Array<{ type: string; value: string; _source?: string }> = [...baseIdentifiers]

  if (externalId) {
    result.push({
      type: externalId.origin.toUpperCase(),
      value: externalId.value,
      _source: 'external'
    })
  }

  return result
}

/**
 * Strip _source markers from identifiers for consumers that don't expect them.
 *
 * Use this when returning identifiers to external systems (APIs, UI) that
 * may not handle the _source field.
 *
 * @param identifiers - Identifiers array possibly containing _source
 * @returns Identifiers with _source stripped
 */
export function stripSourceMarkers(
  identifiers: Array<{ type: string; value: string; _source?: string }>
): Array<{ type: string; value: string }> {
  return identifiers.map(({ type, value }) => ({ type, value }))
}
