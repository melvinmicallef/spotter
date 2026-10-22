# Spotter QA bug report

Date: 2026-10-22  
Application: Spotter 0.2.0 (`develop`)  
Browser: Google Chrome, Playwright 1.64.1  
Desktop viewport: 1365 × 900 CSS px  
Mobile viewport: 390 × 844 CSS px

## Summary

Three confirmed user-interface issues were found and fixed. No data loss or
server-side failures were reproduced. The user's existing database was not used
for test workouts; the test database and uploaded media were isolated under the
ignored `apps/server/data/qa-persistence-20261022` directory, verified across a
server restart, and removed afterward.

## Confirmed bugs

All three findings below were fixed locally after the QA pass. The fixes were
verified with the automated check and browser test suites, plus targeted
Playwright checks at mobile and desktop viewports. See the final fix commit in
Git history for the implementation.

### B-001 — [P2] Workout header actions overflow on a narrow mobile screen

**Status:** Fixed. On narrow screens, the active workout title and wrapped
action buttons now fit the viewport. A Playwright regression check verifies
the Finish button and document width at 390 px.

**Area:** Active workout, mobile layout  
**Reproducibility:** Every time at a 390 px viewport

**Steps**

1. Open **Workout** at a 390 × 844 viewport.
2. Select a scheduled strength day.
3. Start that workout.

**Expected:** The stretching, cancel, and finish controls wrap or stack within
the viewport, and the full **Finish** button is visible.

**Actual:** The header actions remain in one row alongside the workout title.
The browser measured the action group ending at x = 446.7 px in a 390 px
viewport. The **Finish** button therefore extends about 56.7 px beyond the
right edge, and the document's scroll width grows to 447 px. Part of the button
is clipped unless the user scrolls sideways.

**Impact:** Finishing a workout is awkward on a common Android phone width and
the page acquires unwanted horizontal overflow.

### B-002 — [P3] The browser requests a missing favicon

**Status:** Fixed. `apps/web/index.html` now points to the existing Spotter SVG
icon. Playwright verifies the declaration and that the icon is served.

**Area:** Browser tab icon / console  
**Reproducibility:** Every fresh Chrome page load

**Steps**

1. Open any Spotter route in a fresh browser context.
2. Check the browser console or request `GET /favicon.ico`.

**Expected:** The app supplies a favicon or explicitly points browsers to one
of its existing Spotter icons.

**Actual:** `GET /favicon.ico` returns `404 Not Found`, and Chrome logs
“Failed to load resource.” The PWA manifest has icons, but
`apps/web/index.html` does not declare a favicon.

**Impact:** The browser tab/bookmark icon can be missing, and every fresh page
load emits a console error. PWA installation icons continue to work.

### B-003 — [P3] The strength set grid leaves an empty bordered tail

**Status:** Fixed. The border now wraps the content-sized grid instead of the
full-width scroll area. Playwright verifies the grid ends before the available
desktop scroll area and that the scroll area has no border.

**Area:** Active workout, strength and calisthenics set grid  
**Reproducibility:** Every strength workout on desktop

**Steps**

1. Open a strength workout at a 1365 × 900 viewport.
2. Inspect a row with the default three sets and **+ Add set** control.

**Expected:** The table's visual boundary ends cleanly at the set controls, or
the remaining space is clearly separated from the table.

**Actual:** The set cells and **+ Add set** control occupy only part of the
available width, while the bordered `.strength-workout-grid-scroll` container
continues to the far right. This leaves a large empty outlined strip that
looks like an extra blank table column and adds a second visual boundary beyond
the controls.

**Impact:** The compact set-entry table looks wider than its contents and the
extra outline competes with the individual set borders.

## Test setup and workbook data

The workbook has two sheets, `TPL2` and `TPL3`. Each sheet has three workout
groups—Chest & Back, Shoulders & Arms, and Legs—with eight exercise rows in
each group. The isolated test catalogue contained all 35 unique workbook
exercise names plus three UI-created examples for strength, calisthenics, and
cardio.

Each test template had 26 scheduled entries:

- Monday: Chest & Back
- Tuesday: Cardio
- Wednesday: Shoulders & Arms
- Thursday: Cardio
- Friday: Legs
- Saturday and Sunday: Rest

The same cardio exercise was used to cover duration and interval entry across
the two templates. The workbook's set grid did not contain completed rep or
weight values, so the QA fixture used 3 × 10 for weighted entries, 3 × 12 for
bodyweight entries, and a 30-minute duration example. These are test values,
not values written to the user's database or an exercise prescription.

Exercise records retained the ExRx reference URLs supplied in the workbook.
The app's reference-link field and guide display were exercised. Individual
external ExRx pages were not all opened; automated access to those pages is
restricted by the site's robots policy.

## Coverage and results

### Automated checks

- `npm run check` — passed: formatting, lint, type checks, all 78 unit and
  integration tests, all 8 release-script tests, and production builds.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`
  — passed, 6 of 6 browser tests.
- The Playwright suite covered catalogue and template management, typed
  workouts, history, offline persistence and synchronization, PWA installation
  metadata and service-worker updates, settings, theme, and stretching-poster
  upload/removal/offline viewing.

### Additional browser QA

- Created one strength, one calisthenics, and one cardio exercise through the
  UI. Uploaded the sample GIF to Dumbbell Fly; the guide loaded at 700 px wide
  and rendered with `object-fit: contain`.
- Imported all workbook exercise names and both sheet-based plans into the
  isolated database. Verified day names, exercise lists, cardio modes, and
  Saturday/Sunday Rest labels in the UI.
- Selected alternate weekdays, started and cancelled workouts, and confirmed
  cancellation leaves the day selectable. Also confirmed the synchronized
  server draft is removed after the cancellation outbox drains.
- Opened the add-exercise modal at the bottom of an active workout, added an
  exercise, moved it, removed it, and exercised the set add/remove controls.
- Ran duration cardio and interval cardio. Interval mode omitted its distance
  target, started and completed a short timer, and used the previous interval
  settings for the same exercise after switching templates.
- Entered a strength set, reloaded the page, and confirmed the values remained.
  Finishing with unused sets removed those blank sets from the saved history.
  Previous-set placeholders worked across templates: a prior one-set effort
  filled only the first placeholder in a three-set plan.
- Marked a day complete and confirmed it displays **Done** and is disabled for
  the rest of the local week. Rest days could be selected but not started.
- Finished workouts with incomplete exercises, confirmed the warning, and
  continued. History showed exercise names and the expected date format;
  editing a historical weight/reps set saved successfully.
- Opened the strength progress view after two workouts. Both estimated 1RM and
  training-volume charts rendered two dated points and updated after the
  history edit.
- Checked the active-workout layout at desktop and 390 px mobile widths. The
  mobile overflow in B-001 and the empty bordered grid tail in B-003 were
  reproduced visually.

### Data-folder restart check

The app was stopped and restarted with `npm run dev` pointed at the same
isolated data folder. Before and after the restart, the API returned 38
exercises, templates `TPL2` and `TPL3` with 26 entries each, and five completed
workouts. The uploaded GIF remained 2,227,016 bytes with the same SHA-256
digest. SQLite `PRAGMA quick_check` returned `ok`.

Afterward, the app was restarted with its normal development settings. The
original `apps/server/data/spotter.sqlite` passed `quick_check`; its existing
three exercises, two templates, three completed workouts, and one in-progress
workout remained present.

## Coverage limits

- Android installation was covered through manifest and service-worker browser
  checks plus a 390 × 844 mobile viewport; no physical Android device was
  available for a device-level install or keyboard test.
- Interval beep behavior was covered by the automated browser timer test with a
  synthetic audio context; no physical speaker was used.
