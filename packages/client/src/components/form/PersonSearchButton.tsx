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
import React, { useState, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import { injectIntl, WrappedComponentProps as IntlShapeProps } from 'react-intl'
import { PrimaryButton, TertiaryButton } from '@opencrvs/components/lib/buttons'
import { ResponsiveModal } from '@opencrvs/components/lib/ResponsiveModal'
import { InputField } from '@opencrvs/components/lib/InputField'
import { TextInput } from '@opencrvs/components/lib/TextInput'
import { Select } from '@opencrvs/components/lib/Select'
import { Spinner } from '@opencrvs/components/lib/Spinner'
import { buttonMessages } from '@client/i18n/messages'
import { useOnlineStatus } from '@client/utils'
import { config } from '@client/config'
import { useFormikContext } from 'formik'
import { useSelector } from 'react-redux'
import { getScope } from '@client/profile/profileSelectors'
import { usePersonSearch } from '@client/hooks/usePersonSearch'

interface IExtLookupButtonProps {
  id: string
  label: string
  className?: string
  modalTitle: string
  onPersonSelect?: (person: any) => void
  isDisabled?: boolean
  setFieldValue?: (name: string, value: any) => void
}

type IFullProps = IExtLookupButtonProps & IntlShapeProps

const Container = styled.div`
  display: flex;
`

const SearchContainer = styled.div`
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const SearchResults = styled.div`
  flex: 1;
  overflow-y: auto;
  margin-top: 16px;
`

const PersonItem = styled.div`
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.grey300};
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.grey100};
  }
`

const PersonName = styled.div`
  ${({ theme }) => theme.fonts.bold16};
  margin-bottom: 4px;
`

const PersonDetails = styled.div`
  color: ${({ theme }) => theme.colors.grey600};
  ${({ theme }) => theme.fonts.reg14};
`

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.negative};
  margin-top: 12px;
  ${({ theme }) => theme.fonts.reg14};
`

const StyledPrimaryButton = styled(PrimaryButton)`
  display: block;
  ${({ theme }) => {
    return `@media (min-width: ${theme.grid.breakpoints.md}px) {
      width: 515px;
    }`
  }}
`

const ExtLookupButton = (
  props: IFullProps & { setFieldValue?: (name: string, value: any) => void }
) => {
  const { intl, label, modalTitle, isDisabled, onPersonSelect, setFieldValue } =
    props
  const [showModal, setShowModal] = useState(false)
  const isOnline = useOnlineStatus()
  const {
    searchTerm,
    setSearchTerm,
    selectedGender,
    setSelectedGender,
    searchResults,
    isSearching,
    error,
    clearSearch
  } = usePersonSearch(10)

  // ✅ Inject Formik context
  const formik = useFormikContext<any>()

  // Debug: Log when component mounts
  React.useEffect(() => {
    console.log('🔧 PersonSearchButton mounted with Formik context:', {
      id: props.id,
      label: props.label,
      formikAvailable: !!formik
    })
  }, [props.id, props.label, formik])

  const handlePersonSelect = (person: any) => {
    const personData = person.source || person

    console.log('🔍 Selected person:', personData)

    // ✅ Set Formik field values directly using context
    if (formik) {
      console.log('✅ Using Formik context to set field values')

      if (personData.uuid) {
        formik.setFieldValue('searchPersonId', personData.uuid)
      }
      if (personData.given_name) {
        formik.setFieldValue('firstNamesEng', personData.given_name)
      }
      if (personData.family_name) {
        formik.setFieldValue('familyNameEng', personData.family_name)
      }
      if (personData.dob) {
        const formattedDob = personData.dob.split('T')[0] // "YYYY-MM-DD"
        formik.setFieldValue('motherBirthDate', formattedDob)
      }

      // Handle identifiers dynamically
      const validIdTypes = [
        'NATIONAL_ID',
        'PASSPORT',
        'BIRTH_REGISTRATION_NUMBER'
      ]
      const identifier = personData.identifiers?.find((id: any) =>
        validIdTypes.includes(id.type)
      )
      if (identifier) {
        formik.setFieldValue('motherIdType', identifier.type)
        const fieldName = `mother${identifier.type
          .split('_')
          .map((word: string) => word.charAt(0) + word.slice(1).toLowerCase())
          .join('')}`
        formik.setFieldValue(fieldName, identifier.value)
      }
    }

    // Also call parent callback
    if (onPersonSelect) {
      onPersonSelect(personData)
    }

    // Trigger validation to clear any existing errors
    setTimeout(() => {
      formik.validateForm()
    }, 100)

    setShowModal(false)
    clearSearch()
  }

  const handleCloseModal = () => {
    setShowModal(false)
    clearSearch()
  }

  const { className } = props

  return (
    <Container className={className}>
      <StyledPrimaryButton
        type="button"
        disabled={isDisabled || !isOnline}
        onClick={() => setShowModal(true)}
      >
        {label}
      </StyledPrimaryButton>

      {showModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: window.innerWidth < 1024 ? 0 : 'auto',
              right: 0,
              width: window.innerWidth < 1024 ? '100vw' : '40%',
              height: '100vh',
              backgroundColor: 'white',
              boxShadow:
                window.innerWidth < 1024
                  ? 'none'
                  : '-2px 0 8px rgba(0,0,0,0.1)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h3 style={{ margin: 0 }}>{modalTitle}</h3>
              <TertiaryButton
                id="person-search-cancel"
                onClick={handleCloseModal}
              >
                ✕
              </TertiaryButton>
            </div>
            <SearchContainer>
              <InputField
                id="person-search-input-field"
                touched={true}
                required={true}
                optionalLabel=""
                label={intl.formatMessage(buttonMessages.search)}
              >
                <TextInput
                  id="person-search-input"
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchTerm(e.target.value)
                  }
                  placeholder="Search by name or ID number..."
                />
              </InputField>

              <div style={{ marginTop: '16px' }}>
                <InputField
                  id="gender-filter-field"
                  touched={true}
                  required={false}
                  optionalLabel=""
                  label="Gender (optional)"
                >
                  <Select
                    id="gender-filter"
                    value={selectedGender}
                    onChange={(val: string) => setSelectedGender(val)}
                    options={[
                      { value: '', label: 'All' },
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' }
                    ]}
                  />
                </InputField>
              </div>

              {/* Optional manual search button
          <PrimaryButton
            id="search-person-button"
            type="button"
            onClick={() => handleSearch(searchTerm)}
            disabled={searchTerm.trim().length < 3 || isSearching}
          >
            Search
          </PrimaryButton> */}

              <SearchResults>
                {isSearching && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spinner id="person-search-spinner" size={24} />
                  </div>
                )}

                {!isSearching &&
                  searchResults.map((hit, index) => {
                    const person = hit.source || hit
                    return (
                      <PersonItem
                        key={person.uuid || person.id || index}
                        onClick={() => handlePersonSelect(person)}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <PersonName>
                            {person.full_name || person.name}
                          </PersonName>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {person.score?.toFixed(1)}
                          </div>
                        </div>
                        <PersonDetails>
                          DOB:{' '}
                          {person.dob?.substring(0, 10) || person.dateOfBirth} |
                          Gender: {person.gender}
                          <br />
                          ID:{' '}
                          {person.identifiers?.find(
                            (id: any) => id.type !== 'crvs'
                          )?.value ||
                            person.nationalId ||
                            'N/A'}
                        </PersonDetails>
                      </PersonItem>
                    )
                  })}

                {!isSearching &&
                  searchResults.length === 0 &&
                  searchTerm.trim().length >= 3 &&
                  !error && (
                    <PersonDetails>
                      No persons found matching your search.
                    </PersonDetails>
                  )}

                {error && <ErrorMessage>{error}</ErrorMessage>}
              </SearchResults>
            </SearchContainer>
          </div>
        </>
      )}
    </Container>
  )
}

export const ExtLookupButtonField = injectIntl<'intl', IFullProps>(
  ExtLookupButton
)
