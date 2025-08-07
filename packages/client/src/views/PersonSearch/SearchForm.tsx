/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'

interface ISearchFormProps {
  searchQuery: string
  selectedGender: string
  searchMode: string
  loading: boolean
  onSearchQueryChange: (value: string) => void
  onGenderChange: (value: string) => void
  onSearchModeChange: (value: string) => void
}

export const SearchForm: React.FC<ISearchFormProps> = ({
  searchQuery,
  selectedGender,
  searchMode,
  loading,
  onSearchQueryChange,
  onGenderChange,
  onSearchModeChange
}) => {
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '16px',
          marginBottom: '16px'
        }}
      >
        <div>
          <label
            htmlFor="search-input"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}
          >
            Search by name or ID
          </label>
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Enter name or ID number..."
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '16px'
            }}
          />
        </div>

        <div>
          <label
            htmlFor="gender-select"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}
          >
            Gender (optional)
          </label>
          <select
            id="gender-select"
            value={selectedGender}
            onChange={(e) => onGenderChange(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '16px'
            }}
          >
            <option value="">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="search-mode-select"
            style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}
          >
            Search Mode
          </label>
          <select
            id="search-mode-select"
            value={searchMode}
            onChange={(e) => onSearchModeChange(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '16px'
            }}
          >
            <option value="strict">Strict</option>
            <option value="relaxer">Relaxed</option>
            <option value="most_relaxed">Most Relaxed</option>
          </select>
        </div>
      </div>
    </>
  )
}
