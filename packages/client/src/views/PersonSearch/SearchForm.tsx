/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'

interface ISearchFormProps {
  searchQuery: string
  idNumber: string
  searchMode: string
  pageSize: number
  loading: boolean
  onSearchQueryChange: (value: string) => void
  onIdNumberChange: (value: string) => void
  onSearchModeChange: (value: string) => void
  onPageSizeChange: (value: number) => void
  onSearch: () => void
}

export const SearchForm: React.FC<ISearchFormProps> = ({
  searchQuery,
  idNumber,
  searchMode,
  pageSize,
  loading,
  onSearchQueryChange,
  onIdNumberChange,
  onSearchModeChange,
  onPageSizeChange,
  onSearch
}) => {
  return (
    <>
      <input
        id="search-input"
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Enter full name..."
        style={{
          width: '100%',
          padding: '12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '16px',
          marginBottom: '10px'
        }}
      />

      <input
        id="id-input"
        type="text"
        value={idNumber}
        onChange={(e) => onIdNumberChange(e.target.value)}
        placeholder="Enter ID number (optional)..."
        style={{
          width: '100%',
          padding: '12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '16px'
        }}
      />

      <fieldset
        style={{
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}
      >
        <legend
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#495057',
            marginBottom: '12px'
          }}
        >
          Search Mode
        </legend>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
          {['strict', 'relaxer', 'most_relaxed'].map((mode) => (
            <label
              key={mode}
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor:
                  searchMode === mode ? '#e3f2fd' : 'transparent',
                border:
                  searchMode === mode
                    ? '1px solid #2196F3'
                    : '1px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                type="radio"
                name="searchMode"
                value={mode}
                checked={searchMode === mode}
                onChange={(e) => onSearchModeChange(e.target.value)}
                style={{ marginRight: '8px', accentColor: '#2196F3' }}
              />
              <span
                style={{
                  textTransform: 'capitalize',
                  fontWeight: searchMode === mode ? '600' : '400',
                  color: searchMode === mode ? '#1976D2' : '#6c757d'
                }}
              >
                {mode.replace('_', ' ')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'end',
          marginTop: '16px'
        }}
      >
        <div style={{ flex: 1 }}>
          <Button
            id="search"
            type="primary"
            size="large"
            fullWidth
            disabled={loading || (!searchQuery.trim() && !idNumber.trim())}
            onClick={onSearch}
          >
            <Icon name="MagnifyingGlass" />
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        >
          <option value={10}>10 results</option>
          <option value={20}>20 results</option>
          <option value={50}>50 results</option>
          <option value={100}>100 results</option>
        </select>
      </div>
    </>
  )
}
