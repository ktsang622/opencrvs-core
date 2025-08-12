export interface PersonDetails {
  person: {
    fullName: string
    nationalId?: string
    nationalIdType?: string
    dateOfBirth?: string
    gender?: string
  }
  events: Array<{
    type: string
    date: string
    role: string
    location: string
    registrationId: string
    eventId?: string
    crvsEventUuid?: string
    relationshipEndDate?: string
    relationshipNotes?: string
  }>
  locationNames: Record<string, string>
}