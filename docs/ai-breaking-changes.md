# AI README: Breaking Changes and Data Migrations

AI agents must discuss breaking changes and existing-data handling with the
project owner before implementing the affected part of a change. A request to
add, change, or remove a feature does not by itself settle what should happen
to its stored data or which release should introduce the change.

## When to notify the owner

Notify the owner whenever a proposed change requires any of the following,
even if the migration is intended to preserve all data:

- A SQLite schema migration or transformation of existing records.
- An IndexedDB upgrade, cache cleanup, storage reset, or outbox change.
- Deleting, clearing, truncating, or dropping stored data, columns, tables,
  media, or browser storage.
- Ignoring or discarding previously accepted fields or values on API reads,
  writes, imports, or synchronization. Silent filtering is data handling too.
- A change that makes existing clients, saved templates, workouts, backups,
  or deployment configurations incompatible.

Explain the impact as soon as it is discovered. Do not wait until release
preparation or hide it only in a changelog or final response. If the impact is
uncertain, inspect the relevant models and migrations first and report what
remains unknown. Do not inspect production data without authorization.

## Discuss a concrete plan before implementing it

Prepare a short proposal covering:

1. **Reason:** what behavior is changing and why existing data is affected.
2. **Scope:** the exact tables, columns, records, files, browser stores, and
   API fields involved. Distinguish known data from possible affected data.
3. **Treatment:** what will be preserved, converted, archived, ignored, or
   permanently deleted. Explain whether the change can be reversed.
4. **Options:** practical alternatives, such as keeping a deprecated field,
   converting values, delaying removal, or using a staged migration. Recommend
   an approach and explain the tradeoff.
5. **Release:** propose the target release and explain compatibility with the
   currently released version. Do not assume the next minor version permits a
   breaking change; incompatible public-contract changes require a new major
   version under the existing project policy.
6. **Upgrade and recovery:** when the change runs, backup requirements, older
   client behavior, offline upgrades, pending synchronization, and rollback or
   restore limitations. A server backup does not contain unsynchronized
   device-local workouts.
7. **Verification:** how tests will prove the approved transformation, data
   preservation, failure recovery, and repeated-startup behavior.

Ask the owner to agree on the data treatment and release plan. Until that
decision is made, continue only unaffected work and read-only investigation.
Do not implement or run the migration, destructive cleanup, storage reset, or
compatibility-breaking behavior. In particular, do not add an automatic
startup deletion as a workaround for an unresolved decision.

An explicit earlier instruction approving the exact data treatment is valid
authorization; do not ask the same question again. Record that decision and
resolve any remaining release choices. If the discovered scope is larger than
approved, discuss the additional impact before proceeding.

## Record the agreed decision

Keep the decision in repository documentation so another AI chat can continue
without guessing. Use an architecture decision note or the relevant feature
documentation, with at least:

```text
Change:
Decision status: proposed / agreed
Owner instruction or agreement:
Target release: agreed version / undecided
Affected data and contracts:
Preserved data:
Converted or deleted data:
Upgrade trigger and compatibility:
Backup and recovery:
Required verification:
```

Do not describe a proposal as an agreed decision or a planned release as an
already published release. Approval of the plan is separate from permission
to deploy, publish, tag, or run it against production.

## Implement and release the agreed plan

- Append new SQLite migrations; never rewrite an applied migration or the
  released baseline. Preserve transaction safety, constraints, and indexes.
- Version browser upgrades and preserve active workouts and their outbox
  unless their removal was explicitly agreed. Account for offline devices
  and older clients reconnecting after the server upgrade.
- Test upgrades using representative data from the previous schema, including
  affected records. Verify preserved history, the exact approved data removal,
  retry or repeated startup, and failed-migration recovery where applicable.
- Update architecture, product behavior, operations instructions, and release
  notes with the actual upgrade and recovery behavior.
- Before release, explicitly report the agreed migration or deletion and its
  target version to the owner. Follow the checks in [the release guide](releasing.md).
  Do not tag, publish, deploy, or run production cleanup without authorization.

When no existing data or public contract is affected, ordinary implementation
can proceed without a migration discussion.
