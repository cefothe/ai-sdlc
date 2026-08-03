---
name: sample-compile-errors
feature: Document Upload and Processing Service
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 8
---

# Functional Test Cases: Document Upload and Processing Service

## Shared Preconditions

- API base URL configured via environment
- Authentication service available
- Document storage service available
- SSE (Server-Sent Events) endpoint active

## Test Data

- User USR-DOC-001: Active, role TRADER, document upload permission
- User USR-DOC-002: Active, role VIEWER, read-only
- Document DOC-TEMPLATE-001: PDF, 2MB, valid KYC template
- Max upload size: 10MB
- Supported formats: PDF, PNG, JPG

---

### TC-FUNC-BE-REST-001: Upload Document via Multipart Form

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with document upload permission
When the client sends POST /api/v1/documents/upload as multipart/form-data:
  | field       | value                    |
  | file        | test-kyc.pdf (2MB)       |
  | category    | KYC                      |
  | description | Identity verification    |
Then the API responds with HTTP 201 Created
  And the response contains documentId, uploadedAt, and processingStatus "PENDING"
```

**Preconditions:**
- Valid JWT token for USR-DOC-001
- Test PDF file available

**Test Steps:**
1. Authenticate via POST /api/v1/auth/login
2. Upload document via multipart POST
3. Verify response fields

**Expected Results:**
- HTTP 201 Created
- documentId is non-null UUID
- processingStatus is "PENDING"
- fileSize matches uploaded file

---

### TC-FUNC-BE-REST-002: Stream Processing Status via SSE

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a document has been uploaded with documentId
When the client connects to GET /api/v1/documents/{documentId}/status/stream (Accept: text/event-stream)
Then the client receives SSE events:
  - event: status, data: {"status": "PROCESSING", "progress": 25}
  - event: status, data: {"status": "PROCESSING", "progress": 75}
  - event: status, data: {"status": "COMPLETED", "progress": 100}
  And the stream closes after COMPLETED
```

**Preconditions:**
- Document uploaded and processing started

**Test Steps:**
1. Upload a document
2. Open SSE connection to status stream
3. Collect events until stream closes
4. Verify event sequence

**Expected Results:**
- At least 2 SSE events received
- Final event has status "COMPLETED"
- Progress increases monotonically
- Stream closes after completion

---

### TC-FUNC-BE-REST-003: Download Processed Document with Custom Deserializer

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a document has been processed (status COMPLETED)
When the client sends GET /api/v1/documents/{documentId}/download
  And includes Accept: application/octet-stream
Then the API responds with HTTP 200 OK
  And Content-Type is application/pdf
  And Content-Disposition contains the original filename
  And the response body is the file bytes (non-empty)
```

**Preconditions:**
- Document exists with status COMPLETED

**Test Steps:**
1. Upload and wait for processing to complete
2. Download via GET with binary accept header
3. Verify Content-Type and Content-Disposition headers
4. Verify response body is non-empty

**Expected Results:**
- HTTP 200 OK
- Correct Content-Type header
- File bytes received (length > 0)

---

### TC-FUNC-BE-REST-004: Batch Upload Multiple Documents

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends POST /api/v1/documents/batch-upload as multipart/form-data with 3 files:
  | file          | category |
  | doc1.pdf      | KYC      |
  | doc2.png      | IDENTITY |
  | doc3.jpg      | ADDRESS  |
Then the API responds with HTTP 201 Created
  And the response contains an array of 3 document records
  And each has a unique documentId
```

**Preconditions:**
- Valid JWT token with upload permission
- 3 test files available

**Test Steps:**
1. Authenticate
2. Send batch upload with 3 files in single request
3. Verify response array length and document IDs

**Expected Results:**
- HTTP 201 Created
- 3 documents in response array
- All documentIds are unique UUIDs
- All have processingStatus "PENDING"

---

### TC-FUNC-BE-REST-005: Upload Exceeding Size Limit

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client uploads a file exceeding 10MB limit
Then the API responds with HTTP 413 Payload Too Large
  And the error code is "FILE_TOO_LARGE"
  And the error message includes the max size limit
```

**Preconditions:**
- Valid JWT token

**Test Steps:**
1. Generate or use a test file > 10MB
2. Attempt upload
3. Verify rejection

**Expected Results:**
- HTTP 413 Payload Too Large
- Error code "FILE_TOO_LARGE"
- Message mentions "10MB" or "10485760"

---

### TC-FUNC-BE-REST-006: Upload Unsupported Format

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client uploads a .exe file
Then the API responds with HTTP 415 Unsupported Media Type
  And the error code is "UNSUPPORTED_FORMAT"
  And the response lists supported formats
```

**Preconditions:**
- Valid JWT token

**Test Steps:**
1. Attempt upload with .exe file
2. Verify rejection with format error

**Expected Results:**
- HTTP 415 Unsupported Media Type
- Error lists supported formats: PDF, PNG, JPG

---

### TC-FUNC-BE-REST-007: Get Document Metadata with Nested Processing Results

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a document has been processed with OCR and classification results
When the client sends GET /api/v1/documents/{documentId}
Then the API responds with HTTP 200 OK
  And the response contains nested processing results:
    - "ocrResult": { "extractedText": "...", "confidence": 0.95 }
    - "classification": { "type": "PASSPORT", "country": "US" }
    - "validationResult": { "passed": true, "checks": [...] }
```

**Preconditions:**
- Document uploaded and fully processed

**Test Steps:**
1. Upload document and wait for completion
2. Get document metadata
3. Validate nested result objects

**Expected Results:**
- HTTP 200 OK
- ocrResult.confidence is between 0 and 1
- classification.type is non-null
- validationResult.checks is non-empty array

---

### TC-FUNC-BE-REST-008: Concurrent Upload Race Condition

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** Concurrency
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends 5 upload requests simultaneously for the same account
Then all 5 uploads succeed (no duplicates, no conflicts)
  And each has a unique documentId
  And the document count for the account increases by exactly 5
```

**Preconditions:**
- Valid JWT token
- 5 test files prepared

**Test Steps:**
1. Send 5 uploads in parallel (CompletableFuture or similar)
2. Collect all responses
3. Verify all succeeded with unique IDs
4. Query document list to confirm count

**Expected Results:**
- All 5 return HTTP 201
- 5 unique documentIds
- Account document count increased by 5
