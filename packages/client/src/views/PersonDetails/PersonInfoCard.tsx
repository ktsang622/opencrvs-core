/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import styled from 'styled-components'

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

export const PersonInfoCard: React.FC<IPersonInfoCardProps> = ({
  person,
  personDetailsExpanded,
  showFamilyTree,
  onToggleDetails,
  onToggleFamilyTree
}) => {
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
          <DetailItem>
            <DetailLabel>National ID:</DetailLabel>
            <DetailValue>{person.nationalId || 'Not assigned'}</DetailValue>
          </DetailItem>

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
                  {person.placeOfBirth || 'Not specified'}
                </DetailValue>
              </DetailItem>
            </>
          )}
        </div>
      </PersonDetailsGrid>
    </PersonInfoContainer>
  )
}
