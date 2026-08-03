// Baseline .ai-sdlc/ resource stubs written by `init`. Each is schema-valid
// against spec/schemas/ and carries the documented defaults so a freshly
// scaffolded repo behaves identically to one with no config. Kept as string
// templates (not YAML.dump) so comments survive for the operator to edit.

const { join } = require('node:path');

function dorConfig() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: DorConfig
metadata:
  name: ai-sdlc-dor
spec:
  rubricVersion: v1
  # Start in warn-only so brownfield adoption doesn't block day one; flip to
  # enforce once the backlog is triaged.
  evaluationMode: warn-only
  notifications:
    authorChannel: true
  staleness:
    warnAfterDays: 14
    closeAfterDays: 28
    closedLabel: 'closed-as-stale-dor'
  blastRadiusThreshold: 3
  autoPassRules:
    - kind: signal-pipeline-generated
      sources: ['ai-sdlc/signal-pipeline']
      gatesSkipped: [1, 4, 5, 6]
      gatesRetained: [2, 3, 7]
`;
}

function qualityGate() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: QualityGate
metadata:
  name: default
spec:
  scope:
    authorTypes: [ai, human]
  gates:
    - name: promise-verification
      # Promise verification runs as an ADVISORY signal first (R5/R15: never a
      # post-hoc feedback loop on the author). Promote to soft-mandatory only
      # after measurement proves non-harm.
      enforcement: advisory
      rule:
        metric: promise.broken_count
        operator: '=='
        threshold: 0
`;
}

function autonomyPolicy() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: AutonomyPolicy
metadata:
  name: default
spec:
  levels:
    - level: 0
      name: supervised
      permissions:
        read: true
        write: true
        execute: false
      guardrails:
        requireApproval: true
        maxLinesPerPR: 400
    - level: 1
      name: assisted
      permissions:
        read: true
        write: true
        execute: true
      guardrails:
        requireApproval: true
        maxLinesPerPR: 800
`;
}

function agentRole() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: AgentRole
metadata:
  name: developer
spec:
  role: developer
  goal: Execute a well-specified backlog contract deterministically.
  backstory: A senior engineer who implements exactly what the DoR-passed task specifies.
  tools: [Read, Write, Edit, Bash, Grep, Glob]
  constraints:
    requireTests: true
    maxFilesPerChange: 40
    blockedActions: [force-push, history-rewrite]
`;
}

function adapterBinding() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: AdapterBinding
metadata:
  name: source-control
spec:
  interface: SourceControl
  type: github
  version: 1.0.0
`;
}

function capabilities() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: CapabilityMap
metadata:
  name: default
spec:
  stages:
    plan:
      provider: { type: skill, name: code-plan }
    implement:
      provider: { type: agent, name: claude, harness: claude }
      routing:
        - when: { languages: [java] }
          provider: { type: agent, name: java-pro, harness: claude }
        - when: { languages: [typescript] }
          provider: { type: agent, name: typescript-pro, harness: claude }
    review:
      team: true
      skill: code-review-pr
      providers:
        - { role: code-reviewer, type: agent, name: code-reviewer, harness: codex }
        - { role: test-reviewer, type: agent, name: test-automator, harness: codex }
        - { role: security-reviewer, type: agent, name: security-auditor, harness: codex }
      routing:
        - when: { javaTestFiles: true }
          replaceRole: test-reviewer
          addProvider: { role: test-reviewer, type: agent, name: qa-code-reviewer, harness: codex }
    test:
      provider: { type: agent, name: test-runner }
`;
}

// Returns { relPath: content } for all baseline files under .ai-sdlc/.
function baseline() {
  const d = '.ai-sdlc';
  return {
    [join(d, 'dor-config.yaml')]: dorConfig(),
    [join(d, 'quality-gate.yaml')]: qualityGate(),
    [join(d, 'autonomy-policy.yaml')]: autonomyPolicy(),
    [join(d, 'agent-role.yaml')]: agentRole(),
    [join(d, 'adapter-binding.yaml')]: adapterBinding(),
    [join(d, 'capabilities.yaml')]: capabilities(),
  };
}

function backlogConfig() {
  return `statuses:
  - To Do
  - In Progress
  - Done
idPrefix: AISDLC
`;
}

function workspaceStub() {
  return `apiVersion: ai-sdlc.io/v1alpha1
kind: Workspace
metadata:
  name: workspace
spec:
  configScope: shared
  backlogRoot: ./backlog
  repos:
    - id: app
      path: ./app
      defaultBranch: main
  crossRepo:
    depGraphSpanning: false
`;
}

module.exports = { baseline, backlogConfig, workspaceStub, capabilities, dorConfig, qualityGate, autonomyPolicy, agentRole, adapterBinding };
