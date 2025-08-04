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

  if (!hasRegistrarAccess) {
    return (
      <Frame
        header={<Header title="Access Denied" />}
        skipToContentText={intl.formatMessage(
          constantsMessages.skipToMainContent
        )}
        navigation={<Navigation />}
      >
        <Content title="Access Denied" size={ContentSize.LARGE}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <h3>Access Restricted</h3>
            <p>
              Only users with registration permissions have access to person
              search functionality.
            </p>
          </div>
        </Content>
      </Frame>
    )
  }

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
        <input
          id="search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Enter full name..."
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px',
            marginBottom: '10px'
          }}
        />

        <input
          id="id-input"
          type="text"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          placeholder="Enter ID number (optional)..."
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />

        <fieldset
          style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}
        >
          <legend
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#495057',
              marginBottom: '12px'
            }}
          >
            Search Mode
          </legend>
          <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
            {['strict', 'relaxer', 'most_relaxed'].map((mode) => (
              <label
                key={mode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor:
                    searchMode === mode ? '#e3f2fd' : 'transparent',
                  border:
                    searchMode === mode
                      ? '1px solid #2196F3'
                      : '1px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="radio"
                  name="searchMode"
                  value={mode}
                  checked={searchMode === mode}
                  onChange={(e) => setSearchMode(e.target.value)}
                  style={{ marginRight: '8px', accentColor: '#2196F3' }}
                />
                <span
                  style={{
                    textTransform: 'capitalize',
                    fontWeight: searchMode === mode ? '600' : '400',
                    color: searchMode === mode ? '#1976D2' : '#6c757d'
                  }}
                >
                  {mode.replace('_', ' ')}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'end',
            marginTop: '16px'
          }}
        >
          <div style={{ flex: 1 }}>
            <SearchButton
              id="search"
              type="primary"
              size="large"
              fullWidth
              disabled={loading || (!searchQuery.trim() && !idNumber.trim())}
              onClick={() => {
                setCurrentPage(1)
                handleSearch()
              }}
            >
              <Icon name="MagnifyingGlass" />
              {loading ? 'Searching...' : 'Search'}
            </SearchButton>
          </div>
          <select
            value={pageSize}
            onChange={(e) => {
              const newPageSize = Number(e.target.value)
              setPageSize(newPageSize)
              setCurrentPage(1)
              if (searchResults.length > 0) {
                handleSearch(1)
              }
            }}
            style={{
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            <option value={10}>10 results</option>
            <option value={20}>20 results</option>
            <option value={50}>50 results</option>
            <option value={100}>100 results</option>
          </select>
        </div>

        {searchResults.length > 0 && (
          <>
            <div style={{ marginTop: '20px', marginBottom: '10px' }}>
              <span style={{ color: '#666', fontSize: '14px' }}>
                Results ({totalResults}):
              </span>
            </div>
            <ResultsTable>
              <thead>
                <tr>
                  <ResultHeader>Person</ResultHeader>
                  <ResultHeader>Date of Birth</ResultHeader>
                  <ResultHeader>Match Score</ResultHeader>
                  <ResultHeader>Actions</ResultHeader>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((person, index) => (
                  <ResultRow key={index}>
                    <ResultCell>
                      <PersonName>{person.name}</PersonName>
                      <PersonDetail>
                        <strong>ID:</strong> {person.nationalId}
                      </PersonDetail>
                    </ResultCell>
                    <ResultCell>
                      <PersonDetail>
                        {person.dateOfBirth
                          ? new Date(person.dateOfBirth).toLocaleDateString()
                          : 'N/A'}
                      </PersonDetail>
                    </ResultCell>
                    <ResultCell>
                      <PersonDetail>
                        {person.score ? person.score.toFixed(3) : 'N/A'}
                      </PersonDetail>
                    </ResultCell>
                    <ResultCell>
                      <ActionButtons>
                        <Button
                          type="secondary"
                          size="small"
                          disabled
                          onClick={() => selectPerson(person)}
                        >
                          <Icon name="Plus" size="small" />
                          Merge Records
                        </Button>

                        <Button
                          type="primary"
                          size="small"
                          onClick={() =>
                            navigate(`/person/${person.uuid}/events`)
                          }
                        >
                          <Icon name="Eye" size="small" />
                          View Details
                        </Button>
                      </ActionButtons>
                    </ResultCell>
                  </ResultRow>
                ))}
              </tbody>
            </ResultsTable>
            {Math.ceil(totalResults / pageSize) > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  fontSize: '14px'
                }}
              >
                <div>
                  Page {currentPage} of {Math.ceil(totalResults / pageSize)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    type="tertiary"
                    size="small"
                    disabled={currentPage === 1}
                    onClick={() => {
                      const newPage = currentPage - 1
                      setCurrentPage(newPage)
                      handleSearch(newPage)
                    }}
                  >
                    Prev
                  </Button>
                  <input
                    type="number"
                    value={currentPage}
                    min={1}
                    max={Math.ceil(totalResults / pageSize)}
                    onChange={(e) => {
                      const newPage = parseInt(e.target.value)
                      if (
                        newPage >= 1 &&
                        newPage <= Math.ceil(totalResults / pageSize) &&
                        newPage !== currentPage
                      ) {
                        setCurrentPage(newPage)
                        handleSearch(newPage)
                      }
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      textAlign: 'center',
                      fontSize: '14px'
                    }}
                  />
                  <Button
                    type="tertiary"
                    size="small"
                    disabled={currentPage >= Math.ceil(totalResults / pageSize)}
                    onClick={() => {
                      const newPage = currentPage + 1
                      setCurrentPage(newPage)
                      handleSearch(newPage)
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {searchResults.length === 0 &&
          !loading &&
          (searchQuery.trim() || idNumber.trim()) && (
            <p
              style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}
            >
              No persons found matching your search criteria.
            </p>
          )}
      </Content>
    </Frame>
  )
}

export const PersonSearch = injectIntl(PersonSearchView)
