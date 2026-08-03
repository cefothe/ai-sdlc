---
name: code-smoke-test
description: Quick smoke tests for critical functionality.
---


Quick production readiness checks and critical path validation

MANDATORY PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 2 agents simultaneously (smoke tests should be lightweight):
- **test-runner**: Execute smoke test suite (REQUIRED for fast feedback)
- **performance-engineer**: Basic performance monitoring (if performance-critical)

MEMORY MANAGEMENT SAFEGUARDS:
- [ ] ALWAYS use test-runner for smoke test execution
- [ ] Keep smoke tests lightweight (<5 min execution)
- [ ] Limit to 2 concurrent agents maximum
- [ ] Stream results for immediate feedback
- [ ] Fail fast on first critical failure


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Smoke Test Scope

### Critical Application Functions
- [ ] **Application Startup**: Service starts without errors
- [ ] **Database Connectivity**: Can connect and query database
- [ ] **Authentication**: User login/logout functionality
- [ ] **Core API Endpoints**: Primary business functions responsive
- [ ] **External Dependencies**: Third-party services accessible

### Basic User Workflows
- [ ] **Home Page Load**: Main application page renders
- [ ] **User Registration**: New user signup process
- [ ] **Data Creation**: Create new records/entities
- [ ] **Data Retrieval**: Read existing data successfully
- [ ] **Search Functionality**: Basic search returns results

### Infrastructure Health
- [ ] **Load Balancer**: Traffic routing correctly
- [ ] **Service Discovery**: All services discoverable
- [ ] **Configuration**: Environment variables loaded
- [ ] **Logging**: Application logs being written
- [ ] **Monitoring**: Health check endpoints responding

## Smoke Test Execution Strategy

### Fast Execution Requirements
- [ ] **Total Runtime**: Complete in <5 minutes
- [ ] **Parallel Execution**: Tests run simultaneously
- [ ] **Fail Fast**: Stop on first critical failure
- [ ] **Minimal Setup**: Use existing data, avoid complex setup
- [ ] **High Signal**: Focus on most likely failure points

### Test Selection Criteria
- [ ] **Business Critical**: Core revenue-generating features
- [ ] **High Usage**: Most frequently used functionality
- [ ] **External Dependencies**: Integration points most likely to fail
- [ ] **Recent Changes**: Areas modified in latest deployment
- [ ] **Historical Failures**: Components with past reliability issues

### Environment Validation
- [ ] **Target Environment**: Verify testing correct environment
- [ ] **Service Versions**: Confirm expected application versions
- [ ] **Configuration**: Environment-specific settings correct
- [ ] **Access Permissions**: Test user credentials valid
- [ ] **Network Connectivity**: Can reach required services

## Critical Path Testing

### Authentication Flow
- [ ] **Login Page**: Authentication page loads
- [ ] **Credential Validation**: Valid credentials accepted
- [ ] **Session Creation**: User session established
- [ ] **Protected Resources**: Authenticated user can access
- [ ] **Logout**: Session termination works

### Core Business Functions
- [ ] **Primary Workflow**: Main user journey functional
- [ ] **Data Persistence**: Changes save successfully
- [ ] **Data Retrieval**: Saved data loads correctly
- [ ] **Search/Filter**: Basic search returns expected results
- [ ] **Navigation**: Key application areas accessible

### Integration Points
- [ ] **Database**: Read/write operations successful
- [ ] **Payment Gateway**: Connection established (if applicable)
- [ ] **Email Service**: Can send notifications (if applicable)
- [ ] **File Storage**: Upload/download functional (if applicable)
- [ ] **Third-party APIs**: External services responding

## Performance Validation

### Response Time Checks
- [ ] **Page Load**: <3 seconds for critical pages
- [ ] **API Response**: <1 second for primary endpoints
- [ ] **Database Query**: <500ms for common queries
- [ ] **Search Results**: <2 seconds for basic searches
- [ ] **File Operations**: <5 seconds for standard file sizes

### Resource Utilization
- [ ] **Memory Usage**: Within normal operating ranges
- [ ] **CPU Utilization**: Not exceeding 80% under normal load
- [ ] **Database Connections**: Connection pool healthy
- [ ] **Disk Space**: Adequate free space available
- [ ] **Network Bandwidth**: No saturation detected

## Security Quick Checks

### Basic Security Validation
- [ ] **HTTPS Enforcement**: All traffic over secure connections
- [ ] **Authentication Required**: Protected endpoints require auth
- [ ] **Session Security**: Sessions properly secured
- [ ] **Error Handling**: No sensitive information in error messages
- [ ] **Input Validation**: Basic XSS/injection protection working

### Access Control
- [ ] **Authorization**: Users can only access permitted resources
- [ ] **Role Enforcement**: Role-based permissions working
- [ ] **API Security**: API endpoints properly protected
- [ ] **Admin Functions**: Administrative features secured
- [ ] **Data Privacy**: Personal data properly protected

## Smoke Test Reporting

### Quick Status Report
```markdown
## Smoke Test Results

### Overall Status: ✅ PASS / ❌ FAIL / ⚠️ DEGRADED

### Critical Functions
- **Authentication**: ✅ Users can login successfully
- **Core API**: ✅ Primary endpoints responding <1s
- **Database**: ✅ Read/write operations functional
- **External Services**: ⚠️ Payment gateway slow but functional

### Performance Summary
- **Page Load**: 2.1s average (Target: <3s) ✅
- **API Response**: 750ms average (Target: <1s) ✅
- **Memory Usage**: 65% (Target: <80%) ✅

### Action Items
- Monitor payment gateway performance
- No blocking issues found
```

### Detailed Results
- [ ] **Timestamp**: When tests were executed
- [ ] **Environment**: Which environment was tested
- [ ] **Version**: Application version tested
- [ ] **Duration**: Total execution time
- [ ] **Pass/Fail Count**: Number of tests passed vs failed

## Integration with Deployment Pipeline

### Pre-Deployment Smoke Tests
- [ ] **Staging Validation**: Smoke tests pass in staging
- [ ] **Migration Verification**: Database migrations successful
- [ ] **Configuration Check**: New configs loaded correctly
- [ ] **Dependency Updates**: External service versions compatible
- [ ] **Security Scan**: No new critical vulnerabilities

### Post-Deployment Verification
- [ ] **Production Smoke Test**: Critical functions work in production
- [ ] **Performance Baseline**: Response times within expected ranges
- [ ] **Error Rate**: Application error rate within normal limits
- [ ] **User Traffic**: Real user traffic flowing normally
- [ ] **Monitoring Alerts**: No critical alerts triggered

### Rollback Triggers
- [ ] **Authentication Failure**: Users cannot login
- [ ] **Core API Down**: Primary business functions unavailable
- [ ] **Database Issues**: Data persistence/retrieval failing
- [ ] **Performance Degradation**: Response times >3x baseline
- [ ] **High Error Rate**: Error rate >5% above normal

## IMMEDIATE ROLLBACK IF:
- ❌ Authentication completely broken
- ❌ Core business functions unavailable
- ❌ Database connectivity lost
- ❌ Critical security vulnerability exposed
- ❌ Performance degraded >50% from baseline
- ❌ Error rate >10% above normal baseline
