import React, { useState } from 'react'
import styled from 'styled-components'
import ReactTooltip from 'react-tooltip'
import type { Node, Link } from '@opencrvs/toppan-common'

export interface FamilyTreeData {
  nodes: Node[]
  links: Link[]
  expanded: string
}

const Container = styled.div`
  position: relative;
  overflow: visible;
  padding: 24px;
  height: 100%;
`

const PersonBox = styled.div<{ isRoot?: boolean; isClicked?: boolean; isNew?: boolean }>`
  position: absolute;
  width: 150px;
  height: 60px;
  border: 2px solid ${props => props.isRoot ? '#4caf50' : '#444'};
  border-radius: 8px;
  padding: 12px;
  background: ${props => {
    if (props.isClicked && props.isNew) return '#ffccbc'
    if (props.isClicked) return '#bbdefb'
    if (props.isNew) return '#fff9c4'
    return '#fdfdfd'
  }};
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  z-index: 2;
`

const PersonName = styled.div`
  font-weight: 600;
  color: #212529;
  margin-bottom: 4px;
`

const PersonId = styled.div`
  font-size: 11px;
  color: #6c757d;
`

const LevelHeader = styled.div`
  position: absolute;
  top: 0;
  width: 150px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #6c757d;
  background-color: #e9ecef;
  padding: 4px 8px;
  border-radius: 4px;
`

interface Props {
  treeData: FamilyTreeData
  loading: boolean
  error: string | null
  personId: string
  onPersonClick: (nodeId: string) => void
}

export const FamilyTreeComponent: React.FC<Props> = ({
  treeData,
  loading,
  error,
  personId,
  onPersonClick
}) => {
  const [clickedNode, setClickedNode] = useState<string | null>(null)
  const [addedNodeIds] = useState<Set<string>>(new Set())

  const boxWidth = 150
  const boxHeight = 60
  const levelSpacing = 240
  const rowSpacing = 120

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? '—' : date.toISOString().split('T')[0]
  }

  if (loading) {
    return (
      <Container>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          fontSize: '16px',
          color: '#666'
        }}>
          Loading family tree...
        </div>
      </Container>
    )
  }

  if (error) {
    return (
      <Container>
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      </Container>
    )
  }

  const levelMap: Record<number, typeof treeData.nodes> = {}
  treeData.nodes.forEach((node) => {
    const level = typeof node.level === 'number' ? node.level : 0
    if (!levelMap[level]) levelMap[level] = []
    levelMap[level].push(node)
  })

  const sortedLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b)
  const positions: Record<string, { x: number; y: number }> = {}

  const maxX = sortedLevels.length > 0 ? (sortedLevels.length - 1) * levelSpacing + boxWidth : 800
  const maxY = Math.max(...sortedLevels.map(level => levelMap[level].length * rowSpacing)) + 100
  const contentHeight = maxY + 80

  const handlePersonClick = (nodeId: string) => {
    setClickedNode(nodeId)
    onPersonClick(nodeId)
  }

  return (
    <Container style={{ height: `${contentHeight}px` }}>
      {/* Level Headers */}
      {sortedLevels.map((level, colIndex) => {
        const x = colIndex * levelSpacing
        return (
          <LevelHeader key={`level-${level}`} style={{ left: x }}>
            Generation {level}
          </LevelHeader>
        )
      })}

      {/* Person Boxes */}
      {sortedLevels.flatMap((level, colIndex) =>
        levelMap[level].map((person, rowIndex) => {
          const x = colIndex * levelSpacing
          const y = rowIndex * rowSpacing + 60
          positions[person.id] = { x: x + boxWidth / 2, y: y + boxHeight / 2 }

          const isClicked = person.id === clickedNode
          const isNewlyAdded = addedNodeIds.has(person.id)
          const isRoot = person.id === personId

          return (
            <React.Fragment key={person.id}>
              <PersonBox
                style={{ left: x, top: y }}
                isRoot={isRoot}
                isClicked={isClicked}
                isNew={isNewlyAdded}
                onClick={() => handlePersonClick(person.id)}
                data-tooltip-id={`tooltip-${person.id}`}
                data-tooltip-html={`
                  <strong>DOB:</strong> ${formatDate(person.dob)}<br />
                  <strong>Death:</strong> ${formatDate(person.death) || 'N/A'}<br />
                  <strong>${person.id_type_1 || "ID 1"}:</strong> ${person.id_1 || '—'}<br />
                  <strong>${person.id_type_2 || "ID 2"}:</strong> ${person.id_2 || '—'}
                `}
              >
                <PersonName>{person.full_name}</PersonName>
                <PersonId>{person.id_type_1 || 'ID'}: {person.id_1 || 'N/A'}</PersonId>
              </PersonBox>

              <ReactTooltip
                id={`tooltip-${person.id}`}
                place="top"
                effect="solid"
                style={{
                  zIndex: 9999,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  backgroundColor: '#333',
                  color: '#fff',
                  maxWidth: '250px',
                  fontSize: '12px',
                }}
              />
            </React.Fragment>
          )
        })
      )}

      {/* Connection Lines */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${maxX + 100}px`,
          height: `${contentHeight}px`,
          pointerEvents: 'none',
          zIndex: 1
        }}
      >
        {treeData.links.map((link, i) => {
          const from = positions[link.from]
          const to = positions[link.to]
          if (!from || !to) return null

          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="gray"
              strokeDasharray={link.end_date ? '4 2' : '0'}
              strokeWidth={2}
            />
          )
        })}
      </svg>
    </Container>
  )
}