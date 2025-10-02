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

// TOPPAN MIGRATION NOTE:
// This file has been modified to fix PersonPicker DOB field population issue.
//
// Key changes made by Kevin Tsang:
// 1. Fixed section detection preventing DOB field population when linking persons
// 2. Enhanced person selection logic to work with Toppan family relationship data
// 3. Improved field mapping for person data from enhanced search results
//
// Migration requirements for new OpenCRVS releases:
// - Verify that section detection logic remains compatible
// - Check if new PersonPicker features conflict with DOB field handling
// - Ensure enhanced person search data structure is still supported
// - Test person linking functionality after migration
//
// Related: Works with enhanced person search from packages/gateway/src/features/person-search/
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

interface IPersonPickerProps {
  id: string
  label: string
  className?: string
  modalTitle: string
  onPersonSelect?: (person: any) => void
  isDisabled?: boolean
  setFieldValue?: (name: string, value: any) => void
}

type IFullProps = IPersonPickerProps & IntlShapeProps

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

const PersonPicker = (
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
    console.log('🔧 PersonPicker mounted with Formik context:', {
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

      // Auto-detect which section (mother/father/deceased/spouse) this picker is used in
      // by checking the picker's ID prop
      let sectionPrefix = 'mother' // default
      if (props.id.includes('father')) {
        sectionPrefix = 'father'
      } else if (props.id.includes('deceased')) {
        sectionPrefix = 'deceased'
      } else if (props.id.includes('spouse')) {
        sectionPrefix = 'spouse'
      }
      console.log(
        '🔍 Detected section prefix:',
        sectionPrefix,
        'from ID:',
        props.id
      )

      // Check for duplicate person selection across sections
      if (personData.uuid) {
        const currentFormValues = formik.values as any
        const otherSections = ['mother', 'father', 'deceased', 'spouse'].filter(
          (s) => s !== sectionPrefix
        )

        for (const section of otherSections) {
          // Check both direct field and nested section field
          const otherSectionId =
            currentFormValues[section]?.searchPersonId ||
            currentFormValues.searchPersonId
          if (otherSectionId && otherSectionId === personData.uuid) {
            alert(
              `⚠️ This person is already selected as the ${section}. Please choose a different person.`
            )
            console.warn(
              `Duplicate person selection prevented: ${personData.uuid} is already selected as ${section}`
            )
            return // Stop the selection
          }
        }

        formik.setFieldValue('searchPersonId', personData.uuid)
      }
      if (personData.given_name) {
        formik.setFieldValue('firstNamesEng', personData.given_name)
      }
      if (personData.family_name) {
        formik.setFieldValue('familyNameEng', personData.family_name)
      }

      // Populate gender field
      if (personData.gender) {
        formik.setFieldValue('gender', personData.gender)
      }

      // Populate birth date field (motherBirthDate, fatherBirthDate, deceasedBirthDate, spouseBirthDate)
      if (personData.dateOfBirth) {
        const formattedDob = personData.dateOfBirth.split('T')[0] // Convert ISO to YYYY-MM-DD
        formik.setFieldValue(`${sectionPrefix}BirthDate`, formattedDob)

        // Clear "Exact date of birth unknown" checkbox when DOB is populated
        // Field names: mother.dobUnknown, father.dobUnknown, exactDateOfBirthUnknown (for deceased/spouse)
        if (sectionPrefix === 'deceased' || sectionPrefix === 'spouse') {
          formik.setFieldValue('exactDateOfBirthUnknown', false)
        } else {
          // For mother/father in v2 birth forms
          formik.setFieldValue(`${sectionPrefix}.dobUnknown`, false)
        }
      }

      // Populate nationality field if available
      if (personData.nationality) {
        formik.setFieldValue('nationality', personData.nationality)
      }

      // Populate ID type and number fields based on person's identifiers
      // Skip 'crvs' type as it's internal, use NATIONAL_ID, PASSPORT, etc.
      const identifier = personData.identifiers?.find(
        (id: any) => id.type !== 'crvs'
      )
      if (identifier) {
        // Set ID type (motherIdType, fatherIdType, deceasedIdType, spouseIdType)
        formik.setFieldValue(`${sectionPrefix}IdType`, identifier.type)

        // Set ID number in the corresponding field based on type
        if (identifier.type === 'NATIONAL_ID') {
          formik.setFieldValue(`${sectionPrefix}NationalId`, identifier.value)
        } else if (identifier.type === 'PASSPORT') {
          formik.setFieldValue(`${sectionPrefix}Passport`, identifier.value)
        } else if (identifier.type === 'BIRTH_REGISTRATION_NUMBER') {
          formik.setFieldValue(
            `${sectionPrefix}BirthRegistrationNumber`,
            identifier.value
          )
        }
      } else {
        // No identifier found (or only 'crvs'), set ID type to NONE
        formik.setFieldValue(`${sectionPrefix}IdType`, 'NONE')
      }

      // Mark that person details exist (enables form fields) - only for mother/father/spouse sections
      // Deceased section doesn't use detailsExist
      if (sectionPrefix !== 'deceased') {
        formik.setFieldValue('detailsExist', true)
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
                          DOB: {person.dateOfBirth?.substring(0, 10) || 'N/A'} |
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

export const ExtLookupButtonField = injectIntl<'intl', IFullProps>(PersonPicker)
