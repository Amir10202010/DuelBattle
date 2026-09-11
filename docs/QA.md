# Verification record

Environment: Windows, Node.js 24.16.0, installed Google Chrome controlled by Playwright. Checks run against the built production server, with a separate in-memory database for browser tests. The normal development server runs at http://localhost:3000.

## Automated domain and transport checks

**38 tests passed** across four suites:

- Room creation, joining, same-socket idempotency, duplicate tab protection, foreign membership, full/invalid rooms and bounded socket concurrency.
- Explicit state transitions, both-ready gating, server countdown and deadlines, camera requirement, challenge selection and no repeats before catalog exhaustion.
- First valid server-received attempt, simultaneous submissions, earlier pending attempts, accept/reject/expiry, three-attempt cap, stale round IDs, duplicate nonces, malformed evidence and self-review rejection.
- First-to-three scoring, close five-round matches, timeout rounds, a bounded draw, rematch consent and score reset.
- Disconnect/reconnect, replacement socket identity, fresh round tokens after interrupted races, camera-off pause, cancellation, stale-room expiry and membership release.
- Atomic per-participant free usage, UTC reset, server-owned Premium, hourly throttling across midnight, expiry and persistence after database reopen.
- Challenge schema, category metadata, safety-rule rejections, incompatible verification, untrusted generator outputs and quarantine pending human review.
- Real temporal color detection on controlled pixel data, neutral/dark rejection and stale detection reset.
- Real HTTP/Socket.IO integration: cookies, CSP, CSRF, origin rejection, forged Premium/score, unauthorized signaling, session recovery and ICE endpoint authentication.

TypeScript typecheck, ESLint, production build and npm dependency audit passed. npm audit reported zero known vulnerabilities in the installed tree. Docker Compose configuration validated successfully. Docker image execution was not tested because the Docker Desktop daemon was not running.

## Browser coverage

**All four end-to-end browser scenarios passed in the final run** (approximately 1 minute 20 seconds). The production test server shut down after the suite; the user-facing development server remains available.

The browser suite exercises two independent authenticated contexts and Chromium-provided test cameras. Actual `getUserMedia`, live media tracks, WebRTC negotiation, remote video decoding, Socket.IO messages and server state are used. Synthetic camera content is only a test device; the application contains no fake camera mode or mocked game server.

The complete flow includes create, copy invite, join, enable both cameras, enable microphone, both ready, synchronized countdown/challenge, deliberate snapshots, opponent confirmation, three rounds, synchronized winner and score, final result, clipboard sharing, rematch, refresh/rejoin, camera reacquisition, peer video recovery and leave. Media tracks are asserted ended on both sides after leaving/cancellation. Browser console errors and uncaught exceptions are collected and asserted absent in this full flow.

Additional browser checks cover invalid rooms/routes, permission denial with a friendly message and disabled readiness, mobile and tablet layouts, offline/online transport recovery, opponent review brought into the viewport, and 200% zoom-equivalent reflow (640×450 CSS viewport at device scale 2, representing a 1280×900 display). This last check is viewport emulation, not physical browser zoom or an assistive-technology audit.

axe-core checks cover WCAG A/AA rules on the landing page, lobby and match results. The audit checks semantic controls, labels and contrast; automated tools do not replace a manual screen-reader audit. Keyboard Escape dismisses the information dialog; focus styles and reduced-motion media rules are implemented.

## Visual review

Screenshots were inspected for desktop/mobile landing, camera lobby, active arena, snapshot review, countdown, desktop/mobile match results, reconnecting tablet, cancelled state and denied camera. The audit found and corrected a dark-control CSS cascade issue, oversized camera layout at shorter heights, review content below the viewport, media cleanup after cancellation and a same-origin polling handshake rejection. The final suite also generates round-result and zoom-equivalent dialog screenshots.

Test output is in ignored `test-results/` and `playwright-report/`; traces and failure screenshots are retained automatically on failures. The repository contains no captured personal webcam footage. The marketing image is original illustrative artwork.

## Not verified or deliberately external

- Physical cameras/microphones, physical phones, Safari/Firefox and peers in different geographic locations.
- TURN relay service, NAT traversal through restrictive corporate networks, a public HTTPS host or reverse proxy, Docker runtime and GitHub-hosted CI execution.
- Load or tournament fairness benchmarks, automatic object/pose recognition, liveness, model accuracy or fraud-resistant human judgments.
- Payments, customer accounts, signed billing webhooks, arbitrary challenge moderation, recording and clips.

The MVP is playable with honest opponent verification. Advanced AI and billing are provider boundaries, not simulated services. Deploy one Node instance with persistent SQLite storage; server restarts end active rooms. Browser guest quotas are not strong account identity and can be evaded by clearing cookies.
