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

export function mapRecordToCreationPayload(record: any) {
  return { record }
}

export function mapRecordToCorrectionPayload(recordInput: any) {
  const correction = recordInput.registration?.correction
  const fatherChange = correction?.values?.find(
    (cv: any) => cv.section === 'father' && cv.fieldName === 'detailsExist'
  )

  if (!fatherChange) return null

  const searchPersonIdChange = correction?.values?.find(
    (cv: any) => cv.section === 'father' && cv.fieldName === 'searchPersonId'
  )

  const relevantSearchPersonId = fatherChange.newValue
    ? searchPersonIdChange?.newValue
    : searchPersonIdChange?.oldValue

  const correctionReason = [
    correction?.reason,
    correction?.otherReason,
    correction?.note
  ]
    .filter(Boolean)
    .join(' - ')

  // For ADD_FATHER, searchPersonId is the person picker selection (external person ID)
  // For person picker, we should use fatherCRVSUuid instead of fatherId
  const fatherData = fatherChange.newValue
    ? {
        fatherCRVSUuid: recordInput.father?._fhirID
        // Don't send fatherId for person picker - let the correction handler resolve it
      }
    : {
        expectedPersonId: searchPersonIdChange?.oldValue,
        expectedCRVSUuid: recordInput.father?._fhirID
      }

  return {
    action: fatherChange.newValue ? 'ADD_FATHER' : 'REMOVE_FATHER',
    eventId: recordInput._fhirIDMap?.composition,
    fatherData,
    reason: correctionReason,
    correctionType: correction?.reason
  }
}
