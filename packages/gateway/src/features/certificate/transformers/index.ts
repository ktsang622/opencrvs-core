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

import { transformAntiguaBundleToCertificateDTO } from './antigua'
import { CertificateDTO, EventType } from './shared/types'

/**
 * Certificate Transformer Function Type
 */
export type CertificateTransformer = (bundle: any, eventType: EventType) => CertificateDTO

/**
 * Registry of country-specific certificate transformers
 *
 * To add a new country:
 * 1. Create a new file in transformers/ (e.g., jamaica.ts)
 * 2. Implement the transformation function using shared utilities
 * 3. Register it here with the country code
 */
export const certificateTransformers: Record<string, CertificateTransformer> = {
  ATG: transformAntiguaBundleToCertificateDTO
  // Future countries:
  // JAM: transformJamaicaBundleToCertificateDTO,
  // BRB: transformBarbadosBundleToCertificateDTO,
}

/**
 * Get the appropriate transformer for a country code
 *
 * @param countryCode - ISO 3166-1 alpha-3 country code (e.g., "ATG", "JAM")
 * @returns The transformer function for that country
 * @throws Error if no transformer is registered for the country
 */
export function getTransformerForCountry(countryCode: string): CertificateTransformer {
  const transformer = certificateTransformers[countryCode]
  if (!transformer) {
    throw new Error(
      `No certificate transformer found for country: ${countryCode}. ` +
        `Available countries: ${Object.keys(certificateTransformers).join(', ')}`
    )
  }
  return transformer
}

/**
 * Check if a transformer exists for a country code
 */
export function hasTransformerForCountry(countryCode: string): boolean {
  return countryCode in certificateTransformers
}

/**
 * Get list of all supported country codes
 */
export function getSupportedCountries(): string[] {
  return Object.keys(certificateTransformers)
}
