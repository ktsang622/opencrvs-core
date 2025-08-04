/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

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
`

interface ISearchResultsProps {
  searchResults: any[]
  currentPage: number
  pageSize: number
  totalResults: number
  onPageChange: (page: number) => void
  onPersonSelect: (person: any) => void
}

export const SearchResults: React.FC<ISearchResultsProps> = ({
  searchResults,
  currentPage,
  pageSize,
  totalResults,
  onPageChange,
  onPersonSelect
}) => {
  const navigate = useNavigate()

  if (searchResults.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
        No persons found matching your search criteria.
      </p>
    )
  }

  return (
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
                    onClick={() => onPersonSelect(person)}
                  >
                    <Icon name="Plus" size="small" />
                    Merge Records
                  </Button>

                  <Button
                    type="primary"
                    size="small"
                    onClick={() => navigate(`/person/${person.uuid}/events`)}
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
              onClick={() => onPageChange(currentPage - 1)}
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
                  onPageChange(newPage)
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
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
