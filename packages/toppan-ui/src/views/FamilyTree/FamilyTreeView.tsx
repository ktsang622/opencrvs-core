import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { FamilyTreeComponent } from '@/components/FamilyTree/FamilyTreeComponent'
import { PersonDetailsPanel } from '@/components/FamilyTree/PersonDetailsPanel'
import { config } from '@/config'
import type { Node, Link } from '@opencrvs/toppan-common'
import type { PersonDetails } from '@/types/familyTree'

export interface FamilyTreeData {
  nodes: Node[]
  links: Link[]
  expanded: string
}

export const FamilyTreeView: React.FC = () => {
  const { personId } = useParams<{ personId: string }>()
  const [searchParams] = useSearchParams()
  const fullDetails = searchParams.get('fulldetails') === 'true'
  
  const [treeData, setTreeData] = useState<FamilyTreeData>({ nodes: [], links: [], expanded: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPersonDetails, setSelectedPersonDetails] = useState<PersonDetails | null>(null)
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)

  useEffect(() => {
    if (!personId) return
    
    setLoading(true)
    console.log('Loading tree for personId:', personId)
    axios
      .get(`${config.TOPPAN_SERVICE_URL}/tree/init/${personId}`)
      .then((res) => {
        console.log('Tree data received:', res.data)
        console.log('Nodes count:', res.data.nodes?.length)
        console.log('Links count:', res.data.links?.length)
        setTreeData(res.data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load tree:', err)
        console.error('Error response:', err.response?.data)
        setError(`Could not load tree: ${err.message}`)
        setLoading(false)
      })
  }, [personId])

  const handlePersonClick = async (nodeId: string) => {
    try {
      console.log('Expanding node:', nodeId)
      console.log('Current tree data:', treeData)
      
      // Expand tree
      const res = await axios.post(`${config.TOPPAN_SERVICE_URL}/tree/expand`, {
        nodeId,
        nodes: treeData.nodes,
        links: treeData.links,
      })

      console.log('Expand response:', res.data)
      const { deltaNodes, deltaLinks } = res.data
      const nodeMap = new Map()
      ;[...treeData.nodes, ...deltaNodes].forEach((n: any) => nodeMap.set(n.id, n))
      const mergedNodes = Array.from(nodeMap.values())

      const linkKey = (l: any) => `${l.from}-${l.to}-${l.relationship}`
      const linkMap = new Map()
      ;[...treeData.links, ...deltaLinks].forEach((l: any) => linkMap.set(linkKey(l), l))
      const mergedLinks = Array.from(linkMap.values())

      setTreeData({
        nodes: mergedNodes,
        links: mergedLinks,
        expanded: nodeId,
      })

      // Load person details if fullDetails is enabled
      if (fullDetails) {
        const [eventsRes, relationshipsRes] = await Promise.all([
          axios.get(`${config.TOPPAN_SERVICE_URL}/person/${nodeId}/events`),
          axios.get(`${config.TOPPAN_SERVICE_URL}/person/${nodeId}/relationships`)
        ])
        
        const eventsData = eventsRes.data
        const relationshipsData = relationshipsRes.data
        
        // Process events with relationship end dates
        const processedEvents = eventsData.events.map((event: any) => {
          const endDate = relationshipsData.relationships[event.eventId] || relationshipsData.relationships[event.crvsEventUuid]
          const shouldShowEndDate = endDate && event.role !== 'Subject'
          return {
            ...event,
            relationshipEndDate: shouldShowEndDate ? endDate?.end_date : null,
            relationshipNotes: shouldShowEndDate ? endDate?.participant_remarks : null
          }
        })

        // Fetch location names
        const locationIds = [...new Set(processedEvents.map((e: any) => e.location).filter((loc: string) => loc && loc !== 'Unknown'))]
        const locationMap: Record<string, string> = {}
        
        await Promise.all(
          locationIds.map(async (locationId: string) => {
            try {
              const locationRes = await axios.get(`${config.APPLICATION_CONFIG_URL}/locations/${locationId}`)
              locationMap[locationId] = locationRes.data.name || locationId
            } catch {
              locationMap[locationId] = locationId
            }
          })
        )
        
        setSelectedPersonDetails({
          ...eventsData,
          events: processedEvents,
          locationNames: locationMap
        })
        setShowDetailsPanel(true)
      }
    } catch (err) {
      console.error('Failed to load person data:', err)
      setError('Could not load person data')
    }
  }

  if (!personId) {
    return <div>Person ID is required</div>
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh',
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex'
    }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FamilyTreeComponent
          treeData={treeData}
          loading={loading}
          error={error}
          personId={personId}
          onPersonClick={handlePersonClick}
        />
      </div>
      
      {fullDetails && showDetailsPanel && selectedPersonDetails && (
        <PersonDetailsPanel
          personDetails={selectedPersonDetails}
          onClose={() => setShowDetailsPanel(false)}
        />
      )}
    </div>
  )
}