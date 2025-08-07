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

import { useState, useCallback, useEffect } from 'react'
import { config } from '@client/config'

export interface PersonSearchResult {
  uuid: string
  name: string
  given_name: string
  family_name: string
  nationalId: string
  dob: string
  gender: string
  identifiers: Array<{ type: string; value: string }>
  score: number
}

export const usePersonSearch = (
  initialPageSize = 10,
  serverSidePagination = true
) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGender, setSelectedGender] = useState('')
  const [searchMode, setSearchMode] = useState('relaxer')
  const [searchResults, setSearchResults] = useState<PersonSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [serverTotal, setServerTotal] = useState(0)

  const handleSearch = useCallback(
    async (term: string, page = 1) => {
      if (!term || term.trim().length < 3) {
        setSearchResults([])
        setServerTotal(0)
        return
      }

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
            full_name: isNaN(Number(term.trim())) ? term.trim() : '',
            gender: selectedGender.toLowerCase(),
            dob: '',
            age: '',
            identifier: isNaN(Number(term.trim())) ? '' : term.trim(),
            searchMode: searchMode,
            page: serverSidePagination ? page : 1,
            pageSize: serverSidePagination ? pageSize : 100
          })
        })

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`)
        }

        const data = await response.json()
        const results = data.hits || data

        // Sort by score (highest first)
        const sortedResults = results.sort(
          (a: any, b: any) => (b.score || 0) - (a.score || 0)
        )
        setSearchResults(sortedResults)
        setServerTotal(data.total || sortedResults.length)
      } catch (error) {
        console.error('Person search error:', error)
        setSearchResults([])
        setError('Failed to fetch search results. Please try again later.')
      } finally {
        setIsSearching(false)
      }
    },
    [selectedGender, searchMode, pageSize, serverSidePagination]
  )

  // Auto-search with debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setCurrentPage(1)
      handleSearch(searchTerm)
    }, 500)

    return () => clearTimeout(delayDebounce)
  }, [searchTerm, selectedGender, searchMode, handleSearch])

  // Pagination logic
  const totalResults = serverSidePagination ? serverTotal : searchResults.length
  const totalPages = Math.ceil(totalResults / pageSize)
  const paginatedResults = serverSidePagination
    ? searchResults
    : searchResults.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      if (serverSidePagination && searchTerm.trim().length >= 3) {
        handleSearch(searchTerm, page)
      }
    }
  }

  const clearSearch = () => {
    setSearchTerm('')
    setSelectedGender('')
    setSearchResults([])
    setError(null)
  }

  return {
    searchTerm,
    setSearchTerm,
    selectedGender,
    setSelectedGender,
    searchMode,
    setSearchMode,
    searchResults,
    paginatedResults,
    isSearching,
    error,
    currentPage,
    pageSize,
    totalResults,
    totalPages,
    goToPage,
    handleSearch,
    clearSearch
  }
}
