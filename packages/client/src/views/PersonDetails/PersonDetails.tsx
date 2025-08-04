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
  background: ${({ theme }) => theme.colors.grey100};
  padding: ${({ theme }) => theme.grid.margin}px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  margin-bottom: ${({ theme }) => theme.grid.margin}px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid ${({ theme }) => theme.colors.grey300};
`

const PersonHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
`

const PersonName = styled.h2`
  margin: 0 0 8px 0;
  color: ${({ theme }) => theme.colors.copy};
  ${({ theme }) => theme.fonts.h2};
`

const PersonSubtitle = styled.div`
  color: ${({ theme }) => theme.colors.supportingCopy};
  ${({ theme }) => theme.fonts.reg14};
  margin-bottom: 20px;
`

const PersonDetailsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 16px;
`

const DetailItem = styled.div`
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.grey300};

  &:last-child {
    border-bottom: none;
  }
`

const DetailLabel = styled.span`
  ${({ theme }) => theme.fonts.bold14};
  color: ${({ theme }) => theme.colors.copy};
  margin-right: 8px;
`

const DetailValue = styled.span`
  ${({ theme }) => theme.fonts.reg14};
  color: ${({ theme }) => theme.colors.copy};
`

const MainContainer = styled.div`
  display: flex;
  gap: 20px;
  align-items: flex-start;
`

const LeftColumn = styled.div`
  flex: 1;
  min-width: 300px;
`

const RightColumn = styled.div`
  flex: 2;
  min-width: 400px;
`

const SidePanel = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 0;
  right: ${(props) => (props.isOpen ? '0' : '-400px')};
  width: 400px;
  height: 100vh;
  background: ${({ theme }) => theme.colors.white};
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
  transition: right 0.3s ease;
  z-index: 1000;
  overflow-y: auto;
  padding: 20px;
`

const PanelOverlay = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: ${(props) => (props.isOpen ? 'block' : 'none')};
  z-index: 999;
`

const EventActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 4px;
  }
`

const ParticipantsContainer = styled.div`
  margin-top: 15px;
  padding: 15px;
  background: ${({ theme }) => theme.colors.grey100};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  border-left: 4px solid ${({ theme }) => theme.colors.primary};
`

const ParticipantsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 10px;
  margin-top: 10px;
`

const ParticipantCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  padding: 10px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  border: 1px solid ${({ theme }) => theme.colors.grey300};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const EventsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
`

const EventRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.grey200};

  &:hover {
    background-color: ${({ theme }) => theme.colors.grey100};
  }

  &:last-child {
    border-bottom: none;
  }
`

const EventCell = styled.td`
  padding: 12px 16px;
  vertical-align: top;
  min-width: 120px;

  &:first-child {
    min-width: 150px;
  }

  &:last-child {
    min-width: 180px;
  }

  @media (max-width: 768px) {
    padding: 8px 12px;
    min-width: 100px;

    &:first-child {
      min-width: 120px;
    }

    &:last-child {
      min-width: 140px;
    }
  }
`

const EventHeader = styled.th`
  padding: 16px;
  background: ${({ theme }) => theme.colors.grey100};
  text-align: left;
  ${({ theme }) => theme.fonts.bold16};
  color: ${({ theme }) => theme.colors.copy};
  border-bottom: 2px solid ${({ theme }) => theme.colors.grey300};
`

const EventTitle = styled.div`
  ${({ theme }) => theme.fonts.bold14};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 4px;
`

const EventDetail = styled.div`
  ${({ theme }) => theme.fonts.reg14};
  color: ${({ theme }) => theme.colors.supportingCopy};
  margin-bottom: 2px;
`

const StatusBadge = styled.span<{ status: string }>`
  padding: 4px 8px;
  border-radius: 12px;
  ${({ theme }) => theme.fonts.reg12};
  background: ${(props) =>
    props.status === 'Registered' ? '#d4edda' : '#fff3cd'};
  color: ${(props) => (props.status === 'Registered' ? '#155724' : '#856404')};
`

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
            `${config.PERSON_SEARCH_API_URL}/person/${personId}/events`
          )
          const data = await response.json()
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
          <PersonInfoContainer>
            <PersonHeader>
              <div>
                <PersonName>{person.fullName || person.name}</PersonName>
                <PersonSubtitle>
                  Person Registry • Status: {person.status || 'Active'}
                </PersonSubtitle>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  type="tertiary"
                  size="small"
                  onClick={() =>
                    setPersonDetailsExpanded(!personDetailsExpanded)
                  }
                >
                  {personDetailsExpanded ? '▲ Less Details' : '▼ More Details'}
                </Button>
                <Button
                  type="secondary"
                  size="small"
                  onClick={() => {
                    setShowFamilyTree(!showFamilyTree)
                  }}
                >
                  <Icon name="Users" size="small" />
                  {showFamilyTree ? 'Hide Family Tree' : 'Show Family Tree'}
                </Button>
              </div>
            </PersonHeader>

            <PersonDetailsGrid>
              <div>
                <DetailItem>
                  <DetailLabel>Gender:</DetailLabel>
                  <DetailValue>{person.gender || 'Not specified'}</DetailValue>
                </DetailItem>

                <DetailItem>
                  <DetailLabel>Date of Birth:</DetailLabel>
                  <DetailValue>
                    {person.dateOfBirth
                      ? new Date(person.dateOfBirth).toLocaleDateString()
                      : 'Not available'}
                  </DetailValue>
                </DetailItem>

                {personDetailsExpanded && (
                  <>
                    <DetailItem>
                      <DetailLabel>Date of Death:</DetailLabel>
                      <DetailValue>
                        {person.dateOfDeath
                          ? new Date(person.dateOfDeath).toLocaleDateString()
                          : 'N/A'}
                      </DetailValue>
                    </DetailItem>

                    <DetailItem>
                      <DetailLabel>Marital Status:</DetailLabel>
                      <DetailValue>
                        {person.maritalStatus || 'Not specified'}
                      </DetailValue>
                    </DetailItem>
                  </>
                )}
              </div>

              <div>
                <DetailItem>
                  <DetailLabel>National ID:</DetailLabel>
                  <DetailValue>
                    {person.nationalId || 'Not assigned'}
                  </DetailValue>
                </DetailItem>
                {personDetailsExpanded && (
                  <>
                    <DetailItem>
                      <DetailLabel>Birth Reg. Number:</DetailLabel>
                      <DetailValue>
                        {person.birthRegistrationNumber || 'Not available'}
                      </DetailValue>
                    </DetailItem>
                  </>
                )}
                <DetailItem>
                  <DetailLabel>Age:</DetailLabel>
                  <DetailValue>
                    {person.dateOfBirth
                      ? Math.floor(
                          (new Date().getTime() -
                            new Date(person.dateOfBirth).getTime()) /
                            (1000 * 60 * 60 * 24 * 365.25)
                        ) + ' years'
                      : 'Unknown'}
                  </DetailValue>
                </DetailItem>

                {personDetailsExpanded && (
                  <>
                    <DetailItem>
                      <DetailLabel>Place of Birth:</DetailLabel>
                      <DetailValue>
                        {person.placeOfBirth || 'Not specified'}
                      </DetailValue>
                    </DetailItem>
                  </>
                )}
              </div>
            </PersonDetailsGrid>
          </PersonInfoContainer>
        )}

        {showFamilyTree && (
          <div
            style={{
              marginBottom: '24px',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                background: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h4 style={{ margin: 0, color: '#2c3e50' }}>Family Tree</h4>
              <Button
                type="tertiary"
                size="small"
                onClick={() => setShowFamilyTree(false)}
              >
                ✕
              </Button>
            </div>
            <iframe
              src={`${config.FAMILY_TREE_URL}/${personId}`}
              style={{
                width: '100%',
                height: '300px',
                border: 'none'
              }}
              title="Family Tree"
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement
                const resizeIframe = () => {
                  try {
                    const iframeDoc =
                      iframe.contentDocument || iframe.contentWindow?.document
                    if (iframeDoc) {
                      const body = iframeDoc.body
                      const height = body?.scrollHeight || 300
                      iframe.style.height = height + 'px'
                    }
                  } catch (error) {
                    // Cross-origin fallback - keep current height
                  }
                }

                // Initial resize
                setTimeout(resizeIframe, 100)

                // Resize on content changes
                const interval = setInterval(resizeIframe, 1000)
                setTimeout(() => clearInterval(interval), 10000) // Stop after 10s
              }}
            />
          </div>
        )}

        <h3 style={{ margin: '0 0 16px 0' }}>Events ({events.length})</h3>
        <EventsTable>
          <thead>
            <tr>
              <EventHeader>Event</EventHeader>
              <EventHeader>Date & Status</EventHeader>
              <EventHeader>Role & ID</EventHeader>
              <EventHeader>Actions</EventHeader>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <React.Fragment key={index}>
                <EventRow>
                  <EventCell>
                    <EventTitle>{event.type}</EventTitle>
                  </EventCell>
                  <EventCell>
                    <EventDetail>
                      {new Date(event.date).toLocaleDateString()}
                    </EventDetail>
                    <StatusBadge status={event.status}>
                      {event.status}
                    </StatusBadge>
                  </EventCell>
                  <EventCell>
                    <EventDetail>
                      <strong>Role:</strong> {event.role}
                    </EventDetail>
                    <EventDetail>
                      <strong>ID:</strong> {event.registrationId}
                    </EventDetail>
                  </EventCell>
                  <EventCell>
                    <EventActions>
                      <Button
                        type="primary"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(
                            `/record-audit/search/${event.declarationId}`
                          )
                        }}
                      >
                        <Icon name="Eye" size="small" />
                        Details
                      </Button>

                      <Button
                        type="secondary"
                        size="small"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (expandedEvent === event.declarationId) {
                            setExpandedEvent(null)
                            setEventParticipants(null)
                          } else {
                            try {
                              const response = await fetch(
                                `${config.PERSON_SEARCH_API_URL}/event/${event.declarationId}/participants`
                              )
                              const data = await response.json()
                              setEventParticipants(data)
                              setExpandedEvent(event.declarationId)
                            } catch (error) {
                              console.error(
                                'Failed to fetch participants:',
                                error
                              )
                            }
                          }
                        }}
                      >
                        <Icon name="Users" size="small" />
                        {expandedEvent === event.declarationId
                          ? 'Hide'
                          : 'Participants'}
                      </Button>

                      <Button
                        type="tertiary"
                        size="small"
                        disabled
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <Icon name="X" size="small" />
                        Revoke
                      </Button>
                    </EventActions>
                  </EventCell>
                </EventRow>

                {expandedEvent === event.declarationId && eventParticipants && (
                  <>
                    <EventRow style={{ backgroundColor: '#f8f9fa' }}>
                      <EventCell
                        colSpan={4}
                        style={{
                          padding: '8px 16px',
                          fontWeight: 600,
                          color: '#2196F3'
                        }}
                      >
                        Event Participants
                      </EventCell>
                    </EventRow>
                    {eventParticipants.participants?.map(
                      (participant: any, pIndex: number) => (
                        <EventRow
                          key={pIndex}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: '#fafbfc'
                          }}
                          onClick={() => {
                            setSelectedParticipant(participant)
                            setSidePanelOpen(true)
                          }}
                          title="Click to view person details"
                        >
                          <EventCell>
                            <div
                              style={{
                                paddingLeft: '20px',
                                borderLeft: '3px solid #2196F3',
                                marginLeft: '10px'
                              }}
                            >
                              <strong>{participant.person.fullName}</strong>
                              <div
                                style={{ fontSize: '12px', color: '#2196F3' }}
                              >
                                ({participant.role})
                              </div>
                            </div>
                          </EventCell>
                          <EventCell>
                            <EventDetail>
                              DOB:{' '}
                              {participant.person.dateOfBirth
                                ? new Date(
                                    participant.person.dateOfBirth
                                  ).toLocaleDateString()
                                : 'N/A'}
                            </EventDetail>
                            <EventDetail>
                              Gender: {participant.person.gender || 'N/A'}
                            </EventDetail>
                          </EventCell>
                          <EventCell>
                            <EventDetail>
                              ID: {participant.person.nationalId}
                            </EventDetail>
                            <EventDetail>
                              Status: {participant.person.status}
                            </EventDetail>
                          </EventCell>
                          <EventCell>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#2196F3',
                                fontSize: '13px',
                                fontWeight: '500',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: '#e3f2fd',
                                border: '1px solid #bbdefb',
                                width: 'fit-content'
                              }}
                            >
                              <span>→</span>
                              <span>View Details</span>
                            </div>
                          </EventCell>
                        </EventRow>
                      )
                    )}
                  </>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </EventsTable>

        {events.length === 0 && (
          <p style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
            No events found for this person.
          </p>
        )}
      </Content>

      <PanelOverlay
        isOpen={sidePanelOpen}
        onClick={() => setSidePanelOpen(false)}
      />

      <SidePanel isOpen={sidePanelOpen}>
        {selectedParticipant && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}
            >
              <h3 style={{ margin: 0 }}>Personal Details</h3>
              <Button
                type="tertiary"
                size="small"
                onClick={() => setSidePanelOpen(false)}
              >
                ✕
              </Button>
            </div>

            <div
              style={{
                marginBottom: '24px',
                padding: '24px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e1e5e9',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <h4
                style={{
                  margin: '0 0 20px 0',
                  color: '#1a1a1a',
                  fontSize: '18px',
                  fontWeight: '600',
                  letterSpacing: '-0.01em'
                }}
              >
                {selectedParticipant.person.fullName}
              </h4>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}
                  >
                    Role
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {selectedParticipant.role}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}
                  >
                    National ID
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {selectedParticipant.person.nationalId}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}
                  >
                    Date of Birth
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {selectedParticipant.person.dateOfBirth
                      ? new Date(
                          selectedParticipant.person.dateOfBirth
                        ).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}
                  >
                    Gender
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {selectedParticipant.person.gender || 'N/A'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}
                  >
                    Status
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {selectedParticipant.person.status || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  navigate(`/person/${selectedParticipant.person.id}/events`)
                  setSidePanelOpen(false)
                }}
              >
                View Full Events
              </Button>

              <Button
                type="secondary"
                size="small"
                onClick={() => {
                  window.open(
                    `${config.FAMILY_TREE_URL}/${selectedParticipant.person.id}?fulldetails=true`,
                    '_blank'
                  )
                }}
              >
                Family Tree
              </Button>
            </div>
          </div>
        )}
      </SidePanel>
    </Frame>
  )
}

export const PersonDetails = injectIntl(PersonDetailsView)
