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
import { useState, useEffect } from 'react'
import { Frame } from '@opencrvs/components/lib/Frame'
import { Header } from '@client/components/Header/Header'
import { Navigation } from '@client/components/interface/Navigation'
import { Content, ContentSize } from '@opencrvs/components/lib/Content'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import { injectIntl, WrappedComponentProps as IntlShapeProps } from 'react-intl'
import { constantsMessages } from '@client/i18n/messages'
import { useParams, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import * as routes from '@client/navigation/routes'
import { config } from '@client/config'

const PersonInfoContainer = styled.div`
  background: var(--grey-100);
  padding: 20px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`

const PersonInfoDetails = styled.div`
  flex: 1;
`

const EventCard = styled.div`
  border: 1px solid var(--grey-300);
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 4px;
  background: var(--grey-0);
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--grey-100);
    border-color: var(--blue-dark);
  }
`

interface IPersonDetailsProps extends IntlShapeProps {}

const PersonDetailsView: React.FC<IPersonDetailsProps> = ({ intl }) => {
  const { personId } = useParams()
  const navigate = useNavigate()
  const [person, setPerson] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPersonEvents = async () => {
      if (config.USE_MOCK_PERSON_DATA) {
        // Mock data
        const mockData = {
          person: {
            name:
              personId === '50989c77-8345-4763-a12c-21f43d9e525f'
                ? 'John Doe'
                : 'Jane Smith',
            nationalId:
              personId === '50989c77-8345-4763-a12c-21f43d9e525f'
                ? '50989c77-8345-4763-a12c-21f43d9e525f'
                : 'ID654321',
            phone:
              personId === '50989c77-8345-4763-a12c-21f43d9e525f'
                ? '+1234567890'
                : '+0987654321',
            dateOfBirth:
              personId === '50989c77-8345-4763-a12c-21f43d9e525f'
                ? '1990-05-15'
                : '1985-08-22'
          },
          events: [
            {
              type: 'Birth Registration',
              date: '2023-01-15',
              status: 'Registered',
              role: 'Child',
              registrationId: 'B5B2P0Q',
              declarationId: '142c7feb-b2e2-49bf-8245-1520ea8af26c',
              eventType: 'birth'
            },
            {
              type: 'Marriage Registration',
              date: '2023-06-10',
              status: 'Registered',
              role: personId === '12345-67890' ? 'Groom' : 'Bride',
              registrationId: 'MR-2023-045',
              declarationId: 'c9b9d8d1-g6f5-5d9b-ac2b-3e4f5g6h7i8j',
              eventType: 'marriage'
            },
            {
              type: 'Death Registration',
              date: '2023-07-01',
              status: 'Registered',
              role: 'Informant',
              registrationId: 'DR-2023-089',
              declarationId: 'd0c0e9e2-h7g6-6e0c-bd3c-4f5g6h7i8j9k',
              eventType: 'death'
            }
          ]
        }

        setTimeout(() => {
          setPerson(mockData.person)
          setEvents(mockData.events)
          setLoading(false)
        }, 500)
      } else {
        // Real API call
        try {
          const response = await fetch(
            `${config.PERSON_SEARCH_API_URL}/person/${personId}/events`
          )
          const data = await response.json()
          setPerson(data.person)
          setEvents(data.events || [])
        } catch (error) {
          console.error('Person details API error:', error)
          setPerson(null)
          setEvents([])
        } finally {
          setLoading(false)
        }
      }
    }

    if (personId) {
      fetchPersonEvents()
    }
  }, [personId])

  if (loading)
    return (
      <Frame
        header={<Header title="Loading..." />}
        skipToContentText={intl.formatMessage(
          constantsMessages.skipToMainContent
        )}
        navigation={<Navigation />}
      >
        <Content title="Loading" size={ContentSize.SMALL}>
          <div>Loading person details...</div>
        </Content>
      </Frame>
    )

  if (!personId)
    return (
      <Frame
        header={<Header title="Error" />}
        skipToContentText={intl.formatMessage(
          constantsMessages.skipToMainContent
        )}
        navigation={<Navigation />}
      >
        <Content title="Error" size={ContentSize.SMALL}>
          <div>Person ID not found</div>
        </Content>
      </Frame>
    )

  return (
    <Frame
      header={
        <Header title={`Person Details - ${person?.name || 'Unknown'}`} />
      }
      skipToContentText={intl.formatMessage(
        constantsMessages.skipToMainContent
      )}
      navigation={<Navigation />}
    >
      <Content title="Person Events" size={ContentSize.SMALL}>
        {person && (
          <PersonInfoContainer>
            <PersonInfoDetails>
              <h2>{person.fullName || person.name}</h2>
              <p>
                <strong>National ID:</strong> {person.nationalId}
              </p>
              <p>
                <strong>Date of Birth:</strong>{' '}
                {person.dateOfBirth
                  ? new Date(person.dateOfBirth).toLocaleDateString()
                  : 'N/A'}
              </p>
              <p>
                <strong>Gender:</strong> {person.gender || 'N/A'}
              </p>
              <p>
                <strong>Status:</strong> {person.status || 'N/A'}
              </p>
            </PersonInfoDetails>
            <Button
              type="secondary"
              size="small"
              onClick={() => {
                window.open(`${config.FAMILY_TREE_URL}/${personId}`, '_blank')
              }}
            >
              <Icon name="Users" size="small" />
              Family Tree
            </Button>
          </PersonInfoContainer>
        )}

        <h3>Events ({events.length})</h3>
        {events.map((event, index) => (
          <EventCard
            key={index}
            onClick={() => {
              // Navigate to OpenCRVS record audit page
              navigate(`/record-audit/search/${event.declarationId}`)
            }}
            title="Click to view full record details"
          >
            <h4 style={{ color: '#2196F3', margin: '0 0 10px 0' }}>
              {event.type}
            </h4>
            <p>
              <strong>Date:</strong> {event.date}
            </p>
            <p>
              <strong>Status:</strong>{' '}
              <span
                style={{
                  color: event.status === 'Registered' ? 'green' : 'orange'
                }}
              >
                {event.status}
              </span>
            </p>
            <p>
              <strong>Role:</strong> {event.role}
            </p>
            <p>
              <strong>Registration ID:</strong> {event.registrationId}
            </p>
            <p
              style={{ color: '#666', fontSize: '12px', margin: '10px 0 0 0' }}
            >
              💡 Click to view full record
            </p>
          </EventCard>
        ))}

        {events.length === 0 && (
          <p style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
            No events found for this person.
          </p>
        )}
      </Content>
    </Frame>
  )
}

export const PersonDetails = injectIntl(PersonDetailsView)
