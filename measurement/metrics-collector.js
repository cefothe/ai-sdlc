const fs = require('fs').promises;
const path = require('path');

const FILLER_PATTERNS = [
  /^(Let me|I'll|I'm going to|I will|I can|I've|I would|I should)\b/i,
  /^(Here's|Here are|Here is|As you can see|As mentioned|As noted)\b/i,
  /^(In summary|To summarize|Overall|In conclusion|That covers)\b/i,
  /^(Great|Perfect|Excellent|Certainly|Sure|Of course|Absolutely)\b/i,
  /^(Now,? let's|First,? let's|Next,? let's|Finally,? let's)\b/i,
  /(Hope this helps|Let me know if|Feel free to|Don't hesitate)\b/i,
];

class MetricsCollector {
  constructor(outputDir) {
    if (!outputDir) {
      throw new Error('outputDir is required');
    }
    this.outputDir = outputDir;
  }

  analyzeOutput(text) {
    if (typeof text !== 'string') {
      throw new Error('text must be a string');
    }
    const todoCount = (text.match(/\/\/\s*TODO[:\s]/gi) || []).length
      + (text.match(/#\s*TODO[:\s]/gi) || []).length;
    const fixmeCount = (text.match(/\/\/\s*FIXME[:\s]/gi) || []).length
      + (text.match(/#\s*FIXME[:\s]/gi) || []).length;
    const hasErrorHandling = /try\s*\{/.test(text) || /\.catch\s*\(/.test(text);
    const hasTests = /\.test\.(js|ts)|\.spec\.(js|ts)|describe\s*\(|it\s*\(|test\s*\(/.test(text);
    const docsReferenced = /CLAUDE\.md|README\.md|protocol/i.test(text);

    // Density metrics
    const fillerRatio = this.computeFillerRatio(text);
    const textLines = text.split('\n');
    let inCodeBlock = false;
    let codeLineCount = 0;
    for (const line of textLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock && trimmed) codeLineCount++;
    }
    const totalLines = textLines.filter(l => l.trim()).length;
    const proseLineCount = totalLines - codeLineCount
      - textLines.filter(l => /^\s*#{1,6}\s/.test(l)).length;
    const fillerLineCount = Math.round(fillerRatio * Math.max(proseLineCount, 0));

    return {
      todo_count: todoCount,
      fixme_count: fixmeCount,
      error_handling_present: hasErrorHandling,
      tests_present: hasTests,
      docs_referenced: docsReferenced,
      filler_ratio: fillerRatio,
      prose_line_count: Math.max(proseLineCount, 0),
      filler_line_count: fillerLineCount,
      code_line_ratio: totalLines > 0 ? codeLineCount / totalLines : 0,
    };
  }

  computeQualityScore(analysis) {
    let score = 10;
    score -= Math.min(analysis.todo_count * 1.5, 3);
    score -= Math.min(analysis.fixme_count * 1.5, 3);
    if (!analysis.error_handling_present) score -= 2;
    if (!analysis.tests_present) score -= 3;
    if (!analysis.docs_referenced) score -= 1;
    return Math.max(0, Math.round(score * 10) / 10);
  }

  computeFillerRatio(text) {
    if (typeof text !== 'string') {
      throw new Error('text must be a string');
    }
    if (!text.trim()) return 0;

    const lines = text.split('\n');
    let inCode = false;
    let proseLines = 0;
    let fillerLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode || !trimmed || /^#{1,6}\s/.test(trimmed)) continue;

      proseLines++;
      for (const pattern of FILLER_PATTERNS) {
        if (pattern.test(trimmed)) {
          fillerLines++;
          break;
        }
      }
    }

    return proseLines > 0 ? fillerLines / proseLines : 0;
  }

  async writeRecord(record) {
    await fs.mkdir(this.outputDir, { recursive: true });
    const enriched = {
      ...record,
      timestamp: new Date().toISOString(),
    };
    const line = JSON.stringify(enriched) + '\n';
    await fs.appendFile(
      path.join(this.outputDir, 'metrics.jsonl'),
      line,
      'utf8'
    );
  }
}

module.exports = { MetricsCollector };
