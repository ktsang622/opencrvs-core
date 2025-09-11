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

import fetch from 'node-fetch'
import { COUNTRY_CONFIG_URL } from '@gateway/constants'

interface IApplicationConfig {
  FEATURES?: {
    ENHANCED_DOCUMENT_VIEWER?: boolean
  }
}

let cachedConfig: IApplicationConfig | null = null
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache

export async function getApplicationConfig(): Promise<IApplicationConfig> {
  const now = Date.now()

  // Return cached config if still valid
  if (cachedConfig && now - lastFetchTime < CACHE_DURATION) {
    return cachedConfig
  }

  try {
    const response = await fetch(
      new URL('application-config', COUNTRY_CONFIG_URL)
    )

    if (!response.ok) {
      throw new Error(
        `Couldn't fetch application config: ${await response.text()}`
      )
    }

    const config = (await response.json()) as IApplicationConfig

    // Cache the config
    cachedConfig = config
    lastFetchTime = now

    return config
  } catch (error) {
    console.warn('Failed to fetch application config:', error)

    // Return cached config as fallback, or empty object
    return cachedConfig || {}
  }
}

export async function isEnhancedDocumentViewerEnabled(): Promise<boolean> {
  try {
    console.log('DEBUG: Fetching application config for PDF support...')
    const config = await getApplicationConfig()
    console.log('DEBUG: Application config:', JSON.stringify(config, null, 2))
    const isEnabled = config.FEATURES?.ENHANCED_DOCUMENT_VIEWER === true
    console.log('DEBUG: ENHANCED_DOCUMENT_VIEWER enabled:', isEnabled)
    return isEnabled
  } catch (error) {
    console.warn('Error checking ENHANCED_DOCUMENT_VIEWER feature flag:', error)
    return false // Default to disabled if we can't determine
  }
}
