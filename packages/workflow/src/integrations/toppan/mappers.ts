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

// TOPPAN MIGRATION NOTE - Data Mapping Utilities:
// This file provides data transformation between OpenCRVS records and Toppan service format.
//
// Key changes made by Kevin Tsang:
// 1. Added birth record creation payload mapping for initial sync
// 2. Implemented complex correction payload mapping for father relationship changes
// 3. Enhanced correction detection for ADD_FATHER, REMOVE_FATHER, REPLACE_FATHER operations
// 4. Added support for both person picker selections and manual father data entry
// 5. Comprehensive logging for debugging correction workflows
//
// Migration requirements for new OpenCRVS releases:
// - Verify that OpenCRVS record structure remains compatible
// - Check if new correction types need mapping support
// - Ensure FHIR data extraction patterns work with new schema
// - Validate that person picker integration still works correctly
//
// Dependencies: OpenCRVS workflow record format, Toppan service API expectations
// Related: Works with client.ts for API communication

export function mapRecordToCreationPayload(record: any) {
  return { record }
}

export function mapRecordToCorrectionPayload(recordInput: any) {
  console.log(
    '🔍 mapRecordToCorrectionPayload input:',
    JSON.stringify(recordInput, null, 2)
  )

  const correction = recordInput.registration?.correction
  console.log('🔍 Found correction:', correction)

  // Check for death informant relationship type change (SPOUSE → other type)
  const informantTypeChange = correction?.values?.find(
    (cv: any) =>
      cv.section === 'informant' &&
      cv.fieldName === 'informantType' &&
      cv.oldValue === 'SPOUSE'
  )
  console.log('🔍 Found informantTypeChange:', informantTypeChange)

  if (informantTypeChange) {
    console.log('✅ Death informant type correction detected (SPOUSE → ' + informantTypeChange.newValue + ')')

    const correctionReason = [
      correction?.reason,
      correction?.otherReason,
      correction?.note
    ]
      .filter(Boolean)
      .join(' - ')

    return {
      action: 'REMOVE_SPOUSE_INFORMATIONAL_LINK',
      eventId: recordInput._fhirIDMap?.composition,
      oldInformantType: informantTypeChange.oldValue,
      newInformantType: informantTypeChange.newValue,
      reason: correctionReason,
      correctionType: correction?.reason,
      bundle: recordInput
    }
  }

  const fatherChange = correction?.values?.find(
    (cv: any) =>
      cv.section === 'father' &&
      (cv.fieldName === 'detailsExist' || cv.fieldName === 'searchPersonId')
  )
  console.log('🔍 Found fatherChange:', fatherChange)

  if (!fatherChange) {
    console.log('❌ No father or informant correction detected, returning null')
    return null
  }

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

  if (fatherChange.fieldName === 'searchPersonId') {
    // Father replacement via person picker
    action = 'REPLACE_FATHER'
    fatherData.fatherId = fatherChange.newValue
    fatherData.expectedPersonId = fatherChange.oldValue
  } else if (
    fatherChange.oldValue === false &&
    fatherChange.newValue === true
  ) {
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

  const payload = {
    action,
    eventId: recordInput._fhirIDMap?.composition,
    fatherData,
    reason: correctionReason,
    correctionType: correction?.reason,
    bundle: recordInput // Pass the full bundle for FHIR father detection
  }

  console.log(
    '✅ mapRecordToCorrectionPayload returning:',
    JSON.stringify(payload, null, 2)
  )
  return payload
}
