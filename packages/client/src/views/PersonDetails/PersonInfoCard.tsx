/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { useState, useEffect } from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import styled from 'styled-components'
import { useSelector } from 'react-redux'
import { getLocations } from '@client/offline/selectors'

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

interface IPersonInfoCardProps {
  person: any
  personDetailsExpanded: boolean
  showFamilyTree: boolean
  onToggleDetails: () => void
  onToggleFamilyTree: () => void
}

// Utility function to get location name from offline data
const getLocationNameFromOfflineData = (
  locations: any,
  uuid: string
): string => {
  const location = locations[uuid]
  return location?.name || 'Unknown Location'
}

export const PersonInfoCard: React.FC<IPersonInfoCardProps> = ({
  person,
  personDetailsExpanded,
  showFamilyTree,
  onToggleDetails,
  onToggleFamilyTree
}) => {
  const locations = useSelector(getLocations)
  const [placeOfBirthName, setPlaceOfBirthName] = useState<string>('')

  // Get place of birth name from offline data
  useEffect(() => {
    if (person.place_of_birth_uuid) {
      const locationName = getLocationNameFromOfflineData(
        locations,
        person.place_of_birth_uuid
      )
      setPlaceOfBirthName(locationName)
    } else {
      setPlaceOfBirthName('')
    }
  }, [person.place_of_birth_uuid, locations])
  return (
    <PersonInfoContainer>
      <PersonHeader>
        <div>
          <PersonName>{person.fullName || person.name}</PersonName>
          <PersonSubtitle>
            Person Registry • Status: {person.status || 'Active'}
          </PersonSubtitle>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button type="tertiary" size="small" onClick={onToggleDetails}>
            {personDetailsExpanded ? '▲ Less Details' : '▼ More Details'}
          </Button>
          <Button type="secondary" size="small" onClick={onToggleFamilyTree}>
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

          {personDetailsExpanded && person.dateOfDeath && (
            <DetailItem>
              <DetailLabel>Date of Death:</DetailLabel>
              <DetailValue>
                {new Date(person.dateOfDeath).toLocaleDateString()}
              </DetailValue>
            </DetailItem>
          )}
        </div>

        <div>
{(() => {
            // Parse identifiers if it's a JSON string
            const identifiers =
              typeof person.identifiers === 'string'
                ? JSON.parse(person.identifiers)
                : person.identifiers || []

            // Find National ID
            const nationalId = identifiers.find(
              (id: any) => id.type === 'NATIONAL_ID'
            )?.value

            // Find first non-migration identifier
            const firstId = identifiers.find(
              (id: any) => id.value?.trim() && id.type !== 'crvs' && id.type !== 'NONE'
            )

            // Only show this field if there are regular (non-migration) identifiers
            if (nationalId || firstId?.value) {
              return (
                <DetailItem>
                  <DetailLabel>
                    {nationalId ? 'National ID:' :
                     firstId?.type === 'PASSPORT' ? 'Passport Number:' :
                     firstId?.type ? `${firstId.type}:` : 'ID:'}
                  </DetailLabel>
                  <DetailValue>
                    {nationalId || firstId?.value || 'Not assigned'}
                  </DetailValue>
                </DetailItem>
              )
            }
            return null
          })()}

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
                <DetailLabel>Birth Reg. Number:</DetailLabel>
                <DetailValue>
                  {person.birthRegistrationNumber || 'Not available'}
                </DetailValue>
              </DetailItem>

              <DetailItem>
                <DetailLabel>Place of Birth:</DetailLabel>
                <DetailValue>
                  {person.place_of_birth_uuid &&
                  placeOfBirthName &&
                  placeOfBirthName !== 'Unknown Location'
                    ? placeOfBirthName
                    : person.placeOfBirth || 'Not specified'}
                </DetailValue>
              </DetailItem>

              {(() => {
                // Parse identifiers for migration/remark data
                const identifiers =
                  typeof person.identifiers === 'string'
                    ? JSON.parse(person.identifiers)
                    : person.identifiers || []

                // Find NONE type identifiers (migration data)
                const noneId = identifiers.find(
                  (id: any) => id.type === 'NONE' && id.value?.trim()
                )

                if (noneId?.value) {
                  return (
                    <DetailItem>
                      <DetailLabel>Remark:</DetailLabel>
                      <DetailValue>{noneId.value}</DetailValue>
                    </DetailItem>
                  )
                }
                return null
              })()}
            </>
          )}
        </div>
      </PersonDetailsGrid>
    </PersonInfoContainer>
  )
}
