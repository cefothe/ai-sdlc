---
paths:
  - "**/*.java"
  - "**/pom.xml"
---

# Java Trading Systems

Non-obvious patterns for low-latency Java trading systems. Getting these wrong
causes financial loss, state corruption, or cluster failure. Architecture
compliance tests in CI enforce many of these automatically.

## Primitives & Memory

- **Primitives only**: `long`, `int`, `boolean`. Never `Long`, `Integer`, `Boolean`. Boxing allocates on heap per operation — unacceptable on hot paths. Use sentinel values (`-1L`) instead of null.
- **Agrona collections**: `Long2ObjectHashMap`, `Int2ObjectHashMap`, `LongHashSet`, `IntHashSet`. Never `HashMap<Long, V>` — boxes every key on get/put.
- **No concurrent primitives in single-threaded services**: No `volatile`, `AtomicLong`, `synchronized`, `ConcurrentHashMap`. Adds CAS overhead for zero benefit and misleads readers about the threading model.

## Fixed-Point Arithmetic

- **All money/prices use `long` fixed-point**. Never `float`, `double`, or `BigDecimal`.
- **Domain objects encode scale interactions**: `Price.multiply(Quantity)` returns `Money`. Never inline scale math like `(priceScaled * qtyScaled) / SCALE` — #1 source of off-by-10^N bugs.
- **Factory methods are asset-type-specific**: `Price.forex(1.0850)`, `Quantity.forexLots(1)`, `Money.usd(1_000_000)`. Wrong factory = price off by orders of magnitude.
- **Double only in test factory methods**: `Price.of(150.0)` is acceptable in test code only.

## SBE & Messaging

- **SBE decoders are flyweight objects**: They point directly at the Aeron buffer. After `onFragment` returns, the buffer is reused. Copy ALL fields into a record/POJO immediately inside the fragment handler. Storing a decoder reference reads garbage later.
- **Snowflake IDs for everything**: All identifiers and timer correlation IDs use `SnowflakeIdGenerator`. Never random numbers, timestamps, or static constants. Timer filtering by node ID is automatic.
- **`DeterministicSnowflakeIdGenerator` in tests**: The production generator uses system time — non-deterministic in tests.

## Aeron Cluster

Applies to code running inside an Aeron cluster service. The entire service runs
on one thread — this is architectural, not incidental.

- **Push-based only**: Never `.poll()` on Subscriptions. Use `subscription.fragmentHandler(...)`.
- **Deterministic state machine**: ALL nodes (leader AND followers) execute identical code paths. Never guard `cluster.offer()` with `isLeader()` or `isReplaying()`. Aeron deduplicates via session IDs. A guard diverges leader/follower state → snapshot mismatch → data corruption.
- **Guards only for external systems**: `if (isLeader() && !isReplaying)` only for LPs, databases, HTTP, `clientSession.offer()`. These side effects must happen exactly once.
- **Cluster time is milliseconds**: `cluster.time()` returns ms. Never divide by 1,000,000. (Bug #353: all DB timestamps showed 1970-01-01.)
- **No non-deterministic time**: Forbidden in cluster services: `System.currentTimeMillis()`, `System.nanoTime()`, `Instant.now()`, `new Date()`, `Clock.systemUTC()`. Use `ClusterClock` or `cluster.time()`.
- **No blocking on cluster thread**: No `Future.get()`, `Thread.sleep()`. Blocks heartbeats → triggers leader election → service restart.
- **No thread creation**: No `ExecutorService`, `new Thread()`, `CompletableFuture.supplyAsync()`. Work on separate threads is invisible to followers and replay. Use `ClusterSchedulerAdapter`.
- **Initialize domain objects with cluster**: Call `Order.initialize(cluster)` etc. in `onServiceStart()` before creating business logic. They use `DeferredClusterClock` — forgetting this produces zero timestamps.
- **Fail-hard on checkpoint mismatch**: Never auto-recover, never `clearCheckpoint()`. Let Aeron throw `ArchiveException`. Auto-recovery risks duplicate trades (ADR-054).
- **Snapshot serialization**: `ExpandableArrayBuffer` (Agrona), never `ByteBuffer`. Version header. Deterministic ordering (sorted by key). No Java serialization, no JSON/XML.
- **Accumulate-Persist-Clear**: Memory growth between snapshots is expected. Clear deduplication structures only AFTER successful snapshot write.

## Verification Discipline

- **Compile after every edit**: `mvn compile` or `mvn test-compile`. Never assume an edit compiles.
- **Look up real APIs before writing tests**: `grep -A 10 "public MyClass("` for constructors. Tests against fictional APIs are the #1 cause of test compilation failures.
- **Never dismiss test failures as pre-existing**: Assume all failures after your changes are regressions until proven otherwise.
