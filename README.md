# Orchestra LinkedIn

Chrome extension for generating LinkedIn posts with Orchestra AI and inserting them into the LinkedIn composer.

## Current Stage

The project is currently at the static UI shell stage.

Implemented so far:

- Manifest V3 extension scaffold
- Shared local backend config via `config/config.js`
- Static popup UI in `src/popup/popup.html` and `src/popup/popup.css`
- Minimal MV3 service worker in `src/background/service_worker.js`
- Placeholder extension icons in `icons/`

Not implemented yet:

- Popup interaction logic in `src/popup/popup.js`
- Orchestra API client and SSE parsing in `src/api/orchestraClient.js`
- LinkedIn composer insertion logic in `src/content/content.js`

At this stage, the extension loads in Chrome, shows the popup shell, registers the service worker, and resolves the configured icons, but it does not generate or insert content yet.

## Overview

`orchestra-linkedin` is a Manifest V3 Chrome extension that:

- Opens from the Chrome toolbar as a popup UI
- Sends a LinkedIn post idea to the Orchestra backend
- Waits for the backend's SSE pipeline to finish
- Extracts the final polished LinkedIn post
- Inserts that post into the active LinkedIn composer

This repository is intentionally scoped as a focused MVP. The extension is designed for local development first, using `http://localhost:8000` as the Orchestra backend.

## Repository Architecture

```text
orchestra-linkedin/
├── manifest.json
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── content/
│   │   └── content.js
│   ├── background/
│   │   └── service_worker.js
│   └── api/
│       └── orchestraClient.js
├── config/
│   └── config.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Component Responsibilities

- `manifest.json`: Chrome Extension MV3 manifest with popup, content script, service worker, permissions, and host permissions.
- `src/popup/popup.html`: Extension UI shell.
- `src/popup/popup.js`: Form logic, loading states, SSE consumption, result handling, and messaging to the active LinkedIn tab.
- `src/popup/popup.css`: Popup sizing and layout.
- `src/content/content.js`: LinkedIn DOM insertion only.
- `src/background/service_worker.js`: Minimal background worker for MV3 compatibility and future message relay needs.
- `src/api/orchestraClient.js`: `fetch` call plus SSE parser that returns the best LinkedIn result from Orchestra.
- `config/config.js`: Shared `ORCHESTRA_BASE_URL` constant.
- `icons/`: Extension toolbar and manifest icons.

## Key Technical Decisions

| Decision         | Choice                                | Why                                                                                        |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Manifest version | MV3                                   | Required because MV2 is being sunset                                                       |
| UI surface       | Popup                                 | Simpler than a sidebar and does not require `sidePanel` permissions                        |
| Background       | Minimal service worker                | Keeps MV3-compatible structure without moving generation into worker lifecycle constraints |
| API calls        | From `popup.js`                       | Avoids service worker termination issues during long-running requests                      |
| SSE handling     | Parse in popup, wait for final output | V1 does not need token-by-token rendering                                                  |
| Config           | Hardcoded `config.js` constant        | Fastest local dev setup; one place to swap backend URL later                               |
| DOM insertion    | `content.js` only                     | Keeps LinkedIn DOM concerns isolated from popup logic                                      |
| Voice profile    | Always `"default"`                    | No profile picker in V1                                                                    |

## MVP Scope

### Included in V1

- Open LinkedIn in Chrome
- Click the extension icon
- Enter a topic or idea in a textarea
- Click Generate and wait for the result
- Read the generated LinkedIn post in the popup
- Click Insert into Post to place the content into the LinkedIn composer
- See a loading state while generation is running
- See a clear error message if Orchestra is unavailable or the LinkedIn composer is not found

### Explicitly Excluded from V1

- Voice profile selection
- In-extension editing before insert
- Token-by-token streaming UI
- Direct publishing to LinkedIn
- Backend URL configuration in the UI
- Generation history
- Regenerate-with-angle controls
- Agent reasoning or thinking display

### Non-Goals

- Auth or login
- Billing
- Cloud sync
- Multiple voice profiles in the UI
- Side panel UI
- Direct LinkedIn publishing via extension OAuth

## Integration Contract

### Backend Endpoint

```http
POST http://localhost:8000/api/run
Content-Type: application/json
```

### Request Payload

```json
{
  "idea": "<user input string>",
  "voice_profile": "default"
}
```

### Response Format

The backend responds with a Server-Sent Events stream:

- Content-Type: `text/event-stream`
- Each event block is separated by `\n\n`
- Each block follows:

```text
event: <event_name>
data: <json string>
```

### Events the Extension Cares About

| Event                      | Purpose                | Payload field used       |
| -------------------------- | ---------------------- | ------------------------ |
| `planner_started`          | Optional status update | None                     |
| `linkedin_pass2_completed` | Mid-pipeline fallback  | `data.output`            |
| `critic_completed`         | Primary result         | `data.linkedin_improved` |
| `pipeline_completed`       | End-of-stream marker   | None                     |

### Result Extraction Rules

`src/api/orchestraClient.js` should use this fallback chain:

1. `critic_completed.data.linkedin_improved`
2. `linkedin_pass2_completed.data.output`
3. `linkedin_pass1_completed.data.output`
4. Throw an error if none are present

### Streaming Strategy for V1

V1 should parse SSE events but not stream partial text into the UI. Instead:

1. Read the response stream with `response.body.getReader()`
2. Parse incoming SSE event blocks
3. Optionally map event names to status labels like `Planning...`, `Generating...`, or `Reviewing...`
4. Wait until `critic_completed` or the end of the pipeline
5. Display the final generated LinkedIn post all at once

This keeps the integration compatible with the existing Orchestra API without adding a more complex streaming renderer to the popup.

## Chrome Extension Permissions

Current manifest expectations:

- `permissions`: `storage`, `activeTab`, `scripting`
- `host_permissions`: `http://localhost:8000/*`
- `content_scripts` target: `https://www.linkedin.com/*`

When moving to production, update both:

- `config/config.js`
- `manifest.json` `host_permissions`

## Local Development

Start the Orchestra backend from the main Orchestra repository:

```bash
uvicorn orchestra.backend.main:app --reload
```

Then load this extension in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this repository folder

The extension will call `http://localhost:8000/api/run`.

## UX Flow

```text
[LinkedIn tab open]
        ↓
[User clicks extension icon]
        ↓
[Popup opens]
        ↓
[User enters idea and clicks Generate]
        ↓
[popup.js calls orchestraClient.js]
        ↓
[POST /api/run with { idea, voice_profile: "default" }]
        ↓
[Popup shows loading state]
        ↓
[SSE completes and final post is extracted]
        ↓
[Popup shows generated post]
        ↓
[User clicks Insert into Post]
        ↓
[popup.js sends message to active LinkedIn tab]
        ↓
[content.js finds composer and inserts text]
```

## Expected Error States

- Orchestra unreachable: `Could not reach Orchestra. Is it running on localhost:8000?`
- Stream parse or generation failure: `Generation failed. Try again.`
- Composer not found: `Open the LinkedIn post composer first, then click Insert.`
- No LinkedIn tab active: `Navigate to LinkedIn first.`

## Risks and Mitigations

### 1. LinkedIn DOM instability

LinkedIn is a React SPA, and composer selectors can change without notice.

Mitigation:

- Use layered selectors in `content.js`
- Try selectors in priority order:
  - `div[data-placeholder*="post"]`
  - `div[role="textbox"][contenteditable="true"]`
  - `.ql-editor[contenteditable="true"]`

### 2. React event conflicts during insertion

Setting `.textContent` directly may not trigger LinkedIn's internal React-controlled state.

Mitigation:

- Try `document.execCommand('insertText', false, content)` first
- If needed, dispatch a bubbling `InputEvent` fallback

### 3. SSE tied to popup lifetime

If the popup closes during generation, the request and stream may be interrupted.

Mitigation:

- Keep generation in the popup for V1
- Accept the limitation for a personal MVP
- Consider moving generation into the service worker plus `chrome.storage.local` for V2

### 4. MV3 service worker termination

Long-running work inside the service worker is fragile because MV3 workers can be suspended.

Mitigation:

- Do not run the Orchestra fetch from the service worker in V1
- Keep the worker minimal

### 5. Long API latency

The Orchestra pipeline may take roughly 15 to 30 seconds.

Mitigation:

- Show a clear loading state
- Disable actions while generation is active
- Optionally surface simple status messages derived from SSE event names

### 6. Localhost host permissions

`http://localhost` is fine for local development but not appropriate for Chrome Web Store submission.

Mitigation:

- Use localhost only during local development
- Switch to HTTPS before any production or store path

### 7. Chrome Web Store review sensitivity

Broad host permissions increase review scrutiny.

Mitigation:

- Keep host permissions narrow and specific
- Treat this extension as an unpacked local tool for V1
