---
name: code-integration-test
description: Integration testing across system boundaries.
---

<!-- ai-sdlc:context-protocol:begin — generated from rules/context-protocol.md; edit there and run `node scripts/sync-context-protocol.js` -->
## Project context (read before acting)

1. **A SPECIFICATION / BUG FIX / SYSTEM ARCHITECTURE block in your prompt is the contract.** Work from it first.
2. **Otherwise — or when your work reaches beyond that block — consult the project's own documentation:**
   - `docs/architecture/overview.md`: components and the code each owns, the contracts that connect them, data ownership, invariants (monorepo: also `<subproject>/docs/architecture/overview.md`)
   - `docs/product/context.md`: personas, glossary, current capabilities, regulatory constraints
   - the task's PRD (`docs/prd/`), design doc (`docs/design/`) or bug report (`docs/bugs/`), and the ADRs in `.ai-sdlc/_decisions/`
3. **Use the lookup tools when you have them:** ai-sdlc-context (`architecture_lookup`, `architecture_contracts`, `product_lookup`, `spec_lookup`, `decision_lookup`) and cxpak (`cxpak_graph` trace / blast_radius, `cxpak_insight` architecture / conventions; or `cxpak overview --tokens 6k [--workspace <subproject>]` via Bash). Never use cxpak's `cxpak_context` op `context` — it ignores the token budget.
4. **Never guess** which component owns a file, how two components connect, or what a domain term means — look it up. If it is not documented, say so and flag it instead of inventing it.
5. **Change code only in the component that owns it**, connect only through declared contracts, honor every invariant and recorded ADR. If one blocks the task, stop and flag it.
<!-- ai-sdlc:context-protocol:end -->

End-to-end integration testing validation

MANDATORY PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 2 agents simultaneously (integration tests generate large outputs):
- **test-runner**: Execute integration test suite (REQUIRED - prevents context overflow)
- **performance-engineer**: Monitor test performance (if performance-critical)

MEMORY MANAGEMENT SAFEGUARDS:
- [ ] ALWAYS use test-runner for integration test execution
- [ ] Stream test results instead of accumulating
- [ ] Limit to 2 concurrent agents maximum
- [ ] Process large test suites in batches
- [ ] Fall back to sequential if context >85%


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Integration Test Scope Validation

### Service Integration
- [ ] **Internal Services**: All microservices communicate correctly
- [ ] **External APIs**: Third-party service integrations functional
- [ ] **Database**: Data persistence and retrieval working
- [ ] **Message Queues**: Async communication functioning
- [ ] **File Systems**: File upload/download workflows

### Data Flow Validation
- [ ] **End-to-End Workflows**: Complete business process flows
- [ ] **Data Consistency**: Transactions maintain data integrity
- [ ] **State Management**: Application state consistent across services
- [ ] **Error Propagation**: Errors handled gracefully across boundaries
- [ ] **Rollback Scenarios**: Failure recovery mechanisms work

### Environment Integration
- [ ] **Configuration**: Environment-specific configs loaded correctly
- [ ] **Secrets Management**: Secure credential handling
- [ ] **Network Connectivity**: All required network paths accessible
- [ ] **Resource Access**: File systems, databases, external services
- [ ] **Authentication**: Identity verification across service boundaries

## Test Environment Requirements

### Environment Setup
- [ ] **Test Data**: Representative data sets loaded
- [ ] **Service Dependencies**: All required services running
- [ ] **Network Isolation**: Tests don't interfere with production
- [ ] **Resource Allocation**: Adequate CPU, memory, storage
- [ ] **Clean State**: Each test starts with known state

### Data Management
- [ ] **Test Data Fixtures**: Consistent, maintainable test data
- [ ] **Data Cleanup**: Tests clean up after themselves
- [ ] **Parallel Execution**: Tests can run concurrently safely
- [ ] **Data Privacy**: No production data in test environment
- [ ] **Schema Validation**: Database schema matches expectations

## Integration Test Execution

### Test Categories
- [ ] **API Integration**: RESTful API endpoint testing
- [ ] **Database Integration**: CRUD operations and transactions
- [ ] **UI Integration**: Frontend-backend communication
- [ ] **Event-Driven**: Message queue and event handling
- [ ] **Batch Processing**: Scheduled job and data processing

### Critical Path Testing
- [ ] **User Registration**: Complete signup workflow
- [ ] **Authentication**: Login and session management
- [ ] **Core Business Logic**: Primary application features
- [ ] **Payment Processing**: Financial transaction flows (if applicable)
- [ ] **Data Export/Import**: Bulk data operations

### Error Scenario Testing
- [ ] **Service Unavailable**: Handle downstream service failures
- [ ] **Network Issues**: Timeout and retry mechanisms
- [ ] **Data Corruption**: Invalid data handling
- [ ] **Concurrency Issues**: Race conditions and locks
- [ ] **Resource Exhaustion**: Memory, disk, connection limits

## Quality Gates for Integration Tests

### Test Results Validation
- [ ] **100% Pass Rate**: All integration tests must pass
- [ ] **Performance Thresholds**: Tests complete within time limits
- [ ] **Resource Usage**: Memory/CPU within acceptable bounds
- [ ] **Error Handling**: All error scenarios covered
- [ ] **Data Integrity**: No data corruption or inconsistencies

### Coverage Requirements
- [ ] **Service Coverage**: All services included in testing
- [ ] **Endpoint Coverage**: All API endpoints tested
- [ ] **Workflow Coverage**: All critical user journeys tested
- [ ] **Error Coverage**: All error conditions tested
- [ ] **Configuration Coverage**: All environment configs tested

## Test Reporting and Analysis

### Integration Test Report
```markdown
## Integration Test Results

### Summary
- **Total Tests**: X tests executed
- **Pass Rate**: X% (Target: 100%)
- **Execution Time**: X minutes (Target: <30 minutes)
- **Services Tested**: X/X services covered

### Service Health
- **Database**: ✅ Connected, responsive
- **External APIs**: ✅ All integrations functional
- **Message Queue**: ✅ Events processed correctly
- **File Storage**: ✅ Upload/download working

### Critical Path Results
- **User Registration**: ✅ Complete workflow functional
- **Payment Processing**: ✅ All transaction types working
- **Data Sync**: ✅ Cross-service data consistency maintained

### Issues Found
- Service timeout in user profile update (investigating)
- Intermittent connection issue with payment gateway (monitoring)
```

### Performance Analysis
- [ ] **Response Times**: API response time distribution
- [ ] **Throughput**: Requests per second under load
- [ ] **Resource Utilization**: CPU, memory, disk usage
- [ ] **Database Performance**: Query execution times
- [ ] **Network Latency**: Inter-service communication delays

## Continuous Integration Integration

### CI/CD Pipeline Integration
- [ ] **Automated Execution**: Tests run on every deployment
- [ ] **Environment Provisioning**: Test environment auto-created
- [ ] **Parallel Execution**: Tests run concurrently for speed
- [ ] **Result Reporting**: Test results posted to PR/deployment
- [ ] **Failure Notification**: Team alerted on test failures

### Test Maintenance
- [ ] **Test Updates**: Tests updated with application changes
- [ ] **Data Refresh**: Test data updated regularly
- [ ] **Environment Maintenance**: Test environments kept current
- [ ] **Flaky Test Management**: Unstable tests identified and fixed
- [ ] **Performance Monitoring**: Test execution time trends

## Integration with Development Workflow

### Pre-Deployment Validation
- [ ] **Staging Deployment**: All integration tests pass
- [ ] **Performance Baselines**: No significant regressions
- [ ] **Error Rate Monitoring**: Error rates within acceptable limits
- [ ] **Rollback Testing**: Rollback procedures validated
- [ ] **Monitoring Setup**: Production monitoring ready

### Post-Deployment Verification
- [ ] **Smoke Tests**: Critical functionality verified in production
- [ ] **Health Checks**: All services reporting healthy
- [ ] **Integration Points**: External integrations functioning
- [ ] **Data Flow**: End-to-end data processing working
- [ ] **User Experience**: Critical user journeys functional

## NEVER DEPLOY IF:
- ❌ Any integration test failing
- ❌ Critical path workflows broken
- ❌ Data integrity issues detected
- ❌ External service integrations failing
- ❌ Performance significantly degraded
- ❌ Error rates above acceptable thresholds
