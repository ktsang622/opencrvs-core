import React from 'react'
import styled from 'styled-components'
import type { PersonDetails } from '@/types/familyTree'

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background-color: white;
  border-left: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
  z-index: 1001;
`

const Header = styled.div`
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
  background-color: #f8f9fa;
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const Title = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #212529;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  color: #6c757d;
  border-radius: 4px;
  
  &:hover {
    background-color: #e9ecef;
  }
`

const Content = styled.div`
  flex: 1;
  overflow: auto;
  padding: 20px;
`

const PersonInfo = styled.div`
  margin-bottom: 20px;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
`

const PersonName = styled.h4`
  margin: 0 0 15px 0;
  color: #1a1a1a;
  font-size: 18px;
`

const InfoGrid = styled.div`
  display: grid;
  gap: 8px;
`

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
`

const InfoLabel = styled.span`
  font-size: 14px;
  color: #6b7280;
`

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 600;
`

const EventsSection = styled.div`
  h4 {
    margin-bottom: 15px;
  }
`

const EventItem = styled.div`
  background-color: white;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
`

const EventType = styled.div`
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
`

const EventDetails = styled.div`
  font-size: 14px;
  color: #666;
  
  p {
    margin: 4px 0;
  }
  
  .relationship-ended {
    color: #dc3545;
  }
`

interface Props {
  personDetails: PersonDetails
  onClose: () => void
}

export const PersonDetailsPanel: React.FC<Props> = ({ personDetails, onClose }) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? '—' : date.toISOString().split('T')[0]
  }

  return (
    <Panel>
      <Header>
        <Title>Person Details</Title>
        <CloseButton onClick={onClose}>×</CloseButton>
      </Header>
      
      <Content>
        <PersonInfo>
          <PersonName>{personDetails.person.fullName}</PersonName>
          <InfoGrid>
            <InfoRow>
              <InfoLabel>{personDetails.person.nationalIdType || 'National ID'}</InfoLabel>
              <InfoValue>{personDetails.person.nationalId || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Date of Birth</InfoLabel>
              <InfoValue>{formatDate(personDetails.person.dateOfBirth) || 'N/A'}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Gender</InfoLabel>
              <InfoValue>{personDetails.person.gender || 'N/A'}</InfoValue>
            </InfoRow>
          </InfoGrid>
        </PersonInfo>

        <EventsSection>
          <h4>Events ({personDetails.events.length})</h4>
          
          {personDetails.events.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No events found for this person.</p>
          ) : (
            personDetails.events.map((event, index) => (
              <EventItem key={index}>
                <EventType>{event.type}</EventType>
                <EventDetails>
                  <p><strong>Date:</strong> {formatDate(event.date)}</p>
                  <p><strong>Role:</strong> {event.role}</p>
                  <p><strong>Location:</strong> {personDetails.locationNames[event.location] || event.location}</p>
                  
                  {event.relationshipEndDate && (
                    <p className="relationship-ended">
                      <strong>Relationship Ended:</strong> {formatDate(event.relationshipEndDate)}
                      {event.relationshipNotes && ` - ${event.relationshipNotes}`}
                    </p>
                  )}
                  {event.registrationId !== 'N/A' && (
                    <p><strong>Registration ID:</strong> {event.registrationId}</p>
                  )}
                </EventDetails>
              </EventItem>
            ))
          )}
        </EventsSection>
      </Content>
    </Panel>
  )
}