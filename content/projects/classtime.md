---
title: "ClassTime"
description: "An Android app that records your lectures on schedule. Register a timetable once and recordings start, stop, name, and file themselves by course."
pubDate: 2026-09-11
tags: ["Kotlin", "Jetpack Compose", "Room", "Android"]
github: "https://github.com/iruki-dev/ClassTime"
featured: true
---

## The chore it removes

Recording lectures with a stock voice recorder means pressing start, pressing stop, and then later
facing a folder of `recording_047.m4a` files with no idea which class each one was. The sorting is
the actual work, and it always gets postponed.

ClassTime takes a timetable once and does the rest:

| Stock recorder | ClassTime |
|---|---|
| Press start and stop for every class | Starts and stops on the schedule |
| `recording_047.m4a` | `DataStructures_2026-03-04_0930.m4a` |
| One folder, everything mixed together | A folder per course under `Music/ClassTime/` |
| Rename and sort it all later | Nothing to sort |

Because it writes into the shared `Music` folder, moving a semester onto a computer is a USB cable
and a drag — no export step, no companion app.

## The bug that shaped the whole app

The first working version recorded silence. Perfectly formed files of the right length, containing
nothing.

The cause is an Android rule that isn't obvious until it bites you: microphone access is decided at
**the instant a service calls `startForeground()`**, based on whether the app was visible right
then. Grab it while visible and it holds — you can close the app, lock the screen, and recording
continues to the end. Fail to grab it and `MediaRecorder` raises no error at all. It cheerfully
encodes silence.

A class-time alarm fires in the background by definition. So any design where the alarm launches the
recording service is guaranteed to produce silent files, every single time.

**Standby mode** is the fix. When you open the app, the recording service is promoted to the
foreground right then, while the app is on screen, and it claims the microphone before there's
anything to record. When class starts, the service that already holds permission simply begins
writing. Nothing new is launched, so nothing is re-evaluated.

That leads to a rule the code treats as inviolable: `startForeground()` is called **exactly once per
service instance**. Calling it a second time re-evaluates app visibility and throws away the
permission that was so carefully acquired — so notification updates go through `notify()` only.

Belt and braces on top: if amplitude stays at zero for more than eight seconds, a warning
notification fires and the recording is flagged red in the list. The app tells you it failed rather
than handing you a silent file weeks later.

## Making sure recordings actually stop

A recording that never ends is worse than one that never starts — it fills the disk and ruins the
file. So stopping is guaranteed three ways: the scheduled stop alarm as the primary path, a watchdog
alarm that wakes the device even in deep sleep, and a hard four-hour ceiling as a last resort. Any
one of them is enough.

Finalizing — closing the file and updating the database — deliberately runs outside the service, in
an app-scoped non-cancellable coroutine. If Android kills the service mid-recording, the cleanup
still completes, so you never end up with a list entry stuck on "recording" and a file that won't
play. Three separate points also run an idempotent repair pass over any leftover pending files.

There's a subtler trap here too. Rescheduling alarms and catching up on a missed recording have to
be separate operations. Merge them and a stop alarm immediately re-triggers the class it just
ended — an infinite recording loop. That separation is pinned in place by regression tests.

## Real semesters, not ideal ones

A timetable alone doesn't survive contact with an actual term, so the schedule model handles what
actually happens:

- **Term dates** — nothing records before the first day or after the last.
- **Cancellations and holidays** — skip one course on one date, or the whole day, and the alarm moves
  to the next valid meeting.
- **Make-up classes** — one-off sessions at times not in the timetable, optionally linked to a course
  so the file lands in the right folder.
- **Irregular courses** — one course can have any number of meetings, each with its own day and
  times, including two on the same day.

Manual recordings get the same treatment: press the button and the app checks the current time
against the timetable, cancellations and make-ups included, and labels the file with the right course
automatically.

## Stack and state

Native Android in Kotlin with Jetpack Compose, Room for storage with tested schema migrations,
exact alarms for scheduling, and MediaStore so files land in the public music folder. Recordings are
96 kbps AAC — about 43 MB per lecture hour.

Seventy-three unit and Robolectric tests cover alarm math, session matching, the database including
migrations, and — most importantly — the silent-recording and re-recording bugs above, so neither can
come back unnoticed.
