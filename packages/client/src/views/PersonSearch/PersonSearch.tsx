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

const SearchButton = styled(Button)`
  margin-top: 16px;
`

const PersonCard = styled.div`
  border: 1px solid var(--grey-300);
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 4px;
  cursor: pointer;
  &:hover {
    background-color: var(--grey-100);
  }
`

interface IPersonSearchProps extends IntlShapeProps {}

const PersonSearchView: React.FC<IPersonSearchProps> = ({ intl }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSearch = async () => {
    setLoading(true)

    if (config.USE_MOCK_PERSON_DATA) {
      // Mock data
      const mockResults = [
        {
          uuid: '50989c77-8345-4763-a12c-21f43d9e525f',
          name: 'John Doe',
          nationalId: 'ID123456',
          phone: '+1234567890'
        },
        {
          uuid: '98765-43210',
          name: 'Jane Smith',
          nationalId: 'ID654321',
          phone: '+0987654321'
        },
        {
          uuid: '11111-22222',
          name: 'Bob Johnson',
          nationalId: 'ID789012',
          phone: '+1122334455'
        }
      ].filter(
        (person) =>
          person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          person.nationalId.includes(searchQuery) ||
          person.phone.includes(searchQuery) ||
          (idNumber && person.nationalId.includes(idNumber))
      )

      setTimeout(() => {
        setSearchResults(mockResults)
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
          searchMode: 'relaxer',
          page: 1,
          pageSize: 20
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
        setSearchResults(data)
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
        size={ContentSize.SMALL}
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

        <SearchButton
          id="search"
          type="primary"
          size="large"
          fullWidth
          disabled={loading || (!searchQuery.trim() && !idNumber.trim())}
          onClick={handleSearch}
        >
          <Icon name="MagnifyingGlass" />
          {loading ? 'Searching...' : 'Search'}
        </SearchButton>

        {searchResults.map((person, index) => (
          <PersonCard key={index}>
            <h3>{person.name}</h3>
            <p>ID: {person.nationalId}</p>
            <p>Phone: {person.phone}</p>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => selectPerson(person)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Create Registration
              </button>
              <button
                onClick={() => navigate(`/person/${person.uuid}/events`)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                View Events
              </button>
            </div>
          </PersonCard>
        ))}
      </Content>
    </Frame>
  )
}

export const PersonSearch = injectIntl(PersonSearchView)
