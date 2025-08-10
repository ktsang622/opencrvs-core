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

  const correctionReason = [
    correction?.reason,
    correction?.otherReason,
    correction?.note
  ]
    .filter(Boolean)
    .join(' - ')

  // Determine action based on correction values
  let action: string
  let fatherData: any = {}

  if (fatherChange.oldValue === false && fatherChange.newValue === true) {
    // Adding father
    action = 'ADD_FATHER'
    if (searchPersonIdChange?.newValue) {
      // Person picker selection
      fatherData.fatherId = searchPersonIdChange.newValue
    } else if (recordInput.father?._fhirID) {
      // Manual entry or FHIR data
      fatherData.fatherCRVSUuid = recordInput.father._fhirID
      if (recordInput.father?.name?.[0]) {
        fatherData.manual = {
          given_name: recordInput.father.name[0].firstNames,
          family_name: recordInput.father.name[0].familyName,
          gender: recordInput.father.gender,
          dob: recordInput.father.birthDate,
          national_id: recordInput.father.identifier?.find(
            (id: any) => id.type === 'NATIONAL_ID'
          )?.id
        }
      }
    }
  } else if (
    fatherChange.oldValue === true &&
    fatherChange.newValue === false
  ) {
    // Removing father
    action = 'REMOVE_FATHER'
  } else if (fatherChange.oldValue === true && fatherChange.newValue === true) {
    // Updating or replacing father
    if (
      searchPersonIdChange &&
      searchPersonIdChange.oldValue !== searchPersonIdChange.newValue
    ) {
      action = 'REPLACE_FATHER'
      fatherData.fatherId = searchPersonIdChange.newValue
      fatherData.expectedPersonId = searchPersonIdChange.oldValue
    } else {
      action = 'UPDATE_FATHER_SAME'
      fatherData.expectedPersonId = searchPersonIdChange?.oldValue
      fatherData.expectedCRVSUuid = recordInput.father?._fhirID
    }
  } else {
    return null // No valid correction detected
  }

  return {
    action,
    eventId: recordInput._fhirIDMap?.composition,
    fatherData,
    reason: correctionReason,
    correctionType: correction?.reason,
    bundle: recordInput // Pass the full bundle for FHIR father detection
  }
}
