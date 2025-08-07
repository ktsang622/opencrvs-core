/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Button } from '@opencrvs/components/lib/Button'
import { config } from '@client/config'

interface IFamilyTreePanelProps {
  personId: string
  onClose: () => void
}

export const FamilyTreePanel: React.FC<IFamilyTreePanelProps> = ({
  personId,
  onClose
}) => {
  const [isLoading, setIsLoading] = React.useState(true)

  return (
    <div
      style={{
        marginBottom: '24px',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: '#f8f9fa',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <h4 style={{ margin: 0, color: '#2c3e50' }}>Family Tree</h4>
        <Button type="tertiary" size="small" onClick={onClose}>
          ✕
        </Button>
      </div>
      {isLoading && (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          Loading Family Tree...
        </div>
      )}
      <iframe
        src={`${config.FAMILY_TREE_URL}/${personId}`}
        style={{
          width: '100%',
          height: '300px',
          border: 'none',
          display: isLoading ? 'none' : 'block'
        }}
        title="Family Tree"
        onLoad={(e) => {
          setIsLoading(false)
          const iframe = e.target as HTMLIFrameElement
          const resizeIframe = () => {
            try {
              const iframeDoc =
                iframe.contentDocument || iframe.contentWindow?.document
              if (iframeDoc) {
                const body = iframeDoc.body
                const height = body?.scrollHeight || 300
                iframe.style.height = height + 'px'
              }
            } catch (error) {
              // Cross-origin fallback - keep current height
            }
          }

          setTimeout(resizeIframe, 100)
          const interval = setInterval(resizeIframe, 1000)
          setTimeout(() => clearInterval(interval), 10000)
        }}
      />
    </div>
  )
}
