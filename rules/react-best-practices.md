---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/package.json"
---

# React Best Practices — Non-Obvious Rules

Rules that models commonly get wrong or that are version-specific. Basics (immutable state, hooks at top level, don't mutate, key stability) are omitted — any model knows them.

---

## 1. React 19+ APIs

### useActionState for Form Mutations
Returns `[state, dispatchAction, isPending]`. **Critical**: Return errors as state, never throw — throwing cancels all queued actions.

```tsx
import { useActionState } from 'react'

function Form() {
  const [error, submitAction, isPending] = useActionState(
    async (prev, formData) => {
      const err = await save(formData)
      return err ?? null  // return error as state, don't throw
    },
    null
  )
  return (
    <form action={submitAction}>
      <input name="email" />
      <button disabled={isPending}>Save</button>
      {error && <p>{error}</p>}
    </form>
  )
}
```

### useOptimistic for Instant UI Feedback
Always call `setOptimistic` inside `startTransition` or an action prop.

```tsx
const [optimistic, setOptimistic] = useOptimistic(isLiked)

function handleClick() {
  startTransition(async () => {
    setOptimistic(!optimistic)
    await onToggle(!optimistic)
  })
}
```

### use() for Conditional Context and Promise Reading
Unlike `useContext`, works inside conditionals. Never create promises during render for `use()` — pass from parent/loader/cache. Never wrap in try-catch — use Error Boundaries.

```tsx
function HorizontalRule({ show }) {
  if (!show) return null
  const theme = use(ThemeContext)  // conditional — only use() allows this
  return <hr className={theme} />
}
```

### ref as Prop — Drop forwardRef
React 19: `ref` is a regular prop. `forwardRef` still works but avoid in new code.

### Context Directly as Provider
`<ThemeContext value="dark">` instead of `<ThemeContext.Provider value="dark">`.

### Ref Cleanup Functions
Return cleanup from ref callbacks. React no longer calls ref callbacks with `null` on unmount when cleanup functions are returned.

```tsx
<div ref={(el) => {
  const player = setupPlayer(el)
  return () => player.destroy()
}} />
```

### Document Metadata in Components
Render `<title>`, `<meta>`, `<link>` anywhere — React hoists to `<head>`. Eliminates react-helmet.

### Resource Preloading APIs (safe during render)
`prefetchDNS`, `preconnect`, `preload`, `preloadModule`, `preinit`, `preinitModule` — idempotent hints, NOT side effects.

### useId Default Prefix
Changed from `:r:` to `_r_` in React 19.2 for View Transitions compatibility.

### useEffectEvent (React 19.2)
Separates event logic from Effects — allows reading latest props/state without listing them as dependencies.

```tsx
const onConnected = useEffectEvent(() => {
  showNotification('Connected!', theme)  // reads latest theme
})

useEffect(() => {
  const conn = createConnection(roomId)
  conn.on('connected', () => onConnected())
  conn.connect()
  return () => conn.disconnect()
}, [roomId])  // theme NOT in deps
```

### Activity Component (React 19.2)
Controls visibility/priority of subtrees. Hidden activities unmount effects and defer updates while preserving state.

```tsx
<Activity mode={currentTab === 'home' ? 'visible' : 'hidden'}>
  <HomePage />
</Activity>
```

Use instead of conditional rendering when you want to preserve state and pre-render hidden content.

---

## 2. React Compiler

When enabled, compiler auto-memoizes at build time. Skip manual `useMemo`/`useCallback`/`React.memo` in new code. Keep as escape hatches for effect dependency identity only.

Requires pure, Rules-of-React-compliant components. Enable incrementally via `sources` config. Use `eslint-plugin-react-hooks` v6+ (standalone `eslint-plugin-react-compiler` is deprecated).

---

## 3. Error Handling

### createRoot Error Hooks (non-obvious)
```tsx
const root = createRoot(document.getElementById('root'), {
  onCaughtError(error, errorInfo) {
    reportToSentry(error, { componentStack: errorInfo.componentStack })
  },
  onUncaughtError(error, errorInfo) {
    reportToSentry(error, { componentStack: errorInfo.componentStack, fatal: true })
  },
  onRecoverableError(error, errorInfo) {
    reportToSentry(error, { severity: 'warning' })
  }
})
```

### Error Propagation in Actions
When an action **throws**: propagates to nearest Error Boundary, cancels queued actions.
When an action **returns** error as state: stored in component state for rendering, does NOT propagate. Prefer returning errors for user-facing feedback.

---

## 4. Non-Obvious Re-render Patterns

### Don't Subscribe to State Only Used in Callbacks
```tsx
// BAD — re-renders on every count change
const count = useStore(s => s.count)
return <button onClick={() => log(count)}>Log</button>

// GOOD — read in callback
const getCount = useStore(s => s.getCount)
return <button onClick={() => log(getCount())}>Log</button>
```

### Derive State During Render, Not Effects
```tsx
// BAD — extra render cycle
useEffect(() => setFilteredItems(items.filter(i => i.active)), [items])

// GOOD — inline
const filteredItems = items.filter(i => i.active)
```

### Split Read and Write Contexts
Separate state from dispatch to prevent broad re-renders.

### Subscribe to Derived Booleans, Not Raw Values
```tsx
// BAD — re-renders when items change even if emptiness didn't
const items = useStore(s => s.items)
const isEmpty = items.length === 0

// GOOD — only re-renders when boolean flips
const isEmpty = useStore(s => s.items.length === 0)
```

### Hoist Default Non-Primitive Props
```tsx
const childStyle = { color: 'red' }  // outside component
function Parent() {
  return <Child style={childStyle} />  // stable reference
}
```

### useDeferredValue vs useTransition
- **useTransition**: You control the update. Wraps setState. Returns isPending.
- **useDeferredValue**: You receive a value you can't control (prop). Returns deferred copy.

---

## 5. Financial UI Patterns

### Never Use Floating Point for Money
```tsx
// BAD
const total = 0.1 + 0.2  // 0.30000000000000004

// GOOD — Decimal.js
import Decimal from 'decimal.js'
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN })
const total = new Decimal('0.1').add('0.2')  // 0.3 exactly
```

### Configure Decimal.js Globally Before Any Calculation
Set precision and rounding once at app startup, before any Decimal instance.

### Use Intl.NumberFormat for Locale-Aware Display
```tsx
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  minimumFractionDigits: 2, maximumFractionDigits: 5,
})
```

### Isolate High-Frequency Components
Price tickers (60x/sec) must not re-render news feeds (1x/min). Separate into independent components with independent store subscriptions.

---

## 6. Zustand Patterns

### Always Use useShallow for Multi-Value Selectors
```tsx
// BAD — new object every render, re-renders on ANY store change
const { price, volume } = useStore(s => ({ price: s.price, volume: s.volume }))

// GOOD
import { useShallow } from 'zustand/react/shallow'
const { price, volume } = useStore(useShallow(s => ({ price: s.price, volume: s.volume })))
```

### Slices Pattern for Large Stores
Split into logical slices. Compose with spread in `create()`.

### Middleware Order: persist wraps devtools
```tsx
create(persist(devtools((set) => ({ ... })), { name: 'store' }))
```

### Server State in TanStack Query, Not Zustand
Zustand = client state (UI, preferences). TanStack Query = server state (fetched data, caching, background refetch).

---

## 7. WebSocket Patterns

### Throttle High-Frequency Updates
WebSocket messages can arrive faster than React renders. Batch via ref + requestAnimationFrame:

```tsx
const latestRef = useRef(null)
const rafId = useRef(null)

useEffect(() => {
  const sub = wsClient.subscribe('/topic/prices', (msg) => {
    latestRef.current = JSON.parse(msg.body)
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        setData(latestRef.current)
        rafId.current = null
      })
    }
  })
  return () => {
    sub.unsubscribe()
    if (rafId.current) cancelAnimationFrame(rafId.current)
  }
}, [wsClient])
```

---

## 8. Security (React-Specific)

- **No dangerouslySetInnerHTML without DOMPurify** — sanitize or use React's default escaping
- **Validate URL protocols** — whitelist `https?://` before rendering `<a href={userUrl}>`
- **No auth tokens in localStorage** — use httpOnly cookies (not JS-accessible)
- **CSRF tokens** for cookie-based auth on state-changing requests
- **No sensitive data in React state** — DevTools exposes all component state

---

## 9. Data Fetching

### React Query Key Conventions
Hierarchical, predictable: `['users']`, `['users', id]`, `['users', id, 'orders']`.

### Mutations with Optimistic Updates
Use `onMutate` to cancel queries, save previous, set optimistic. `onError` to rollback. `onSettled` to invalidate.

---

## Quick Checklist

- [ ] React 19 APIs used (useActionState, useOptimistic, use(), ref-as-prop, Context direct)
- [ ] No forwardRef or Context.Provider in new code
- [ ] Compiler-friendly (pure renders, no mutations)
- [ ] createRoot error hooks configured
- [ ] No derived state in effects
- [ ] Financial calcs use Decimal.js, never floating point
- [ ] Zustand selectors use useShallow for multi-value
- [ ] Server state in TanStack Query, client state in Zustand
- [ ] WebSocket updates throttled (rAF batching)
- [ ] No dangerouslySetInnerHTML without sanitization
- [ ] Auth tokens in httpOnly cookies, never localStorage
