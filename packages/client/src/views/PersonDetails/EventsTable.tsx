import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { config } from '@client/config'

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

const EventActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

interface IEventsTableProps {
  events: any[]
  expandedEvent: string | null
  eventParticipants: any
  onExpandEvent: (eventId: string) => void
  onParticipantClick: (participant: any) => void
}

export const EventsTableComponent: React.FC<IEventsTableProps> = ({
  events,
  expandedEvent,
  eventParticipants,
  onExpandEvent,
  onParticipantClick
}) => {
  const navigate = useNavigate()

  return (
    <>
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
                        navigate(`/record-audit/search/${event.declarationId}`)
                      }}
                    >
                      <Icon name="Eye" size="small" />
                      Details
                    </Button>

                    <Button
                      type="secondary"
                      size="small"
                      onClick={() => onExpandEvent(event.declarationId)}
                    >
                      <Icon name="Users" size="small" />
                      {expandedEvent === event.declarationId
                        ? 'Hide'
                        : 'Participants'}
                    </Button>

                    <Button type="tertiary" size="small" disabled>
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
                        onClick={() => onParticipantClick(participant)}
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
                            <div style={{ fontSize: '12px', color: '#2196F3' }}>
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
    </>
  )
}
