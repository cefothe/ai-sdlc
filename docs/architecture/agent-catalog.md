# Agent Catalog

Complete reference of all available specialized agents for Claude Code.

## Core Analysis Agents (Always Use)

### file-analyzer
**For reading and analyzing files**

Expert in extracting critical information from files, logs, and verbose outputs. Provides concise summaries while preserving essential details and dramatically reducing context usage.

**When to Use**:
- Files >1000 lines
- Log file analysis
- Verbose output summarization

**Context Awareness**: MUST flag violations based on project context - performance anti-patterns, architectural violations, security issues as defined in context files

**Context File Locations** (resolved by ExecutionContext):
- Global: `~/.claude/contexts/{PROJECT_TYPE}.yaml`
- Local: `project/.claude/contexts/{PROJECT_TYPE}.yaml`
- Hybrid: Local overrides global

### code-analyzer
**For code analysis and bug research**

Expert in code analysis, logic tracing, and vulnerability detection. Specializes in deep-dive analysis while maintaining concise summaries for context preservation.

**When to Use**:
- Multi-file logic tracing
- Bug investigation
- Vulnerability detection

**Context Awareness**: MUST detect anti-patterns based on project context - concurrency violations, data type misuse, security gaps, performance bottlenecks as defined in project-specific rules

### test-runner
**For test execution and analysis**

Ensures full test output capture, clean conversation flow, optimized context usage, and surfaces all issues without approval dialog interruptions.

**When to Use**:
- All test execution
- Test failure analysis
- Test coverage reporting

**Context Awareness**: MUST detect project context and adapt testing strategy - high-frequency systems require no mocks and cluster testing, regulated systems need approval workflow testing, web apps need component and E2E testing

---

## Specialized Architecture Agents

### backend-architect
**For API and system design**

Expert in RESTful API design, microservice boundaries, database schemas.

**When to Use**:
- System architecture design
- API design review
- Microservice planning

**Context Awareness**: MUST validate architectural patterns based on project context - performance requirements, security constraints, scalability patterns

### cloud-architect
**For infrastructure design**

Expert in AWS/Azure/GCP infrastructure design, cost optimization, and scalability planning.

**When to Use**:
- Infrastructure architecture
- Cloud migration planning
- Cost optimization

### architect-review
**For architectural validation**

Expert in architectural consistency analysis and pattern validation.

**When to Use**:
- Design review
- Pattern validation
- Architecture consistency checks

---

## Performance & Security Agents

### performance-engineer
**For performance optimization**

Expert in observability, load testing, caching strategies, Core Web Vitals.

**When to Use**:
- Performance optimization
- Load testing
- Profiling analysis

**Context Awareness**: Adapts profiling tools based on project context - high-frequency systems use specialized profilers and mechanical sympathy validation, web applications focus on Core Web Vitals

### backend-security-coder
**For backend security**

Expert in secure backend development, authentication, authorization, and vulnerability prevention.

**When to Use**:
- Backend security implementation
- Authentication/authorization
- Security code review

### frontend-security-coder
**For frontend security**

Expert in client-side security, XSS prevention, CSRF protection.

**When to Use**:
- Frontend security implementation
- XSS/CSRF prevention
- Client-side security review

### security-auditor
**For comprehensive security auditing**

Expert in DevSecOps, vulnerability assessment, threat modeling, and compliance frameworks.

**When to Use**:
- Security audits
- Compliance validation
- Threat modeling

---

## DevOps & Deployment Agents

### deployment-engineer
**For CI/CD and deployment**

Expert in CI/CD pipelines, GitOps, progressive delivery, container security.

**When to Use**:
- CI/CD pipeline design
- Deployment automation
- GitOps implementation

### devops-troubleshooter
**For infrastructure debugging**

Expert in infrastructure debugging, monitoring, and operational issues.

**When to Use**:
- Infrastructure troubleshooting
- Incident response
- Operational debugging

### kubernetes-architect
**For container orchestration**

Expert in cloud-native infrastructure with Kubernetes and GitOps.

**When to Use**:
- Kubernetes architecture
- Container orchestration
- Cloud-native design

### terraform-specialist
**For Infrastructure as Code**

Expert in advanced IaC automation, state management, and enterprise infrastructure patterns.

**When to Use**:
- Terraform/OpenTofu development
- Infrastructure automation
- State management

### database-admin
**For database operations**

Expert in modern cloud databases, automation, and reliability engineering.

**When to Use**:
- Database architecture
- Performance tuning
- Backup/recovery planning

### database-optimizer
**For database performance**

Expert in query optimization, indexing strategies, and performance tuning.

**When to Use**:
- Query optimization
- Index design
- Performance troubleshooting

### network-engineer
**For networking**

Expert in cloud networking, security architectures, and performance optimization.

**When to Use**:
- Network design
- Connectivity troubleshooting
- Security architecture

### incident-responder
**For SRE incident response**

Expert SRE incident responder specializing in rapid problem resolution and modern observability.

**When to Use**:
- Production incidents
- Post-mortem analysis
- SRE practices

---

## Language Specialists

### java-pro
**For Java development**

Java 21+ expert who MUST detect project context and adapt coding standards accordingly.

**Context Adaptations**:
- **High-frequency systems**: Single-threaded execution, primitive types, mechanical sympathy
- **Regulated systems**: Proper command routing, approval workflows, audit trails
- **Enterprise systems**: Maintainability, proper error handling, standard patterns

### typescript-pro
**For TypeScript development**

Expert in type-safe JavaScript development who MUST detect project context and generate types matching backend requirements.

**Context Adaptations**:
- **Real-time systems**: Strict timestamp and data types
- **Regulated systems**: Approval state and audit types
- **Web applications**: Component props and API response types

### python-pro
**For Python development**

Master Python 3.12+ with modern features, async programming, and performance optimization.

**When to Use**:
- Python implementation
- Async optimization
- Python refactoring

### golang-pro
**For Go development**

Expert in concurrent programming with goroutines and channels.

**When to Use**:
- Go implementation
- Concurrency patterns
- Performance optimization

### rust-pro
**For Rust development**

Expert in memory-safe systems programming with ownership patterns.

**When to Use**:
- Rust implementation
- Systems programming
- Memory safety

### javascript-pro
**For JavaScript development**

Master modern JavaScript with ES6+, async patterns, and Node.js APIs.

**When to Use**:
- JavaScript optimization
- Async debugging
- Node.js development

### ruby-pro
**For Ruby development**

Idiomatic Ruby with metaprogramming, Rails patterns, and performance optimization.

**When to Use**:
- Ruby/Rails development
- Ruby refactoring
- Performance optimization

### php-pro
**For PHP development**

Modern PHP with generators, iterators, SPL data structures, and OOP features.

**When to Use**:
- PHP development
- Performance optimization
- Modern PHP patterns

### scala-pro
**For Scala development**

Enterprise Scala with functional programming, distributed systems, and big data processing.

**When to Use**:
- Scala development
- Functional programming
- Akka/Spark applications

### elixir-pro
**For Elixir development**

Idiomatic Elixir with OTP patterns, supervision trees, and Phoenix LiveView.

**When to Use**:
- Elixir/Phoenix development
- OTP design
- Distributed systems

### csharp-pro
**For C# development**

Modern C# with advanced features like records, pattern matching, and async/await.

**When to Use**:
- .NET development
- C# refactoring
- Enterprise applications

### c-pro
**For C development**

Efficient C with proper memory management, pointer arithmetic, and system calls.

**When to Use**:
- System programming
- Embedded systems
- Performance-critical code

### cpp-pro
**For C++ development**

Idiomatic C++ with modern features, RAII, smart pointers, and STL algorithms.

**When to Use**:
- C++ development
- Memory safety
- Performance optimization

---

## Frontend & UI/UX

### frontend-developer
**For React/UI development**

React 19, Next.js 15 expert who MUST detect UI context and adapt accordingly.

**Context Adaptations**:
- **Real-time systems**: WebSocket subscriptions, virtual scrolling, minimal re-renders
- **Regulated systems**: Approval workflows, audit trails, role-based access
- **Web applications**: Responsive design, accessibility, performance

### ui-ux-designer
**For design systems**

Interface designs, wireframes, design systems, and accessibility standards.

**When to Use**:
- Design system creation
- User flow design
- Accessibility planning

### ui-visual-validator
**For visual validation**

Rigorous visual validation, UI testing, and design system compliance.

**When to Use**:
- Visual regression testing
- Design system validation
- UI component verification

### dx-optimizer
**For developer experience**

Developer experience improvements, tooling, and workflow optimization.

**When to Use**:
- Tooling improvements
- Workflow optimization
- Developer onboarding

### mermaid-expert
**For diagrams**

Creates Mermaid diagrams for flowcharts, sequences, ERDs, and architectures.

**When to Use**:
- Visual documentation
- System diagrams
- Process flows

---

## Web Frameworks

### django-pro
**For Django development**

Django 5.x with async views, DRF, Celery, and Django Channels.

**When to Use**:
- Django application development
- DRF API design
- Django optimization

### fastapi-pro
**For FastAPI development**

High-performance async APIs with FastAPI, SQLAlchemy 2.0, and Pydantic V2.

**When to Use**:
- FastAPI development
- Async optimization
- API architecture

### graphql-architect
**For GraphQL**

Master modern GraphQL with federation, performance optimization, and enterprise security.

**When to Use**:
- GraphQL schema design
- Federation architecture
- Performance optimization

---

## Mobile & Gaming

### mobile-developer
**For mobile apps**

React Native, Flutter, or native mobile apps with modern architecture patterns.

**When to Use**:
- Cross-platform development
- Native integrations
- App optimization

### flutter-expert
**For Flutter development**

Flutter with Dart 3, advanced widgets, and multi-platform deployment.

**When to Use**:
- Flutter applications
- Cross-platform UI
- Widget optimization

### ios-expert
**For iOS development**

Native iOS with Swift/SwiftUI and iOS 18 features.

**When to Use**:
- iOS app development
- SwiftUI implementation
- App Store optimization

### unity-developer
**For Unity games**

Unity games with optimized C# scripts, efficient rendering, and proper asset management.

**When to Use**:
- Unity game development
- Performance optimization
- Cross-platform builds

### minecraft-bukkit-pro
**For Minecraft plugins**

Minecraft server plugin development with Bukkit, Spigot, and Paper APIs.

**When to Use**:
- Plugin development
- Server-side features
- Gameplay mechanics

---

## Data & Analytics

### data-engineer
**For data pipelines**

Scalable data pipelines, warehouses, and real-time streaming architectures.

**When to Use**:
- Data pipeline design
- ETL development
- Streaming architectures

### data-scientist
**For analytics & ML**

Advanced analytics, machine learning, and statistical modeling.

**When to Use**:
- Data analysis
- ML modeling
- Statistical analysis

### ml-engineer
**For production ML**

Production ML systems with PyTorch, TensorFlow, and modern ML frameworks.

**When to Use**:
- ML deployment
- Model serving
- Inference optimization

### mlops-engineer
**For ML operations**

ML pipelines, experiment tracking, model registries, and automated training.

**When to Use**:
- ML infrastructure
- Experiment management
- Pipeline automation

### ai-engineer
**For AI applications**

Production LLM applications, advanced RAG systems, and intelligent agents.

**When to Use**:
- LLM features
- Chatbot development
- AI-powered applications

### sql-pro
**For SQL development**

Modern SQL with cloud-native databases, OLTP/OLAP optimization.

**When to Use**:
- Query optimization
- Database design
- Complex analysis

### prompt-engineer
**For LLM optimization**

Advanced prompting techniques, LLM optimization, and AI system design.

**When to Use**:
- Prompt optimization
- AI feature development
- System prompts

---

## Business & Product

### business-analyst
**For business analytics**

AI-powered analytics, real-time dashboards, and data-driven insights.

**When to Use**:
- Business intelligence
- KPI frameworks
- Strategic analysis

### quant-analyst
**For quantitative finance**

Financial models, trading strategies, and market analysis.

**When to Use**:
- Trading algorithms
- Risk metrics
- Portfolio optimization

### risk-manager
**For risk management**

Portfolio risk monitoring, hedging strategies, and position limits.

**When to Use**:
- Risk assessment
- Trade tracking
- Portfolio protection

### payment-integration
**For payment systems**

Stripe, PayPal, and payment processor integration with PCI compliance.

**When to Use**:
- Payment implementation
- Subscription billing
- Checkout flows

---

## Marketing & SEO

### content-marketer
**For content marketing**

AI-powered content creation, omnichannel distribution, and SEO optimization.

**When to Use**:
- Content strategy
- Marketing campaigns
- SEO optimization

### seo-content-writer
**For SEO content**

SEO-optimized content based on keywords and topic briefs.

**When to Use**:
- Content creation
- Keyword optimization
- Blog writing

### seo-content-planner
**For content strategy**

Content outlines, topic clusters, and content calendars.

**When to Use**:
- Content planning
- Topic research
- Editorial calendars

### seo-keyword-strategist
**For keyword research**

Keyword analysis, density calculation, and semantic variations.

**When to Use**:
- Keyword research
- Content optimization
- LSI keywords

### seo-meta-optimizer
**For meta tags**

Meta titles, descriptions, and URL optimization.

**When to Use**:
- Meta tag creation
- SERP optimization
- Click-through improvement

### seo-structure-architect
**For content structure**

Header hierarchy, schema markup, and internal linking.

**When to Use**:
- Content structure
- Schema implementation
- Internal linking

### seo-snippet-hunter
**For featured snippets**

Formats content for featured snippets and SERP features.

**When to Use**:
- Snippet optimization
- SERP feature targeting
- Question-based content

### seo-content-auditor
**For content quality**

E-E-A-T signals, content quality analysis, and improvement recommendations.

**When to Use**:
- Content review
- Quality assessment
- E-E-A-T improvement

### seo-content-refresher
**For content updates**

Identifies outdated elements and suggests updates for freshness.

**When to Use**:
- Content updates
- Freshness improvement
- Stat updates

### seo-cannibalization-detector
**For keyword conflicts**

Analyzes keyword overlap and potential cannibalization issues.

**When to Use**:
- Keyword analysis
- Content differentiation
- Cannibalization fixes

### seo-authority-builder
**For authority building**

E-E-A-T signal analysis and authority-building strategies.

**When to Use**:
- Authority improvement
- Trust signals
- YMYL content

---

## Support & Operations

### customer-support
**For customer service**

AI-powered support, conversational AI, and omnichannel experiences.

**When to Use**:
- Support automation
- Chatbot development
- Customer experience

### hr-pro
**For HR operations**

Ethical HR for hiring, onboarding, PTO, performance, and employee relations.

**When to Use**:
- HR policy creation
- Hiring processes
- Performance management

### legal-advisor
**For legal documentation**

Privacy policies, terms of service, GDPR compliance, and legal notices.

**When to Use**:
- Legal documentation
- Compliance texts
- Privacy policies

### sales-automator
**For sales automation**

Cold emails, follow-ups, proposals, and sales scripts.

**When to Use**:
- Sales outreach
- Email campaigns
- Proposal creation

---

## Specialized Tools

### blockchain-developer
**For Web3**

Production Web3 applications, smart contracts, and decentralized systems.

**When to Use**:
- Smart contracts
- DeFi protocols
- Web3 apps

### legacy-modernizer
**For legacy systems**

Refactors legacy codebases, migrates frameworks, and implements gradual modernization.

**When to Use**:
- Legacy migrations
- Framework updates
- Technical debt

### search-specialist
**For research**

Advanced web research with multi-source verification and synthesis.

**When to Use**:
- Deep research
- Information gathering
- Competitive analysis

### reference-builder
**For technical docs**

Exhaustive technical references and API documentation.

**When to Use**:
- API documentation
- Configuration guides
- Technical specifications

### tutorial-engineer
**For educational content**

Step-by-step tutorials and educational content from code.

**When to Use**:
- Tutorial creation
- Onboarding guides
- Feature documentation

### test-automator
**For test automation**

AI-powered test automation with self-healing tests and comprehensive quality engineering.

**When to Use**:
- Test automation
- Quality assurance
- Test strategy

### tdd-orchestrator
**For TDD**

Enforces red-green-refactor discipline and TDD best practices.

**When to Use**:
- TDD implementation
- Test governance
- Quality enforcement

### parallel-worker
**For parallel execution**

Executes parallel work streams in git worktrees for multi-stream execution.

**When to Use**:
- Multiple independent tasks
- Parallel development
- Work stream isolation

### context-manager
**For multi-agent coordination**

Synthesizes findings from multiple parallel agents into unified action plans.

**When to Use**:
- Complex multi-agent workflows
- Context synthesis
- Parallel coordination

### debugger
**For debugging**

Systematic debugging approaches and problem isolation.

**When to Use**:
- Bug investigation
- Problem isolation
- Debugging sessions

### error-detective
**For error analysis**

Error pattern recognition and root cause analysis.

**When to Use**:
- Error investigation
- Pattern analysis
- Root cause analysis

### code-review-architect
**For code review**

Comprehensive architectural and implementation reviews before deployment.

**When to Use**:
- Code review
- Architectural validation
- Pre-deployment checks

### code-analyzer
**For code analysis**

Deep code analysis for bugs, logic tracing, and suspicious behavior investigation.

**When to Use**:
- Bug investigation
- Logic tracing
- Code analysis

### file-analyzer
**For file analysis**

Analyzes and summarizes files, directories, and system architectures.

**When to Use**:
- File analysis
- Log analysis
- Context optimization

### front-end-master
**For frontend expertise**

World-class frontend expert for complex UI components and performance optimization.

**When to Use**:
- Complex UI components
- Performance optimization
- Frontend architecture

---

## See Also

- [Agent Protocols](./agent-protocols.md)
- [Parallel Execution](./parallel-execution.md)
- [Command Reference](./command-reference.md)
