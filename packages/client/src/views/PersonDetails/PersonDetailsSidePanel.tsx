/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { config } from '@client/config'

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

interface IPersonDetailsSidePanelProps {
  isOpen: boolean
  selectedParticipant: any
  onClose: () => void
}

export const PersonDetailsSidePanel: React.FC<IPersonDetailsSidePanelProps> = ({
  isOpen,
  selectedParticipant,
  onClose
}) => {
  const navigate = useNavigate()

  return (
    <>
      <PanelOverlay isOpen={isOpen} onClick={onClose} />

      <SidePanel isOpen={isOpen}>
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
              <Button type="tertiary" size="small" onClick={onClose}>
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
                    {(() => {
                      // Parse identifiers if it's a JSON string
                      const identifiers =
                        typeof selectedParticipant.person.identifiers ===
                        'string'
                          ? JSON.parse(selectedParticipant.person.identifiers)
                          : selectedParticipant.person.identifiers || []

                      // Find National ID
                      const nationalId = identifiers.find(
                        (id: any) => id.type === 'NATIONAL_ID'
                      )?.value

                      if (nationalId) return 'National ID'

                      // If no National ID, use first available identifier type
                      const firstId = identifiers.find(
                        (id: any) => id.value?.trim() && id.type !== 'crvs'
                      )
                      if (firstId?.type === 'PASSPORT') return 'Passport Number'
                      if (firstId?.type) return firstId.type
                      return 'ID'
                    })()}
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '600'
                    }}
                  >
                    {(() => {
                      // Parse identifiers if it's a JSON string
                      const identifiers =
                        typeof selectedParticipant.person.identifiers ===
                        'string'
                          ? JSON.parse(selectedParticipant.person.identifiers)
                          : selectedParticipant.person.identifiers || []

                      // Find National ID
                      const nationalId = identifiers.find(
                        (id: any) => id.type === 'NATIONAL_ID'
                      )?.value

                      if (nationalId) return nationalId

                      // If no National ID, show first available identifier value
                      const firstId = identifiers.find(
                        (id: any) => id.value?.trim() && id.type !== 'crvs'
                      )
                      return (
                        firstId?.value ||
                        selectedParticipant.person.nationalId ||
                        'Not assigned'
                      )
                    })()}
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
                  onClose()
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
    </>
  )
}
