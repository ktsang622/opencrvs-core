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

import { Request, ResponseToolkit } from '@hapi/hapi'

/**
 * Handler for Toppan certificate-service templates
 *
 * Serves ElmLayout templates and background images to certificate-service
 *
 * Example URLs:
 *   GET /api/countryconfig/certificates/toppan/birth/ElmLayout.txt
 *   GET /api/countryconfig/certificates/toppan/birth/BirthCertificateBackground.jpg
 *   GET /api/countryconfig/certificates/toppan/birth/signature.png
 */
export async function toppanTemplateHandler(
  request: Request,
  h: ResponseToolkit
) {
  const { templateType, filename } = request.params as {
    templateType: string  // 'birth', 'death', 'marriage'
    filename: string      // 'ElmLayout.txt', 'BirthCertificateBackground.jpg', etc.
  }

  // Construct file path: src/api/certificates/toppan-templates/birth/ElmLayout.txt
  const filePath = `${__dirname}/toppan-templates/${templateType}/${filename}`

  try {
    return h.file(filePath)
  } catch (error) {
    return h.response({ error: 'Template not found' }).code(404)
  }
}
