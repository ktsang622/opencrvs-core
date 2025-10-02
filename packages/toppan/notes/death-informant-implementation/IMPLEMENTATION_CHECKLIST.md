# Death Informant Implementation - Checklist

## ✅ Implementation Status

### Code Changes

#### ✅ 1. Correction Handler ([correction.ts](../../src/person-db-sync/death/correction.ts))

**Line 208-224: `handleUpdateInformant()` - Spouse to non-spouse**
```typescript
✅ DELETE FROM family_links_forward (instead of UPDATE)
✅ No filtering by end_date IS NULL (finds all links)
✅ linkAction: 'deleted_erroneous_spouse_link'
✅ Logging: Success and info messages
```

**Line 281-301: `handleRemoveInformantSpouse()`**
```typescript
✅ DELETE FROM family_links_forward (instead of UPDATE)
✅ Returns linkAction in response
✅ Logging: Success and info messages
```

**Line 344-351: `handleReplaceInformantSpouse()`**
```typescript
✅ DELETE FROM family_links_forward (old spouse)
✅ Trigger creates new link (if no marriage)
✅ Logging: Success message
```

**Line 172-177: Relationship normalization**
```typescript
✅ informantData.relationship?.toUpperCase()
✅ Joi schema with .uppercase()
✅ Case-insensitive validation
```

---

### Documentation

#### ✅ 2. Issue Documentation

**Location:** `/home/ktsang/opencrvs-core/packages/toppan/notes/death-informant-implementation/`

| Document | Status | Purpose |
|----------|--------|---------|
| README.md | ✅ Created | Index and quick reference |
| DEATH_CLERICAL_ERROR_FIX.md | ✅ Created | Bug fix documentation |
| DEATH_ERROR_HANDLING_PHILOSOPHY.md | ✅ Created | Error handling principles |
| DEATH_BEST_PRACTICES_CONCLUSION.md | ✅ Created | CRVS compliance analysis |
| DEATH_ALL_SCENARIOS.md | ✅ Created | Complete scenario guide |
| DEATH_INFORMANT_ARCHITECTURE.md | ✅ Created | Architecture overview |
| DEATH_CREATE_SCENARIOS.md | ✅ Created | Creation scenarios |
| DEATH_IMPLEMENTATION_SUMMARY.md | ✅ Created | Technical summary |
| DEATH_STANDARDS_COMPARISON.md | ✅ Created | Standards comparison |
| DEATH_SPOUSE_DESIGN.md | ✅ Moved | Original design (superseded) |
| DEATH_SPOUSE_IMPLEMENTATION.md | ✅ Moved | Original impl (superseded) |

---

### Testing Requirements

#### ⏳ 3. Test Cases (To Be Executed)

**Scenario: UPDATE_INFORMANT (spouse to non-spouse)**
```bash
# 1. Create death with spouse informant (no marriage)
POST /death/create
  - Deceased: John Doe
  - Informant: Jane Smith (SPOUSE)

Expected:
  ✅ Informational spouse link created
  ✅ Link has end_date = death_date

# 2. Correct relationship (spouse to child)
POST /death/correction
{
  "action": "UPDATE_INFORMANT",
  "informantData": {
    "personId": "jane-id",
    "relationship": "CHILD"
  }
}

Expected:
  ✅ Old participant deactivated
  ✅ New participant created (CHILD)
  ✅ Informational link DELETED (not just closed)
  ✅ linkAction: 'deleted_erroneous_spouse_link'
  ✅ Family tree: No spouse link visible

# 3. Verify audit trail
SELECT * FROM event_participant WHERE event_id = 'death-id' ORDER BY created_at

Expected:
  ✅ Two records (old inactive, new active)
  ✅ Correction history preserved
```

**Scenario: REMOVE_INFORMANT_SPOUSE**
```bash
# 1. Create death with spouse informant
# 2. Remove spouse relationship
POST /death/correction
{
  "action": "REMOVE_INFORMANT_SPOUSE"
}

Expected:
  ✅ Participant relationship changed to OTHER
  ✅ Informational link DELETED
  ✅ linkAction in response
```

**Scenario: REPLACE_INFORMANT_SPOUSE**
```bash
# 1. Create death with wrong spouse
# 2. Replace with correct spouse
POST /death/correction
{
  "action": "REPLACE_INFORMANT_SPOUSE",
  "informantData": {
    "personId": "correct-spouse-id",
    "relationship": "SPOUSE"
  }
}

Expected:
  ✅ Old spouse participant deactivated
  ✅ Old informational link DELETED
  ✅ New spouse participant created
  ✅ New informational link created (if no marriage)
```

**Scenario: Case-insensitive relationship**
```bash
POST /death/correction
{
  "informantData": {
    "relationship": "spouse"  # lowercase
  }
}

Expected:
  ✅ Normalized to "SPOUSE"
  ✅ Joi validation passes
  ✅ Stored as uppercase in DB
```

---

### Database Verification

#### ⏳ 4. Database Queries (To Verify)

**Check family_links_forward cleanup:**
```sql
-- Before correction
SELECT * FROM family_links_forward
WHERE source_event_id = (SELECT id FROM event WHERE crvs_event_uuid = 'death-123')
  AND source = 'death_registration'

Expected: 1 row (spouse link)

-- After UPDATE_INFORMANT correction
SELECT * FROM family_links_forward
WHERE source_event_id = (SELECT id FROM event WHERE crvs_event_uuid = 'death-123')
  AND source = 'death_registration'

Expected: 0 rows ✅ (link deleted)
```

**Check event_participant history:**
```sql
SELECT person_id, role, relationship_details->>'informantType' as type,
       status, ended_at
FROM event_participant
WHERE event_id = (SELECT id FROM event WHERE crvs_event_uuid = 'death-123')
  AND role = 'informant'
ORDER BY created_at

Expected:
- Row 1: type='SPOUSE', status='inactive', ended_at IS NOT NULL
- Row 2: type='OTHER', status='active', ended_at IS NULL
```

**Check event remarks:**
```sql
SELECT remarks FROM event
WHERE crvs_event_uuid = 'death-123'

Expected: Contains "CORRECTION: UPDATE_INFORMANT"
```

---

### Edge Cases

#### ⏳ 5. Edge Case Testing

**Edge Case 1: No informational link exists**
- Scenario: Marriage exists, so no informational link created
- Correction: UPDATE_INFORMANT from SPOUSE to OTHER
- Expected: ✅ No error, linkAction: 'deleted_erroneous_spouse_link' (0 rows)

**Edge Case 2: Multiple corrections**
- Scenario: Correct same event multiple times
- Expected: ✅ Each correction tracked, audit trail complete

**Edge Case 3: Link already deleted manually**
- Scenario: Link deleted outside normal flow
- Correction: UPDATE_INFORMANT
- Expected: ✅ No error, logs "No informational spouse link found"

---

## Summary

### ✅ Completed

1. **Code Implementation**
   - ✅ DELETE logic in all 3 correction actions
   - ✅ Case normalization (uppercase)
   - ✅ Response includes linkAction
   - ✅ Proper logging

2. **Documentation**
   - ✅ 11 comprehensive documents
   - ✅ Organized in notes/death-informant-implementation/
   - ✅ README index created
   - ✅ CRVS compliance verified

### ⏳ Pending

1. **Testing**
   - ⏳ Execute test scenarios
   - ⏳ Verify database state
   - ⏳ Test edge cases
   - ⏳ Integration testing

2. **Deployment**
   - ⏳ Code review
   - ⏳ PR creation
   - ⏳ Staging deployment
   - ⏳ Production deployment

---

## Files Modified

### Source Code
1. `/home/ktsang/opencrvs-core/packages/toppan/src/person-db-sync/death/correction.ts`
   - Lines 172-177: Relationship normalization
   - Lines 208-224: UPDATE_INFORMANT - DELETE link
   - Lines 281-301: REMOVE_INFORMANT_SPOUSE - DELETE link
   - Lines 344-351: REPLACE_INFORMANT_SPOUSE - DELETE link
   - Line 58: Joi schema with .uppercase()

### Documentation (All in `notes/death-informant-implementation/`)
1. README.md - Index
2. DEATH_CLERICAL_ERROR_FIX.md - Bug fix doc
3. DEATH_ERROR_HANDLING_PHILOSOPHY.md - Philosophy
4. DEATH_BEST_PRACTICES_CONCLUSION.md - CRVS compliance
5. DEATH_ALL_SCENARIOS.md - Complete scenarios
6. DEATH_INFORMANT_ARCHITECTURE.md - Architecture
7. DEATH_CREATE_SCENARIOS.md - Creation scenarios
8. DEATH_IMPLEMENTATION_SUMMARY.md - Summary
9. DEATH_STANDARDS_COMPARISON.md - Standards
10. DEATH_SPOUSE_DESIGN.md - Original design
11. DEATH_SPOUSE_IMPLEMENTATION.md - Original impl
12. IMPLEMENTATION_CHECKLIST.md - This file

---

## Next Steps

1. **Review Code Changes**
   ```bash
   git diff packages/toppan/src/person-db-sync/death/correction.ts
   ```

2. **Run Tests** (when available)
   ```bash
   yarn test packages/toppan
   ```

3. **Manual Testing**
   - Follow test scenarios above
   - Verify database state
   - Check logs

4. **Code Review**
   - Create PR with link to documentation
   - Reference: [DEATH_CLERICAL_ERROR_FIX.md](./DEATH_CLERICAL_ERROR_FIX.md)

5. **Deployment**
   - Staging first
   - Monitor logs
   - Production deployment

---

## Success Criteria

✅ **Code:** DELETE logic implemented in all correction actions
✅ **Documentation:** Comprehensive docs in organized structure
⏳ **Testing:** All scenarios pass
⏳ **Review:** Code reviewed and approved
⏳ **Deploy:** Changes deployed to production

---

**Status:** Implementation Complete, Testing Pending
**Last Updated:** 2024-10-02
