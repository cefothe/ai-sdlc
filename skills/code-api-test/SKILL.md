---
name: code-api-test
description: API endpoint testing with comprehensive validation.
---


Contract testing and API validation

MANDATORY PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 3 agents simultaneously (API tests can be extensive):
- **test-runner**: Execute API test suite (REQUIRED - prevents context overflow)
- **backend-architect**: Validate API contracts
- **security-auditor**: Check API security (if security-focused testing)

MEMORY MANAGEMENT SAFEGUARDS:
- [ ] ALWAYS use test-runner for API test execution
- [ ] Stream API responses instead of accumulating
- [ ] Limit to 3 concurrent agents maximum
- [ ] Process large API suites in endpoint batches
- [ ] Fall back to sequential if context >85%


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## API Contract Testing

### Schema Validation
- [ ] **Request Schema**: Input validation matches API specification
- [ ] **Response Schema**: Output format matches documented schema
- [ ] **Data Types**: All fields have correct data types
- [ ] **Required Fields**: Mandatory fields properly enforced
- [ ] **Field Constraints**: Length, format, range validations working

### HTTP Protocol Compliance
- [ ] **Status Codes**: Appropriate HTTP status codes returned
- [ ] **Headers**: Required headers present and formatted correctly
- [ ] **Content Types**: MIME types match expected formats
- [ ] **Encoding**: Character encoding handled correctly
- [ ] **Caching**: Cache headers set appropriately

### API Versioning
- [ ] **Version Headers**: API version specified in requests
- [ ] **Backward Compatibility**: Old versions still supported
- [ ] **Version Routing**: Requests routed to correct API version
- [ ] **Deprecation Notices**: Deprecated endpoints properly marked
- [ ] **Migration Path**: Clear upgrade path between versions

## Endpoint Testing Coverage

### CRUD Operations
- [ ] **Create (POST)**: Resource creation with validation
- [ ] **Read (GET)**: Resource retrieval with filtering/pagination
- [ ] **Update (PUT/PATCH)**: Resource modification handling
- [ ] **Delete**: Resource removal with proper cleanup
- [ ] **List**: Collection endpoints with sorting/filtering

### Business Logic Endpoints
- [ ] **Authentication**: Login/logout/token refresh
- [ ] **Authorization**: Permission-based access control
- [ ] **Search**: Query endpoints with various parameters
- [ ] **Batch Operations**: Bulk create/update/delete operations
- [ ] **File Operations**: Upload/download/processing endpoints

### Error Handling
- [ ] **Validation Errors**: 400 Bad Request with clear messages
- [ ] **Authentication Errors**: 401 Unauthorized responses
- [ ] **Authorization Errors**: 403 Forbidden responses
- [ ] **Not Found Errors**: 404 responses for missing resources
- [ ] **Server Errors**: 500 responses with appropriate logging

## API Security Testing

### Authentication Testing
- [ ] **Valid Credentials**: Proper authentication token generation
- [ ] **Invalid Credentials**: Rejected with appropriate error
- [ ] **Token Expiration**: Expired tokens properly handled
- [ ] **Token Refresh**: Token refresh mechanism working
- [ ] **Rate Limiting**: Authentication attempt rate limiting

### Authorization Testing
- [ ] **Role-Based Access**: Users can only access permitted resources
- [ ] **Resource Ownership**: Users can only modify their own resources
- [ ] **Admin Functions**: Administrative endpoints properly secured
- [ ] **Cross-Tenant**: Multi-tenant data isolation enforced
- [ ] **API Key Validation**: API keys validated and scoped correctly

### Input Security
- [ ] **SQL Injection**: Database queries properly parameterized
- [ ] **XSS Prevention**: User input sanitized appropriately
- [ ] **Command Injection**: System commands properly escaped
- [ ] **XML/JSON Injection**: Structured data parsed safely
- [ ] **File Upload Security**: File uploads validated and sandboxed

## API Performance Testing

### Response Time Validation
- [ ] **Individual Endpoints**: Each endpoint responds within SLA
- [ ] **Database Queries**: Query performance acceptable
- [ ] **External Dependencies**: Third-party API calls optimized
- [ ] **Caching**: Cached responses significantly faster
- [ ] **Pagination**: Large result sets paginated efficiently

### Throughput Testing
- [ ] **Concurrent Requests**: Handle multiple simultaneous requests
- [ ] **Rate Limiting**: Rate limits properly enforced
- [ ] **Connection Pooling**: Database connections managed efficiently
- [ ] **Resource Utilization**: CPU/memory usage within limits
- [ ] **Scalability**: Performance scales with increased load

### Edge Case Performance
- [ ] **Large Payloads**: Handle maximum allowed request sizes
- [ ] **Complex Queries**: Optimize complex search/filter operations
- [ ] **Bulk Operations**: Batch processing performance acceptable
- [ ] **Timeout Handling**: Long-running operations time out gracefully
- [ ] **Error Recovery**: System recovers quickly from errors

## API Documentation Validation

### Documentation Accuracy
- [ ] **Endpoint URLs**: All URLs documented correctly
- [ ] **HTTP Methods**: Supported methods clearly specified
- [ ] **Parameters**: All parameters documented with types/constraints
- [ ] **Response Examples**: Example responses match actual output
- [ ] **Error Codes**: All possible error responses documented

### OpenAPI Specification
- [ ] **Schema Compliance**: API matches OpenAPI specification
- [ ] **Generated Documentation**: Auto-generated docs are current
- [ ] **Interactive Testing**: API docs support testing
- [ ] **SDK Generation**: Client SDKs can be generated
- [ ] **Validation Tools**: Specification validates against tools

## Contract Testing with Consumer Services

### Consumer-Driven Contracts
- [ ] **Pact Testing**: Consumer expectations validated
- [ ] **Breaking Change Detection**: Contract violations identified
- [ ] **Version Compatibility**: New versions don't break consumers
- [ ] **Consumer Feedback**: Integration issues communicated
- [ ] **Contract Evolution**: Safe contract evolution process

### Integration Testing
- [ ] **Service Communication**: Services communicate correctly
- [ ] **Data Transformation**: Data formats compatible across services
- [ ] **Error Propagation**: Errors handled appropriately between services
- [ ] **Timeout Configuration**: Service timeouts configured appropriately
- [ ] **Circuit Breakers**: Failure isolation mechanisms working

## API Test Reporting

### Test Results Summary
```markdown
## API Test Results

### Coverage Summary
- **Endpoints Tested**: X/Y endpoints (Z% coverage)
- **Test Cases**: A total test cases executed
- **Pass Rate**: B% (Target: 100%)
- **Performance**: C endpoints within SLA

### Security Validation
- **Authentication**: ✅ All endpoints properly secured
- **Authorization**: ✅ Role-based access working
- **Input Validation**: ✅ No injection vulnerabilities
- **Rate Limiting**: ✅ Rate limits enforced

### Contract Compliance
- **Schema Validation**: ✅ All responses match schema
- **HTTP Standards**: ✅ Proper status codes and headers
- **API Documentation**: ✅ Documentation matches implementation
- **Breaking Changes**: ❌ 2 breaking changes detected

### Performance Results
- **Average Response Time**: Dms (Target: <500ms)
- **95th Percentile**: Ems (Target: <1000ms)
- **Throughput**: F req/sec (Target: >G req/sec)
- **Error Rate**: H% (Target: <0.1%)
```

### Issue Tracking
- [ ] **Breaking Changes**: Document API changes that break contracts
- [ ] **Performance Issues**: Identify slow endpoints
- [ ] **Security Vulnerabilities**: Report security findings
- [ ] **Documentation Gaps**: Missing or incorrect documentation
- [ ] **Test Failures**: Failed test cases requiring attention

## Continuous API Testing

### CI/CD Integration
- [ ] **Automated Execution**: API tests run on every deployment
- [ ] **Contract Validation**: Consumer contracts validated automatically
- [ ] **Performance Regression**: API performance monitored over time
- [ ] **Documentation Updates**: API docs updated automatically
- [ ] **Breaking Change Alerts**: Team notified of contract violations

### API Monitoring
- [ ] **Health Checks**: Continuous API health monitoring
- [ ] **Performance Monitoring**: Real-time API performance tracking
- [ ] **Error Rate Monitoring**: API error rates tracked continuously
- [ ] **Usage Analytics**: API usage patterns analyzed
- [ ] **SLA Monitoring**: Service level agreements monitored

## NEVER RELEASE API IF:
- ❌ Any security vulnerabilities detected
- ❌ Breaking changes without proper versioning
- ❌ Response times exceed SLA requirements
- ❌ Authentication/authorization not working
- ❌ Contract tests failing with consumer services
- ❌ Documentation doesn't match implementation
