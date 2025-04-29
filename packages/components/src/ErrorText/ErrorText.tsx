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
import * as React from 'react'
import { Warning } from '../icons'
import styled from 'styled-components'
import { Text } from '../Text'

interface IErrorTextProps {
  id?: string
  children: string
}

const Container = styled.div`
  flex-direction: row;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 20px 8px 8px 4px;
`

export function ErrorText(props: IErrorTextProps) {
  return (
    <Container id={props.id}>
      <Warning />
      <Text variant="bold16" element="span" color="negative">
        {props.children}
      </Text>
    </Container>
  )
}
