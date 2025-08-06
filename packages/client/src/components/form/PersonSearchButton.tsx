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
import { Spinner } from '@opencrvs/components/lib/Spinner'
import { buttonMessages } from '@client/i18n/messages'
import { useOnlineStatus } from '@client/utils'
import { config } from '@client/config'
import { useFormikContext } from 'formik'

interface IPersonSearchButtonProps {
  id: string
  label: string
  className?: string
  modalTitle: string
  onPersonSelect?: (person: any) => void
  isDisabled?: boolean
  setFieldValue?: (name: string, value: any) => void
}

type IFullProps = IPersonSearchButtonProps & IntlShapeProps

const Container = styled.div`
  display: flex;
`

const SearchContainer = styled.div`
  padding: 20px 0;
  min-height: 400px;

  @media (min-width: ${({ theme }) => theme.grid.breakpoints.lg}px) {
    min-width: 550px;
    min-height: 500px;
  }
`

const SearchResults = styled.div`
  max-height: 300px;
  overflow-y: auto;
  margin-top: 16px;

  @media (min-width: ${({ theme }) => theme.grid.breakpoints.lg}px) {
    max-height: 400px;
    min-height: 200px;
  }
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

const PersonSearchButton = (
  props: IFullProps & { setFieldValue?: (name: string, value: any) => void }
) => {
  const { intl, label, modalTitle, isDisabled, onPersonSelect, setFieldValue } =
    props
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isOnline = useOnlineStatus()

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

  const handleSearch = useCallback(async (term: string) => {
    if (!term || term.trim().length < 3) return

    setIsSearching(true)
    setError(null)
    try {
      const apiUrl = `${config.API_GATEWAY_URL}person-search/detailed`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          full_name: term.trim(),
          gender: '',
          dob: '',
          age: '',
          identifier: '',
          searchMode: 'relaxer',
          page: 1,
          pageSize: 10
        })
      })

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }

      const data = await response.json()
      const results = data.hits || data
      console.log('🔍 Search API response:', JSON.stringify(data, null, 2))
      console.log('🔍 Processed results:', JSON.stringify(results, null, 2))
      setSearchResults(results)
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
      setError('Failed to fetch search results. Please try again later.')
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm.trim().length >= 3) {
        handleSearch(searchTerm)
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchTerm, handleSearch])

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

    setShowModal(false)
    setSearchTerm('')
    setSearchResults([])
    setError(null)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSearchTerm('')
    setSearchResults([])
    setError(null)
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

      <ResponsiveModal
        id="person-search-modal"
        title={modalTitle}
        show={showModal}
        handleClose={handleCloseModal}
        width={600}
        actions={[
          <TertiaryButton
            key="cancel"
            id="person-search-cancel"
            onClick={handleCloseModal}
          >
            {intl.formatMessage(buttonMessages.cancel)}
          </TertiaryButton>
        ]}
      >
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
              placeholder="Search by name..."
            />
          </InputField>

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
                    <PersonName>{person.full_name || person.name}</PersonName>
                    <PersonDetails>
                      DOB: {person.dob?.substring(0, 10) || person.dateOfBirth}{' '}
                      | Gender: {person.gender}
                      <br />
                      ID:{' '}
                      {person.identifiers?.[0]?.value ||
                        person.nationalId ||
                        'N/A'}{' '}
                      | Place of Birth: {person.place_of_birth}
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
      </ResponsiveModal>
    </Container>
  )
}

export const PersonSearchButtonField = injectIntl<'intl', IFullProps>(
  PersonSearchButton
)
