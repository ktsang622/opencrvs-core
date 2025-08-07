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

import * as React from 'react'
import { useState } from 'react'
import { Frame } from '@opencrvs/components/lib/Frame'
import { Header } from '@client/components/Header/Header'
import { Navigation } from '@client/components/interface/Navigation'
import { Button } from '@opencrvs/components/lib/Button'
import { InputField } from '@client/components/form/InputField'
import { Content, ContentSize } from '@opencrvs/components/lib/Content'
import { injectIntl, WrappedComponentProps as IntlShapeProps } from 'react-intl'
import { constantsMessages } from '@client/i18n/messages'
import { Icon } from '@opencrvs/components/lib/Icon'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { config } from '@client/config'
import { useSelector } from 'react-redux'
import { getScope } from '@client/profile/profileSelectors'
import { SearchForm } from './SearchForm'
import { SearchResults } from './SearchResults'
import { AccessControl } from './AccessControl'
import { usePersonSearch } from '@client/hooks/usePersonSearch'

const SearchButton = styled(Button)`
  margin-top: 16px;
`

const ResultsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.white};
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-top: 20px;

  @media (max-width: 768px) {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
`

const ResultRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.grey200};

  &:hover {
    background-color: ${({ theme }) => theme.colors.grey100};
  }

  &:last-child {
    border-bottom: none;
  }
`

const ResultCell = styled.td`
  padding: 12px 16px;
  vertical-align: top;
  min-width: 120px;

  &:first-child {
    min-width: 200px;
  }

  &:last-child {
    min-width: 180px;
  }

  @media (max-width: 768px) {
    padding: 8px 12px;
    min-width: 100px;

    &:first-child {
      min-width: 150px;
    }

    &:last-child {
      min-width: 140px;
    }
  }
`

const ResultHeader = styled.th`
  padding: 16px;
  background: ${({ theme }) => theme.colors.grey100};
  text-align: left;
  ${({ theme }) => theme.fonts.bold16};
  color: ${({ theme }) => theme.colors.copy};
  border-bottom: 2px solid ${({ theme }) => theme.colors.grey300};
`

const PersonName = styled.div`
  ${({ theme }) => theme.fonts.bold14};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 4px;
`

const PersonDetail = styled.div`
  ${({ theme }) => theme.fonts.reg14};
  color: ${({ theme }) => theme.colors.supportingCopy};
  margin-bottom: 2px;
`

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 4px;
  }
`

interface IPersonSearchProps extends IntlShapeProps {}

const PersonSearchView: React.FC<IPersonSearchProps> = ({ intl }) => {
  const scope = useSelector(getScope)
  const navigate = useNavigate()

  // Check if user has registrar permissions
  const hasRegistrarAccess =
    scope &&
    (scope.includes('record.register') ||
      scope.includes('record.validate') ||
      scope.includes('record.certify'))

  const {
    searchTerm,
    setSearchTerm,
    selectedGender,
    setSelectedGender,
    searchMode,
    setSearchMode,
    searchResults,
    paginatedResults,
    isSearching,
    error,
    currentPage,
    pageSize,
    totalResults,
    totalPages,
    goToPage
  } = usePersonSearch(20)

  const selectPerson = (person: any) => {
    navigate('/events/birth/registration', {
      state: { linkedPersonUuid: person.uuid, prefilledData: person }
    })
  }

  return (
    <AccessControl hasAccess={!!hasRegistrarAccess}>
      <Frame
        header={<Header title="Search Person" />}
        skipToContentText={intl.formatMessage(
          constantsMessages.skipToMainContent
        )}
        navigation={<Navigation />}
      >
        <Content
          title="Search Person"
          size={ContentSize.LARGE}
          subtitle="Search for existing persons in the database"
        >
          <SearchForm
            searchQuery={searchTerm}
            selectedGender={selectedGender}
            searchMode={searchMode}
            loading={isSearching}
            onSearchQueryChange={setSearchTerm}
            onGenderChange={setSelectedGender}
            onSearchModeChange={setSearchMode}
          />

          {searchTerm.trim() && totalResults > 0 && (
            <div
              style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}
            >
              Results: {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, totalResults)} of {totalResults}
            </div>
          )}

          <SearchResults
            searchResults={paginatedResults}
            currentPage={currentPage}
            pageSize={pageSize}
            totalResults={totalResults}
            totalPages={totalPages}
            onPageChange={goToPage}
            onPersonSelect={selectPerson}
          />
        </Content>
      </Frame>
    </AccessControl>
  )
}

export const PersonSearch = injectIntl(PersonSearchView)
