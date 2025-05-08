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
import { storage } from '@client/storage'

export function getAvailableLanguages() {
  return window.config.LANGUAGES.split(',')
}

export function getDefaultLanguage() {
  return getAvailableLanguages()[0]
}

export async function getPreferredLanguage() {
  const languageInUrl = new URLSearchParams(window.location.search).get('lang')
  return (
    languageInUrl ?? (await storage.getItem('language')) ?? getDefaultLanguage()
  )
}

export function storeLanguage(language: string) {
  window.__localeId__ = language
  storage.setItem('language', language)
}
