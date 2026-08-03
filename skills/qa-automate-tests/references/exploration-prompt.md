# Exploration Prompt Template

Use this as the prompt when spawning the exploration sub-agent via Task tool for Phase 0.

Substitute `{PLACEHOLDERS}` with actual values.

---

```
Explore UI for test automation locator discovery.

**Base URL**: {BASE_URL}
**Output Directory**: {OUTPUT_DIR}
**Workflow**: Read these files for context, then follow the explore-ui workflow:
1. ~/.claude/skills/qa-explore-ui/SKILL.md — exploration workflow and output format
2. ~/.claude/contexts/test-automation/guides/MCP_USAGE_GUIDE.yaml — MCP tools reference and locator discovery patterns

**UI-WEB Test Cases to explore**:
{For each UI-WEB test case: test ID, flow description, Given/When/Then steps}

For each test case:
a. Navigate to the target URL using browser_navigate
b. Use browser_snapshot to discover element locators and browser_take_screenshot to capture key states
c. Map discovered attributes to framework Locator strategies (testId > id > css > xpath)
d. Save results to {OUTPUT_DIR}/exploration-{test-id}.yaml

After all test cases:
- Create {OUTPUT_DIR}/exploration-results.md summarizing discovered locators and missing data-testid attributes (with component paths where identifiable)
```
