# Death Informant Implementation - Documentation Index

## Issue: Death Registration Informant & Spouse Handling

This directory contains comprehensive documentation for the death registration informant implementation, including architecture, scenarios, corrections, and best practices.

---

## 📋 Document Index

### 1. **Architecture & Design**

#### [DEATH_INFORMANT_ARCHITECTURE.md](./DEATH_INFORMANT_ARCHITECTURE.md)
**Overview of the informant architecture**
- Core principles: Informant ≠ Family Relationship
- Death event participants (subject, informant)
- Informant types (SPOUSE, OTHER)
- Database trigger behavior
- Case scenarios (1-4)

#### [DEATH_SPOUSE_DESIGN.md](./DEATH_SPOUSE_DESIGN.md)
**Original spouse correction design** *(superseded by informant architecture)*
- Philosophy: Marriage creates legal relationship, death form is informational
- Correction actions (now deprecated in favor of informant-based approach)
- Edge cases (divorced/remarried, common-law, mismatches)

#### [DEATH_SPOUSE_IMPLEMENTATION.md](./DEATH_SPOUSE_IMPLEMENTATION.md)
**Original spouse implementation details** *(superseded)*
- Technical implementation of spouse handling
- Database queries and triggers
- Correction handlers

---

### 2. **Scenarios & Use Cases**

#### [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) ⭐ **COMPREHENSIVE REFERENCE**
**Complete guide to all death registration scenarios**
- **Create Scenarios:** 6 cases (married/unmarried, correct/wrong spouse, dummy person)
- **Correction Scenarios:** 3 actions (UPDATE_INFORMANT, REMOVE_INFORMANT_SPOUSE, REPLACE_INFORMANT_SPOUSE)
- **Database Trigger Behavior:** Complete logic flow
- **API Examples:** Request/response for all scenarios
- **Decision Tree:** Visual workflow

#### [DEATH_CREATE_SCENARIOS.md](./DEATH_CREATE_SCENARIOS.md)
**Focused on death creation scenarios**
- Detailed breakdown of 6 creation cases
- Validation logic (informant vs marriage spouse)
- Database state after creation

---

### 3. **Implementation Details**

#### [DEATH_IMPLEMENTATION_SUMMARY.md](./DEATH_IMPLEMENTATION_SUMMARY.md)
**Technical implementation summary**
- Database schema changes
- Trigger modifications
- Handler implementations
- Migration notes

#### [DEATH_STANDARDS_COMPARISON.md](./DEATH_STANDARDS_COMPARISON.md)
**Comparison with vital statistics standards**
- Birth vs Death implementation patterns
- Marriage vs Death-reported spouse relationships
- Standards compliance analysis

---

### 4. **Error Handling & Corrections**

#### [DEATH_ERROR_HANDLING_PHILOSOPHY.md](./DEATH_ERROR_HANDLING_PHILOSOPHY.md) ⭐ **CRITICAL**
**Core philosophy for error handling**
- Principle: Person DB must always reflect event state
- Warnings vs Errors distinction
- Transaction safety
- Response format standards
- Real-world examples

#### [DEATH_CLERICAL_ERROR_FIX.md](./DEATH_CLERICAL_ERROR_FIX.md) ⭐ **CRITICAL**
**Bug fix: Erroneous informational links not being removed**
- **Problem:** Links created with `end_date = death_date`, cannot be found by `end_date IS NULL` queries
- **Solution:** DELETE erroneous links instead of UPDATE
- **Why DELETE:** Informational links are derived data, clerical errors should be removed
- Complete flow examples
- Before/after comparison

#### [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md) ⭐ **CRITICAL**
**CRVS best practices analysis**
- Research: UN/WHO CRVS standards
- Comparison: Soft delete vs Archive vs Hard delete
- Data classification (source vs derived)
- Audit trail verification
- Compliance verdict: ✅ APPROVED
- When DELETE is right vs wrong

---

## 🎯 Quick Reference by Role

### For Backend Developers
**Start here:**
1. [DEATH_INFORMANT_ARCHITECTURE.md](./DEATH_INFORMANT_ARCHITECTURE.md) - Understand the system
2. [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) - See all scenarios
3. [DEATH_ERROR_HANDLING_PHILOSOPHY.md](./DEATH_ERROR_HANDLING_PHILOSOPHY.md) - Error handling rules

### For Business Analysts
**Start here:**
1. [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) - All use cases
2. [DEATH_CREATE_SCENARIOS.md](./DEATH_CREATE_SCENARIOS.md) - Creation flows
3. [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md) - Standards compliance

### For QA/Testers
**Start here:**
1. [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) - Test scenarios (section: API Examples)
2. [DEATH_CLERICAL_ERROR_FIX.md](./DEATH_CLERICAL_ERROR_FIX.md) - Bug fix test cases
3. [DEATH_ERROR_HANDLING_PHILOSOPHY.md](./DEATH_ERROR_HANDLING_PHILOSOPHY.md) - Expected responses

### For Compliance/Legal Teams
**Start here:**
1. [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md) - CRVS standards compliance
2. [DEATH_ERROR_HANDLING_PHILOSOPHY.md](./DEATH_ERROR_HANDLING_PHILOSOPHY.md) - Audit trail preservation
3. [DEATH_INFORMANT_ARCHITECTURE.md](./DEATH_INFORMANT_ARCHITECTURE.md) - Data integrity

---

## 🔑 Key Concepts

### 1. Informant vs Family Relationship
**Informant** = Person who reported the death (metadata)
**Family Relationship** = Legal relationship from birth/marriage events

### 2. Informant Types
- `SPOUSE` - Informant claims to be spouse
- `OTHER` - Informant is child, parent, sibling, friend, etc.

### 3. Family Link Sources
- `marriage_registration` - Legal marriage (solid line) ✅ Source of truth
- `death_registration` - Informational only (dotted line) ⚠️ Supplementary

### 4. Correction Actions
- `UPDATE_INFORMANT` - Change who the informant is
- `REMOVE_INFORMANT_SPOUSE` - Change informant type from SPOUSE to OTHER
- `REPLACE_INFORMANT_SPOUSE` - Replace spouse informant with different person

---

## 🐛 Critical Bug Fix Summary

### Issue
When correcting a clerical error (informant wrongly marked as spouse), the informational spouse link remained in the database, showing incorrect family relationships.

### Root Cause
- Trigger creates informational link with `end_date = death_date` (already closed)
- Correction handler looked for `end_date IS NULL` (couldn't find it)
- Link never updated/removed

### Solution
Changed from `UPDATE ... SET end_date` to `DELETE FROM` for clerical errors:
- Erroneous informational links completely removed
- Family tree shows only correct relationships
- Audit trail preserved in `event_participant` history
- Complies with CRVS best practices for derived data corrections

**Files Changed:**
- [correction.ts](../../src/person-db-sync/death/correction.ts)
  - `handleUpdateInformant()` - Lines 208-224
  - `handleRemoveInformantSpouse()` - Lines 281-301
  - `handleReplaceInformantSpouse()` - Lines 344-351

---

## 📊 Implementation Status

✅ **Completed:**
- Informant architecture (role='informant', not 'spouse')
- Validation: Informant spouse vs marriage spouse
- Warning system for mismatches (Case 2 & 3)
- Correction handlers (UPDATE_INFORMANT, REMOVE_INFORMANT_SPOUSE, REPLACE_INFORMANT_SPOUSE)
- Clerical error fix (DELETE erroneous links)
- Relationship normalization (case-insensitive, uppercase)
- Comprehensive documentation

✅ **Best Practices Verified:**
- CRVS compliance (UN/WHO standards)
- Event sourcing pattern
- Audit trail preservation
- Data integrity (source vs derived)

---

## 🔗 Related Documentation

### Database
- [Database Schema](../database-schema/DATABASE_SCHEMA.md)
- [Schema Sync](../database-schema/SCHEMA_SYNC.md)
- Database triggers: `/home/ktsang/opencrvs-core/init/database.sql` (lines 403-479)

### Code
- Create handler: [death/create.ts](../../src/person-db-sync/death/create.ts)
- Correction handler: [death/correction.ts](../../src/person-db-sync/death/correction.ts)
- Delete handler: [death/delete.ts](../../src/person-db-sync/death/delete.ts)

### Other Events
- [Birth Correction Flow](../birth-correction/BIRTH_CORRECTION_FLOW.md)

---

## 📝 Document Changelog

| Date | Document | Change |
|------|----------|--------|
| 2024-10-02 | All | Initial comprehensive documentation |
| 2024-10-02 | DEATH_CLERICAL_ERROR_FIX.md | Critical bug fix documented |
| 2024-10-02 | DEATH_BEST_PRACTICES_CONCLUSION.md | CRVS standards compliance analysis |
| 2024-10-02 | DEATH_ERROR_HANDLING_PHILOSOPHY.md | Error handling principles documented |
| 2024-10-02 | README.md | Documentation index created |

---

## ❓ FAQ

### Q: Why DELETE links instead of marking them inactive?
**A:** Informational links are derived data. For clerical errors (data entered incorrectly), the link should never have existed. DELETE ensures family tree shows only valid relationships. Audit trail preserved in event_participant history.

See: [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md)

### Q: What's the difference between informant and family relationship?
**A:** Informant is metadata (who reported the death). Family relationships come from birth/marriage events, not the death form.

See: [DEATH_INFORMANT_ARCHITECTURE.md](./DEATH_INFORMANT_ARCHITECTURE.md)

### Q: What happens if informant spouse differs from marriage spouse?
**A:** System adds warning to event.remarks, but allows transaction to complete. This flags data quality issue for review.

See: [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) - Case 2 & 3

### Q: Can I change informant from spouse to non-spouse?
**A:** Yes, using `UPDATE_INFORMANT` action. Erroneous informational link automatically deleted.

See: [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) - Correction 1

### Q: Is this CRVS compliant?
**A:** Yes. Verified against UN/WHO CRVS standards. DELETE approach appropriate for derived/informational data corrections.

See: [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md)

---

## 📞 Contact

For questions about this implementation:
- Review [DEATH_ALL_SCENARIOS.md](./DEATH_ALL_SCENARIOS.md) for comprehensive scenarios
- Check [DEATH_ERROR_HANDLING_PHILOSOPHY.md](./DEATH_ERROR_HANDLING_PHILOSOPHY.md) for error handling rules
- See [DEATH_BEST_PRACTICES_CONCLUSION.md](./DEATH_BEST_PRACTICES_CONCLUSION.md) for standards compliance
