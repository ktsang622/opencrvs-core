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
import { IntlShape } from 'react-intl'
import {
  IDeclaration,
  SUBMISSION_STATUS,
  DOWNLOAD_STATUS,
  clearCorrectionAndPrintChanges
} from '@client/declarations'
import { DownloadButton } from '@client/components/interface/DownloadButton'
import { DownloadAction } from '@client/forms'
import { IDeclarationData } from './utils'
import { InternalRefetchQueriesInclude } from '@apollo/client'
import { FETCH_DECLARATION_SHORT_INFO } from '@client/views/RecordAudit/queries'
import { UserDetails } from '@client/utils/userUtils'
import { usePermissions } from '@client/hooks/useAuthorization'
import { SCOPES } from '@opencrvs/commons/client'
import { TertiaryButton } from '@opencrvs/components/lib/buttons'
import { useNavigate } from 'react-router-dom'
import { config } from '@client/config'
import { Toast } from '@opencrvs/components/lib/Toast'

export type CMethodParams = {
  declaration: IDeclarationData
  intl: IntlShape
  userDetails: UserDetails | null
  draft: IDeclaration | null
  clearCorrectionAndPrintChanges?: typeof clearCorrectionAndPrintChanges
}

export const ShowDownloadButton = ({
  declaration,
  draft
}: {
  declaration: IDeclarationData
  draft: IDeclaration | null
  userDetails: UserDetails | null
}) => {
  const { id, type } = declaration || {}
  const { hasScope } = usePermissions()

  if (declaration === null || id === null || type === null) return <></>

  const downloadStatus = draft?.downloadStatus || undefined
  let refetchQueries: InternalRefetchQueriesInclude = []
  if (
    !hasScope(SCOPES.RECORD_REGISTER) &&
    draft?.submissionStatus === SUBMISSION_STATUS.DECLARED
  )
    return <></>

  if (declaration.assignment && hasScope(SCOPES.RECORD_REGISTER)) {
    refetchQueries = [
      { query: FETCH_DECLARATION_SHORT_INFO, variables: { id: declaration.id } }
    ]
  }
  if (draft?.submissionStatus !== SUBMISSION_STATUS.DRAFT) {
    const downLoadConfig = {
      event: type as string,
      compositionId: id,
      action: DownloadAction.LOAD_REVIEW_DECLARATION,
      assignment: declaration?.assignment,
      refetchQueries
    }
    return (
      <DownloadButton
        key={id}
        downloadConfigs={downLoadConfig}
        status={downloadStatus as DOWNLOAD_STATUS}
        declarationStatus={declaration.status as SUBMISSION_STATUS}
      />
    )
  }

  return <></>
}

export const ViewPersonButton = ({
  declaration
}: {
  declaration: IDeclarationData
}) => {
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleViewPerson = async () => {
    if (!declaration?.id) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${window.config.API_GATEWAY_URL}/event/${declaration.id}/person?role=subject`
      )

      const data = await response.json()

      if (!response.ok) {
        // Handle 404 - event not synced
        if (response.status === 404) {
          setError('Person record not found. Event may not be synced yet.')
        } else {
          setError(data.error || data.message || 'Failed to fetch person')
        }
        return
      }

      if (data.personId) {
        navigate(`/person/${data.personId}/events`)
      } else {
        setError('No person found for this event')
      }
    } catch (err: any) {
      console.error('Error fetching person:', err)
      setError(err.message || 'Failed to load person')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <TertiaryButton
        id="view-person-btn"
        onClick={handleViewPerson}
        disabled={loading || !declaration?.id}
      >
        {loading ? 'Loading...' : 'View Person'}
      </TertiaryButton>
      {error && (
        <Toast type="warning" onClose={() => setError(null)}>
          {error}
        </Toast>
      )}
    </>
  )
}
