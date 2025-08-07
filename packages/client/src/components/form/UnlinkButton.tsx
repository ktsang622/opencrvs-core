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
import React from 'react'
import { TertiaryButton } from '@opencrvs/components/lib/buttons'
import { useFormikContext } from 'formik'

interface IUnlinkButtonProps {
  id: string
  label: string
  className?: string
}

export const UnlinkButton = (props: IUnlinkButtonProps) => {
  const { label } = props
  const formik = useFormikContext<any>()

  const handleUnlink = () => {
    if (formik) {
      // Clear only linked person fields (like change all pattern)
      const clearedFields = {
        searchPersonId: '',
        firstNamesEng: '',
        familyNameEng: '',
        motherBirthDate: '',
        motherIdType: '',
        motherNationalId: '',
        motherPassport: '',
        motherBirthRegistrationNumber: ''
      }

      formik.setValues({ ...formik.values, ...clearedFields })
      console.log('🔗 Person unlinked - fields cleared')
    }
  }

  return (
    <TertiaryButton type="button" onClick={handleUnlink}>
      {label}
    </TertiaryButton>
  )
}
