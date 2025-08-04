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

const SearchButton = styled(Button)`
  margin-top: 16px;
`

const ResultsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.borderRadius}px;
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

  const [searchQuery, setSearchQuery] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [searchMode, setSearchMode] = useState('relaxer')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalResults, setTotalResults] = useState(0)

  const handleSearch = async (page = currentPage) => {
    setLoading(true)

    if (config.USE_MOCK_PERSON_DATA) {
      // Mock data
      const mockResults = [
        {
          uuid: '50989c77-8345-4763-a12c-21f43d9e525f',
          name: 'John Doe',
          nationalId: 'ID123456',
          dateOfBirth: '1990-05-15',
          score: 0.95
        },
        {
          uuid: '98765-43210',
          name: 'Jane Smith',
          nationalId: 'ID654321',
          dateOfBirth: '1985-08-22',
          score: 0.87
        },
        {
          uuid: '11111-22222',
          name: 'Bob Johnson',
          nationalId: 'ID789012',
          dateOfBirth: '1978-12-03',
          score: 0.73
        }
      ]
        .filter(
          (person) =>
            person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.nationalId.includes(searchQuery) ||
            person.dateOfBirth.includes(searchQuery) ||
            (idNumber && person.nationalId.includes(idNumber))
        )
        .sort((a, b) => b.score - a.score)

      setTimeout(() => {
        setSearchResults(mockResults)
        setTotalResults(mockResults.length)
        setLoading(false)
      }, 500)
    } else {
      // Real API call
      try {
        const apiUrl = `${config.API_GATEWAY_URL}person-search`

        const requestBody = {
          full_name: searchQuery,
          gender: '',
          dob: '',
          age: '',
          identifier: idNumber,
          searchMode: searchMode,
          page: page,
          pageSize: pageSize
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        console.log('API Response:', data)
        console.log('First result:', data.hits?.[0] || data[0])
        setSearchResults(data.hits || data)
        setTotalResults(data.total || (data.hits || data).length)
      } catch (error) {
        setSearchResults([])
      } finally {
        setLoading(false)
      }
    }
  }

  const selectPerson = (person: any) => {
    navigate('/events/birth/registration', {
      state: { linkedPersonUuid: person.uuid, prefilledData: person }
    })
  }

  return (
    <AccessControl hasAccess={hasRegistrarAccess}>
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
            searchQuery={searchQuery}
            idNumber={idNumber}
            searchMode={searchMode}
            pageSize={pageSize}
            loading={loading}
            onSearchQueryChange={setSearchQuery}
            onIdNumberChange={setIdNumber}
            onSearchModeChange={setSearchMode}
            onPageSizeChange={(newPageSize) => {
              setPageSize(newPageSize)
              setCurrentPage(1)
              if (searchResults.length > 0) {
                handleSearch(1)
              }
            }}
            onSearch={() => {
              setCurrentPage(1)
              handleSearch()
            }}
          />

          <SearchResults
            searchResults={searchResults}
            currentPage={currentPage}
            pageSize={pageSize}
            totalResults={totalResults}
            onPageChange={(newPage) => {
              setCurrentPage(newPage)
              handleSearch(newPage)
            }}
            onPersonSelect={selectPerson}
          />

          {searchResults.length === 0 &&
            !loading &&
            (searchQuery.trim() || idNumber.trim()) && (
              <p
                style={{
                  textAlign: 'center',
                  color: '#666',
                  marginTop: '40px'
                }}
              >
                No persons found matching your search criteria.
              </p>
            )}
        </Content>
      </Frame>
    </AccessControl>
  )
}

export const PersonSearch = injectIntl(PersonSearchView)
