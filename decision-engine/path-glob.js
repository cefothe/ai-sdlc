// Minimal, dependency-free path globbing for gate scoping (DoD `paths:` and ADR
// relevance). Repo-relative, forward-slash paths only.
//
//   **        any number of path segments (including none)
//   *         any run of characters within one segment
//   ?         one character within a segment
//   dir/      trailing slash = everything under dir (dir/**)
//
// Anything else matches literally. A pattern with no glob characters and no
// trailing slash matches that exact path OR anything beneath it, so `migrations`
// and `migrations/` both scope a check to the migrations tree.

const GLOB_CHARS = /[*?]/;

function escapeRe(ch) {
  return /[\\^$.|+()[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegExp(pattern) {
  let p = String(pattern || '').trim().replace(/^\.\//, '');
  if (!p) throw new Error('empty glob pattern');
  if (p.endsWith('/')) p += '**';
  else if (!GLOB_CHARS.test(p)) p += '{,/**}';

  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (p.startsWith('{,/**}', i)) {
      re += '(?:/.*)?';
      i += 5;
    } else if (ch === '*' && p[i + 1] === '*') {
      const slashAfter = p[i + 2] === '/';
      re += slashAfter ? '(?:.*/)?' : '.*';
      i += slashAfter ? 2 : 1;
    } else if (ch === '*') {
      re += '[^/]*';
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += escapeRe(ch);
    }
  }
  return new RegExp(`^${re}$`);
}

function compileGlobs(patterns) {
  return (patterns || []).map(globToRegExp);
}

function matchesAny(file, compiled) {
  const f = String(file || '').replace(/^\.\//, '');
  return compiled.some((re) => re.test(f));
}

// Files from `files` that match at least one pattern.
function filterByGlobs(files, patterns) {
  const compiled = compileGlobs(patterns);
  return (files || []).filter((f) => matchesAny(f, compiled));
}

module.exports = { globToRegExp, compileGlobs, matchesAny, filterByGlobs };
