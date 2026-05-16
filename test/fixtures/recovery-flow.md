---
title: Account Recovery Flow
kicker: self-service device recovery · DEMO MVP · RECOVERY FLOW · WITH AUDIT EVENTS
description: >
  Mobile-initiated recovery using context-aware behavioral questions. Actor
  shown as a bordered label tag. Outcomes carry color at terminal nodes and
  along path arrows. Amber pills mark steps that emit an audit event to the
  event log.
theme: blueprint
direction: TB
max_width: 960
actors:
  user:
    label: USER
    color: "#1e3a8a"
    icon: user
  backend:
    label: BACKEND
    color: "#7c2d12"
    icon: server
  manager:
    label: MANAGER
    color: "#5b21b6"
    icon: user-cog
outcomes:
  success:
    label: PASS
    color: "#059669"
  blocked:
    label: FAIL
    color: "#dc2626"
event_log:
  color: "#b45309"
  text:  "#92400e"
  bg:    "#fffbeb"
---

## Flow

- type: step
  id: "01"
  actor: user
  title: Opens newcore mobile app
  desc: Entry point. App detects unauthenticated state and surfaces the recovery CTA.

- type: step
  id: "02"
  actor: user
  title: 'Taps "Can''t log in? Start recovery"'
  desc: Primary affordance on the pre-auth screen.

- type: step
  id: "03"
  actor: user
  title: Enters username
  desc: >
    Single text field with autocomplete disabled. Accepts username or email.
    Triggers the recovery request and dispatches the owner-notification (out-of-band).
  side_branch:
    id: "03.async"
    variant: async
    actor: backend
    pill: ASYNC · PARALLEL
    title: Owner notified out-of-band
    desc: >
      Notification dispatched to account holder via email/push (system log).
      Owner can click "this is not me" at any time during or after recovery to
      file a dispute. Late dispute triggers fraud-rollback chain.
    trailing_note: ↳ fires only on dispute click; can occur post-completion

- type: arrow
  label: ENTER STEPS 04 + 05

- type: parallel
  label: STEPS 04 + 05 · PARALLEL
  columns:
    - label: STEP 04 · USER SEES
      children:
        - type: step
          id: "04"
          actor: user
          title: Reads recovery flow primer
          desc: >
            Primer screen describes the challenge, sets expectations on timing
            and skipping. Dwell time hides backend latency on the right.
    - label: STEP 05 · BACKEND CHALLENGE PREP
      children:
        - type: step
          id: "5.1"
          actor: backend
          title: Poll context systems
          desc: Parallel fan-out to IdP, HR, Calendar. Per-adapter 1s timeout.
        - type: step
          id: "5.2"
          actor: backend
          title: Verify TOTP factor (if enrolled)
          desc: Pre-KBA gate. Skipped when user has no TOTP factor enrolled.
        - type: step
          id: "5.3"
          actor: backend
          title: Generate questions via model
          desc: >
            Context + question requirements (count, canary y/n) → structured
            JSON challenge.
        - type: step
          id: "5.4"
          actor: backend
          title: Compute initial risk score
          desc: >
            Risk Service evaluates available signals. Defaults to 50 (Medium)
            on service unavailability.
        - type: step
          id: "5.5"
          actor: backend
          title: Commit challenge server-side
          desc: >
            Authoritative challenge entity stored. Correct answer indices held
            server-side only.
        - type: step
          id: "5.6"
          actor: backend
          title: Deliver challenge to device
          desc: >
            Client receives questions + options only, never correct_index. Push
            delivery is system log.

- type: arrow
  label: CHALLENGE READY

- type: step
  id: "06"
  actor: user
  title: Answers recovery questions
  desc: >
    Multiple choice, one question at a time. Skip allowed. Timer visible but
    non-punishing.

- type: step
  id: "07"
  actor: backend
  title: Compute risk verdict
  desc: >
    Final score with answer correctness applied. Canary trips force a fail
    verdict. Score matched against configured threshold.

- type: decision
  label: PASSES THRESHOLD?

- type: fork
  legs:
    - label: YES · PASS
      color: outcome:success
    - label: NO · FAIL
      color: outcome:blocked

- type: arrow
  color: outcome:success

- type: branch
  id: "08"
  title: Auto-approved
  subtitle: Threshold met · no manager involvement
  accent: outcome:success
  children:
    - type: step
      id: "8.1"
      actor: backend
      title: Pair device as new MFA factor
      desc: This phone registered as push factor. Session token issued.
    - type: step
      id: "8.2"
      actor: backend
      title: Send success email
      desc: >
        Notification to corporate email so a legit user can catch unauthorized
        recovery post-hoc. (System log — delivery mechanics.)
    - type: step
      id: "8.3"
      actor: backend
      title: Finalize recovery
      desc: Closes the recovery flow with success terminal state.
    - type: step
      id: "8.4"
      actor: user
      title: Login confirmation screen
      desc: '"You''re set — log in with your new device." Clear next action.'
      outcome: success
    - type: terminator
      color: outcome:success

- type: reroute
  label: DID NOT PASS THRESHOLD
  description: Flow diverts here from step 07. Continue below for the fail path.
  color: outcome:blocked

- type: branch
  id: "09"
  title: Below threshold
  subtitle: Fallback to manager approval or block
  accent: outcome:blocked
  children:
    - type: decision
      label: MANAGER FLOW AVAILABLE?
    - type: fork
      legs:
        - label: "YES"
          color: actor:manager
        - label: "NO"
          color: outcome:blocked
    - type: parallel
      label: ""
      columns:
        - children:
            - type: branch
              id: "9.1"
              title: Manager path
              subtitle: Push for approval
              accent: actor:manager
              children:
                - type: step
                  id: "9.1.1"
                  actor: backend
                  title: Identify manager
                  desc: >
                    Manager resolved from HR. Recovery context attached to the
                    push payload.
                - type: arrow
                  color: actor:manager
                - type: step
                  id: "9.1.2"
                  actor: backend
                  title: Push to manager
                  desc: >
                    Approval request created and dispatched. 4-hour response
                    timeout.
                - type: arrow
                  color: actor:manager
                - type: step
                  id: "9.1.3"
                  actor: manager
                  title: Manager responds + device paired
                  desc: >
                    On approve: device enrollment fires alongside the verify
                    event. On deny/timeout: only verify fires (with
                    denied/failure outcome) and flow proceeds to 9.1.6.
                - type: decision
                  label: APPROVE?
                - type: fork
                  legs:
                    - label: "YES"
                      color: outcome:success
                    - label: NO · TIMEOUT
                      color: outcome:blocked
                - type: parallel
                  label: ""
                  columns:
                    - children:
                        - type: step
                          id: "9.1.4"
                          actor: backend
                          title: Send success email
                          desc: System log only.
                        - type: arrow
                          color: outcome:success
                        - type: step
                          id: "9.1.5"
                          actor: backend
                          title: Finalize recovery
                          desc: "path: peer_approved"
                          outcome: success
                        - type: terminator
                          color: outcome:success
                    - children:
                        - type: step
                          id: "9.1.6"
                          actor: backend
                          title: Finalize recovery + suspend
                          desc: >
                            path: peer_denied or peer_timeout. Cascading
                            user.suspend follows.
                          outcome: blocked
                        - type: terminator
                          color: outcome:blocked
        - children:
            - type: branch
              id: "9.2"
              title: No manager path
              subtitle: Direct block
              accent: "#57534e"
              children:
                - type: step
                  id: "9.2.1"
                  actor: backend
                  title: Finalize recovery + suspend
                  desc: >
                    path: no_peer_path. Same terminal screen as 9.1.6.
                    Cascading user.suspend follows.
                  outcome: blocked
                - type: terminator
                  color: outcome:blocked

## Terminal States

- outcome: success
  count: 2
  items:
    - "Auto-approved (8.4)"
    - "Manager-approved (9.1.5)"
- outcome: blocked
  count: 3
  items:
    - "Manager denied / timeout (9.1.6)"
    - "No manager path (9.2.1)"
    - "Owner disputed (async, any time)"

## Audit Events

- name: recovery.request
  fires_at: ["03"]
- name: auth.totp.verify
  fires_at: ["5.2"]
- name: risk.recovery.create
  fires_at: ["5.4"]
- name: recovery.challenge.create
  fires_at: ["5.6"]
- name: recovery.challenge.complete
  fires_at: ["06"]
- name: risk.recovery.verdict
  fires_at: ["07"]
- name: credential.core_app.enroll
  fires_at: ["8.1", "9.1.3"]
- name: recovery.peer.request
  fires_at: ["9.1.2"]
- name: recovery.peer.verify
  fires_at: ["9.1.3"]
- name: recovery.complete
  fires_at: ["8.3", "9.1.5", "9.1.6", "9.2.1"]
- name: recovery.dispute.create
  fires_at: ["03.async"]
  fires_at_display: "async (any time post-03)"

## Footnotes

- label: DEMO SCOPE LIMITATIONS
  body: >
    No dynamic-KBA feasibility check (sparse-data users may hit odd behaviors),
    no difficulty classification on questions, canaries sourced from user data
    only (not tenant-wide), no limited-access option for high-risk passes.
- label: RISK SIGNALS IN SCOPE
  body: privilege level · lifecycle status · known device · last authentication · IP
- label: EVENT NAMING NOTE
  body: >
    Two names in this chart match the user's input but differ from the latest
    spec — auth.totp.verify (spec: mfa.totp.verify, MFA→AUTH rename deferred)
    and risk.recovery.verdict (spec: risk.recovery.update, since verdict isn't
    a locked verb).
