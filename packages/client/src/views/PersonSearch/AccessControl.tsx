/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as React from 'react'
import { Frame } from '@opencrvs/components/lib/Frame'
import { Header } from '@client/components/Header/Header'
import { Navigation } from '@client/components/interface/Navigation'
import { Content, ContentSize } from '@opencrvs/components/lib/Content'
import { injectIntl, WrappedComponentProps as IntlShapeProps } from 'react-intl'
import { constantsMessages } from '@client/i18n/messages'

interface IAccessControlProps extends IntlShapeProps {
  hasAccess: boolean
  children: React.ReactNode
}

const AccessControlView: React.FC<IAccessControlProps> = ({
  intl,
  hasAccess,
  children
}) => {
  if (!hasAccess) {
    return (
      <Frame
        header={<Header title="Access Denied" />}
        skipToContentText={intl.formatMessage(
          constantsMessages.skipToMainContent
        )}
        navigation={<Navigation />}
      >
        <Content title="Access Denied" size={ContentSize.LARGE}>
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <h3>Access Restricted</h3>
            <p>
              Only users with registration permissions have access to person
              search functionality.
            </p>
          </div>
        </Content>
      </Frame>
    )
  }

  return <>{children}</>
}

export const AccessControl = injectIntl(AccessControlView)
