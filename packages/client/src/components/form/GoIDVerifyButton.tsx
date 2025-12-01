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

import React, { useState } from 'react'
import styled from 'styled-components'
import { injectIntl, WrappedComponentProps as IntlShapeProps } from 'react-intl'
import { PrimaryButton, TertiaryButton } from '@opencrvs/components/lib/buttons'
import { InputField } from '@opencrvs/components/lib/InputField'
import { TextInput } from '@opencrvs/components/lib/TextInput'
import { Spinner } from '@opencrvs/components/lib/Spinner'
import { buttonMessages } from '@client/i18n/messages'
import { useOnlineStatus } from '@client/utils'
import { useFormikContext } from 'formik'
import { config } from '@client/config'

interface IGoIDVerifyButtonProps {
  id: string
  label: string
  className?: string
  modalTitle: string
  successTitle?: string
  errorTitle?: string
  isDisabled?: boolean
}

type IFullProps = IGoIDVerifyButtonProps & IntlShapeProps

const Container = styled.div`
  display: flex;
`

const StyledPrimaryButton = styled(PrimaryButton)`
  display: block;
  ${({ theme }) => {
    return `@media (min-width: ${theme.grid.breakpoints.md}px) {
      width: 515px;
    }`
  }}
`

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
`

const ModalContainer = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  height: 100vh;
  background-color: white;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;

  @media (min-width: 1024px) {
    width: 40%;
    left: auto;
  }
`

const ModalHeader = styled.div`
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const ModalContent = styled.div`
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const FormGroup = styled.div`
  margin-bottom: 16px;
`

const SuccessMessage = styled.div`
  color: ${({ theme }) => theme.colors.positive};
  background-color: ${({ theme }) => theme.colors.positiveLighter};
  padding: 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  ${({ theme }) => theme.fonts.bold16};
`

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.negative};
  background-color: ${({ theme }) => theme.colors.negativeLighter || '#fee'};
  padding: 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  ${({ theme }) => theme.fonts.reg14};
`

const PersonDataCard = styled.div`
  background-color: ${({ theme }) => theme.colors.grey100};
  padding: 16px;
  border-radius: 4px;
  margin-top: 16px;
`

const PersonDataRow = styled.div`
  display: flex;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`

const PersonDataLabel = styled.span`
  ${({ theme }) => theme.fonts.bold14};
  width: 120px;
  color: ${({ theme }) => theme.colors.grey600};
`

const PersonDataValue = styled.span`
  ${({ theme }) => theme.fonts.reg14};
  flex: 1;
`

interface GoIDVerifyResponse {
  success: boolean
  data?: {
    firstNames: string
    familyName: string
    gender: string
    birthDate: string
    nationality: string
    idType: string
    idNumber: string
  }
  error?: string
}

const GoIDVerifyButton = (props: IFullProps) => {
  // Check if goID feature is enabled via client config
  const isGoIDEnabled = window.config?.FEATURES?.GOID_ENABLED === true

  const { intl, label, modalTitle, successTitle, errorTitle, isDisabled } =
    props
  const [showModal, setShowModal] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] =
    useState<GoIDVerifyResponse | null>(null)
  const isOnline = useOnlineStatus()

  const formik = useFormikContext<any>()

  const handleVerify = async () => {
    if (!username || !password) {
      setVerificationResult({
        success: false,
        error: 'Please enter both username and password'
      })
      return
    }

    setIsVerifying(true)
    setVerificationResult(null)

    try {
      const response = await fetch(`${config.API_GATEWAY_URL}api/goid/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data: GoIDVerifyResponse = await response.json()
      setVerificationResult(data)

      // Don't apply data yet - just show preview
      // User must click "Confirm & Apply" to apply to form
      if (data.success && data.data) {
        console.log('🎯 goID verification successful, awaiting user confirmation:', data.data)
      }
    } catch (error: any) {
      console.error('[goID] Verification error:', error)
      setVerificationResult({
        success: false,
        error: 'Unable to connect to goID service. Please try again.'
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setUsername('')
    setPassword('')
    setVerificationResult(null)
  }

  const handleApplyAndClose = () => {
    // Apply verified data to form fields
    if (verificationResult?.success && verificationResult.data && formik) {
      const data = verificationResult.data

      // Auto-detect which section (mother/father) this button is used in
      let sectionPrefix = 'mother'
      if (props.id.includes('father')) {
        sectionPrefix = 'father'
      }

      console.log('✅ Applying goID data to form:', sectionPrefix, data)

      // Populate form fields with verified data
      if (data.firstNames) {
        formik.setFieldValue('firstNamesEng', data.firstNames)
      }
      if (data.familyName) {
        formik.setFieldValue('familyNameEng', data.familyName)
      }
      if (data.gender) {
        formik.setFieldValue('gender', data.gender.toLowerCase())
      }
      if (data.birthDate) {
        formik.setFieldValue(`${sectionPrefix}BirthDate`, data.birthDate)
        // Clear "Exact date of birth unknown" checkbox
        formik.setFieldValue(`${sectionPrefix}.dobUnknown`, false)
      }
      if (data.nationality) {
        formik.setFieldValue('nationality', data.nationality)
      }
      if (data.idNumber && data.idType) {
        formik.setFieldValue(`${sectionPrefix}IdType`, data.idType)
        // Set the ID number field based on type
        if (data.idType === 'NATIONAL_ID') {
          formik.setFieldValue(`${sectionPrefix}NationalId`, data.idNumber)
        } else if (data.idType === 'PASSPORT') {
          formik.setFieldValue(`${sectionPrefix}Passport`, data.idNumber)
        } else if (data.idType === 'BIRTH_REGISTRATION_NUMBER') {
          formik.setFieldValue(`${sectionPrefix}BirthRegistrationNumber`, data.idNumber)
        }
      }

      // Mark that person details exist
      formik.setFieldValue('detailsExist', true)

      // Set searchPersonId to trigger conditionals that:
      // - Hide the "Verify with goID" and "Search for Person" buttons
      // - Disable the name/DOB fields (make them read-only)
      // - Show the "Unlink" button
      formik.setFieldValue('searchPersonId', `goid:${data.idNumber || 'verified'}`)

      // Trigger validation
      setTimeout(() => {
        formik.validateForm()
      }, 100)
    }

    handleCloseModal()
  }

  // Don't render if goID feature is disabled
  if (!isGoIDEnabled) {
    return null
  }

  return (
    <Container className={props.className}>
      <StyledPrimaryButton
        type="button"
        disabled={isDisabled || !isOnline}
        onClick={() => setShowModal(true)}
      >
        {label}
      </StyledPrimaryButton>

      {showModal && (
        <>
          <ModalOverlay onClick={handleCloseModal} />
          <ModalContainer>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>{modalTitle}</h3>
              <TertiaryButton
                id="goid-verify-cancel"
                onClick={handleCloseModal}
              >
                ✕
              </TertiaryButton>
            </ModalHeader>
            <ModalContent>
              <p style={{ marginBottom: '24px', color: '#666' }}>
                Enter your goID credentials to verify your identity
              </p>

              <FormGroup>
                <InputField
                  id="goid-username-field"
                  touched={true}
                  required={true}
                  optionalLabel=""
                  label="goID Username"
                >
                  <TextInput
                    id="goid-username"
                    value={username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setUsername(e.target.value)
                    }
                    placeholder="Enter your goID username"
                    disabled={isVerifying}
                  />
                </InputField>
              </FormGroup>

              <FormGroup>
                <InputField
                  id="goid-password-field"
                  touched={true}
                  required={true}
                  optionalLabel=""
                  label="goID Password"
                >
                  <TextInput
                    id="goid-password"
                    type="password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter your goID password"
                    disabled={isVerifying}
                  />
                </InputField>
              </FormGroup>

              <PrimaryButton
                id="goid-verify-submit"
                type="button"
                onClick={handleVerify}
                disabled={isVerifying || !username || !password}
              >
                {isVerifying ? (
                  <>
                    <Spinner id="goid-verify-spinner" size={20} />
                    <span style={{ marginLeft: '8px' }}>Verifying...</span>
                  </>
                ) : (
                  'Verify Identity'
                )}
              </PrimaryButton>

              {verificationResult && (
                <>
                  {verificationResult.success ? (
                    <>
                      <SuccessMessage style={{ marginTop: '16px' }}>
                        {successTitle || 'Identity verified successfully!'}
                      </SuccessMessage>
                      {verificationResult.data && (
                        <PersonDataCard>
                          <PersonDataRow>
                            <PersonDataLabel>Name:</PersonDataLabel>
                            <PersonDataValue>
                              {verificationResult.data.firstNames}{' '}
                              {verificationResult.data.familyName}
                            </PersonDataValue>
                          </PersonDataRow>
                          <PersonDataRow>
                            <PersonDataLabel>Gender:</PersonDataLabel>
                            <PersonDataValue>
                              {verificationResult.data.gender}
                            </PersonDataValue>
                          </PersonDataRow>
                          <PersonDataRow>
                            <PersonDataLabel>Birth Date:</PersonDataLabel>
                            <PersonDataValue>
                              {verificationResult.data.birthDate}
                            </PersonDataValue>
                          </PersonDataRow>
                          <PersonDataRow>
                            <PersonDataLabel>Nationality:</PersonDataLabel>
                            <PersonDataValue>
                              {verificationResult.data.nationality}
                            </PersonDataValue>
                          </PersonDataRow>
                          <PersonDataRow>
                            <PersonDataLabel>
                              {verificationResult.data.idType === 'NATIONAL_ID'
                                ? 'National ID:'
                                : verificationResult.data.idType === 'PASSPORT'
                                ? 'Passport:'
                                : verificationResult.data.idType === 'BIRTH_REGISTRATION_NUMBER'
                                ? 'Birth Reg No:'
                                : 'ID Number:'}
                            </PersonDataLabel>
                            <PersonDataValue>
                              {verificationResult.data.idNumber}
                            </PersonDataValue>
                          </PersonDataRow>
                        </PersonDataCard>
                      )}
                      <div style={{ marginTop: '24px' }}>
                        <PrimaryButton
                          id="goid-apply-close"
                          type="button"
                          onClick={handleApplyAndClose}
                        >
                          Confirm & Apply
                        </PrimaryButton>
                      </div>
                    </>
                  ) : (
                    <ErrorMessage style={{ marginTop: '16px' }}>
                      {errorTitle || 'Verification failed'}:{' '}
                      {verificationResult.error}
                    </ErrorMessage>
                  )}
                </>
              )}
            </ModalContent>
          </ModalContainer>
        </>
      )}
    </Container>
  )
}

export const GoIDVerifyButtonField = injectIntl<'intl', IFullProps>(
  GoIDVerifyButton
)
