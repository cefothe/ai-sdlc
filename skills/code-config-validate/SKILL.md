---
name: code-config-validate
description: Configuration validation across environments.
---


Configuration and secret management validation

MANDATORY PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 3 agents simultaneously (configuration analysis can be complex):
- **security-auditor**: Validate security configuration (REQUIRED for security validation)
- **file-analyzer**: Review config files (REQUIRED for large config files)
- **code-analyzer**: Check config usage patterns (if codebase analysis needed)

MEMORY MANAGEMENT SAFEGUARDS:
- [ ] ALWAYS use file-analyzer for large config files
- [ ] Use security-auditor for comprehensive security checks
- [ ] Limit to 3 concurrent agents maximum
- [ ] Process configuration in environment batches
- [ ] Fall back to sequential if context >85%


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Configuration Security Validation

### Secret Management
- [ ] **No Hardcoded Secrets**: No credentials in source code
- [ ] **Environment Variables**: Secrets loaded from secure environment
- [ ] **Secret Rotation**: Secrets can be rotated without code changes
- [ ] **Access Control**: Only necessary services can access secrets
- [ ] **Encryption at Rest**: Secrets encrypted in storage

### Configuration Files
- [ ] **No Sensitive Data**: No secrets in configuration files
- [ ] **Version Control Safety**: Config files safe to commit
- [ ] **Environment Separation**: Different configs for each environment
- [ ] **Default Values**: Sensible defaults for non-sensitive settings
- [ ] **Validation**: Configuration values validated at startup

### Access Patterns
- [ ] **Principle of Least Privilege**: Minimum required permissions
- [ ] **Service Isolation**: Services only access their own configuration
- [ ] **Audit Logging**: Configuration access logged appropriately
- [ ] **Change Tracking**: Configuration changes tracked and versioned
- [ ] **Rollback Capability**: Can revert configuration changes quickly

## Environment Configuration Validation

### Environment Consistency
- [ ] **Development**: Local development environment properly configured
- [ ] **Staging**: Staging mirrors production configuration structure
- [ ] **Production**: Production configuration secure and optimized
- [ ] **Testing**: Test environment isolated and configured safely
- [ ] **Disaster Recovery**: DR environment configuration validated

### Configuration Drift Detection
- [ ] **Baseline Comparison**: Current config matches expected baseline
- [ ] **Change Documentation**: All configuration changes documented
- [ ] **Approval Process**: Configuration changes follow approval workflow
- [ ] **Automated Validation**: Config validation runs automatically
- [ ] **Drift Alerts**: Team alerted when configuration drifts

### Infrastructure as Code
- [ ] **Terraform/CloudFormation**: Infrastructure config in version control
- [ ] **Ansible/Chef**: Configuration management automated
- [ ] **Kubernetes**: K8s configurations validated and secure
- [ ] **Docker**: Container configurations optimized and secure
- [ ] **CI/CD Pipeline**: Deployment configuration automated

## Application Configuration Validation

### Configuration Loading
- [ ] **Startup Validation**: App validates configuration at startup
- [ ] **Required Settings**: All required configuration present
- [ ] **Type Validation**: Configuration values have correct types
- [ ] **Range Validation**: Numeric values within acceptable ranges
- [ ] **Format Validation**: Strings match expected formats (URLs, emails, etc.)

### Database Configuration
- [ ] **Connection Strings**: Database connections properly configured
- [ ] **Connection Pooling**: Connection pool settings optimized
- [ ] **Timeout Settings**: Query and connection timeouts set appropriately
- [ ] **SSL/Encryption**: Database connections encrypted
- [ ] **Migration Configuration**: Database migration settings correct

### External Service Configuration
- [ ] **API Endpoints**: External service URLs configured correctly
- [ ] **Authentication**: API keys and credentials properly configured
- [ ] **Timeout Settings**: External service timeouts set appropriately
- [ ] **Retry Configuration**: Retry policies configured for resilience
- [ ] **Circuit Breaker**: Fault tolerance mechanisms configured

## Security Configuration Validation

### HTTPS and TLS
- [ ] **HTTPS Enforcement**: All traffic forced to HTTPS
- [ ] **TLS Version**: Minimum TLS version enforced (1.2+)
- [ ] **Certificate Validation**: SSL certificates valid and current
- [ ] **HSTS Headers**: HTTP Strict Transport Security enabled
- [ ] **Certificate Pinning**: Certificate pinning configured where appropriate

### Authentication Configuration
- [ ] **Session Security**: Session configuration secure
- [ ] **JWT Configuration**: JWT tokens properly configured
- [ ] **OAuth Settings**: OAuth providers configured securely
- [ ] **Password Policies**: Password requirements enforced
- [ ] **Multi-factor Authentication**: MFA configuration validated

### Authorization Configuration
- [ ] **Role-Based Access**: RBAC properly configured
- [ ] **Permission Management**: Permissions correctly assigned
- [ ] **Resource Access**: Access controls properly configured
- [ ] **API Security**: API endpoints properly secured
- [ ] **Admin Access**: Administrative access properly restricted

## Performance Configuration Validation

### Caching Configuration
- [ ] **Cache Settings**: Caching properly configured for performance
- [ ] **Cache Expiration**: TTL values set appropriately
- [ ] **Cache Keys**: Cache key strategies optimized
- [ ] **Cache Invalidation**: Cache invalidation working correctly
- [ ] **Memory Allocation**: Cache memory usage within limits

### Database Performance
- [ ] **Connection Pooling**: Pool size optimized for load
- [ ] **Query Optimization**: Database queries optimized
- [ ] **Index Configuration**: Database indexes properly configured
- [ ] **Replication**: Database replication configured correctly
- [ ] **Backup Configuration**: Backup schedules and retention configured

### Application Performance
- [ ] **Memory Settings**: JVM/runtime memory settings optimized
- [ ] **Thread Pool**: Thread pool sizes configured appropriately
- [ ] **Garbage Collection**: GC settings optimized (Java/C#)
- [ ] **Resource Limits**: Resource limits configured to prevent exhaustion
- [ ] **Monitoring**: Performance monitoring properly configured

## Configuration Management Process

### Change Management
- [ ] **Change Requests**: Configuration changes require approval
- [ ] **Impact Assessment**: Change impact evaluated before implementation
- [ ] **Testing**: Configuration changes tested before production
- [ ] **Rollback Plan**: Rollback procedure for configuration changes
- [ ] **Change Documentation**: All changes properly documented

### Version Control
- [ ] **Configuration in Git**: Configuration files in version control
- [ ] **Branching Strategy**: Configuration follows branching model
- [ ] **Code Reviews**: Configuration changes peer-reviewed
- [ ] **Merge Process**: Controlled merge process for configuration
- [ ] **Tag Management**: Configuration versions tagged appropriately

### Deployment Pipeline
- [ ] **Automated Deployment**: Configuration deployed automatically
- [ ] **Environment Promotion**: Configuration promoted through environments
- [ ] **Validation Gates**: Configuration validated at each stage
- [ ] **Approval Gates**: Required approvals for production changes
- [ ] **Deployment Monitoring**: Configuration deployment monitored

## Configuration Validation Report

### Security Assessment
```markdown
## Configuration Security Report

### Secret Management
- **Hardcoded Secrets**: ✅ None found in codebase
- **Environment Variables**: ✅ All secrets in environment
- **Access Control**: ✅ Principle of least privilege applied
- **Encryption**: ✅ Secrets encrypted at rest

### Configuration Security
- **HTTPS Enforcement**: ✅ All traffic over HTTPS
- **TLS Configuration**: ✅ TLS 1.2+ enforced
- **Authentication**: ✅ Secure session configuration
- **Authorization**: ✅ RBAC properly implemented

### Issues Found
- Certificate expires in 30 days (needs renewal)
- Development environment using production-like secrets (should use test data)
```

### Performance Assessment
- [ ] **Cache Hit Rates**: Cache performance within targets
- [ ] **Database Performance**: Query response times acceptable
- [ ] **Memory Usage**: Application memory usage optimized
- [ ] **Connection Pooling**: Database connections properly managed
- [ ] **Resource Utilization**: CPU/memory within acceptable ranges

### Compliance Validation
- [ ] **Regulatory Compliance**: Configuration meets regulatory requirements
- [ ] **Industry Standards**: Follows industry best practices
- [ ] **Company Policies**: Adheres to company security policies
- [ ] **Audit Requirements**: Configuration audit trail maintained
- [ ] **Data Protection**: GDPR/privacy requirements met

## NEVER DEPLOY WITH:
- ❌ Hardcoded secrets or credentials in code
- ❌ Production secrets in non-production environments
- ❌ Weak TLS/SSL configuration
- ❌ Excessive permissions or access rights
- ❌ Missing or invalid security headers
- ❌ Unencrypted sensitive configuration data
