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
import { PersonInfoCard } from './PersonInfoCard'
import { EventsTableComponent } from './EventsTable'
import { FamilyTreePanel } from './FamilyTreePanel'
import { PersonDetailsSidePanel } from './PersonDetailsSidePanel'

interface IPersonDetailsProps extends IntlShapeProps {}

const PersonDetailsView: React.FC<IPersonDetailsProps> = ({ intl }) => {
  const { personId } = useParams()
  const navigate = useNavigate()
  const [person, setPerson] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [eventParticipants, setEventParticipants] = useState<any>(null)
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [personDetailsExpanded, setPersonDetailsExpanded] = useState(false)

  const [showFamilyTree, setShowFamilyTree] = useState(false)

  useEffect(() => {
    // Reset expanded state when person changes
    setExpandedEvent(null)
    setEventParticipants(null)
    setSidePanelOpen(false)
    setSelectedParticipant(null)
    setPersonDetailsExpanded(false)

    setShowFamilyTree(false)

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
                : '1985-08-22',
            place_of_birth_uuid:
              personId === '50989c77-8345-4763-a12c-21f43d9e525f'
                ? '9d5dbe30-8a6a-4454-b620-c6c2c55646b0'
                : null
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
          setEvents(
            mockData.events.sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            )
          )
          setLoading(false)
        }, 500)
      } else {
        // Real API call
        try {
          const response = await fetch(
            `${config.TOPPAN_SERVICE_URL}/person/${personId}/events`
          )
          const data = await response.json()
          console.log('Full API response:', data)
          console.log('Person data:', data.person)
          console.log('place_of_birth_uuid:', data.person?.place_of_birth_uuid)
          setPerson(data.person)
          setEvents(
            (data.events || []).sort(
              (a: any, b: any) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            )
          )
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
        <Header
          title={`Personal Details - ${person?.fullName || person?.name || 'Unknown'}`}
        />
      }
      skipToContentText={intl.formatMessage(
        constantsMessages.skipToMainContent
      )}
      navigation={<Navigation />}
    >
      <Content title="Personal Details" size={ContentSize.LARGE}>
        {person && (
          <PersonInfoCard
            person={person}
            personDetailsExpanded={personDetailsExpanded}
            showFamilyTree={showFamilyTree}
            onToggleDetails={() =>
              setPersonDetailsExpanded(!personDetailsExpanded)
            }
            onToggleFamilyTree={() => setShowFamilyTree(!showFamilyTree)}
          />
        )}

        {showFamilyTree && (
          <FamilyTreePanel
            personId={personId!}
            onClose={() => setShowFamilyTree(false)}
          />
        )}

        <EventsTableComponent
          events={events}
          expandedEvent={expandedEvent}
          eventParticipants={eventParticipants}
          onExpandEvent={async (eventId) => {
            if (expandedEvent === eventId) {
              setExpandedEvent(null)
              setEventParticipants(null)
            } else {
              try {
                const response = await fetch(
                  `${config.TOPPAN_SERVICE_URL}/event/${eventId}/participants`
                )
                const data = await response.json()
                setEventParticipants(data)
                setExpandedEvent(eventId)
              } catch (error) {
                console.error('Failed to fetch participants:', error)
              }
            }
          }}
          onParticipantClick={(participant) => {
            setSelectedParticipant(participant)
            setSidePanelOpen(true)
          }}
        />
      </Content>

      <PersonDetailsSidePanel
        isOpen={sidePanelOpen}
        selectedParticipant={selectedParticipant}
        onClose={() => setSidePanelOpen(false)}
      />
    </Frame>
  )
}

export const PersonDetails = injectIntl(PersonDetailsView)
