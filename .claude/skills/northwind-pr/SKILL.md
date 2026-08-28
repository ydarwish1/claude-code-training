---
name: northwind-pr
description: Write a pull request description for the current branch in Northwind's required format — what changed, how it was verified, the ticket's acceptance criteria ticked honestly, and what was deliberately left. Use when the user asks to write or draft a PR description, or invokes /northwind-pr.
---

# /northwind-pr

Write the pull request description for the work on this branch.

The reviewer reads this before the diff. It is the only place they learn what you meant to do, what you actually proved, and what you knowingly left behind.

## Step 1 — Read before you write

Do all three. Write nothing until they are done.

| Read | Command | What you are after |
| --- | --- | --- |
| The branch diff | `git diff main...HEAD --stat`, then the diff itself | What actually changed, not what you remember changing |
| The sequence | `git log main..HEAD --oneline` | How the work was ordered, and the ticket ID in the commit subjects |
| The ticket | `docs/tickets/<TICKET-ID>.md` | The acceptance criteria, word for word |

Take the ticket ID from the branch name or a commit subject. If neither carries one, ask for it. Do not infer it from the diff.

If the branch has no commits, stop and say so. There is nothing to describe yet.

If a spec exists at `docs/specs/`, read it too, and note where the build departed from the plan.

## Step 2 — Title

```
<TICKET-ID>: <what it does>
```

Imperative and lowercase after the colon: `NWP-101: add export options`. Describe the change, not the files it touched.

## Step 3 — The four sections

### What changed

One paragraph, plain language. What can the app do now that it could not do before?

Not a file list — the diff is already a file list. Not "implemented export options functionality". Write the sentence you would say out loud to a colleague.

### How I verified it

The commands you ran and what they printed.

- Paste the real output. The summary line from the test run, the actual status code, the actual filename. Not a paraphrase of it.
- Name what you clicked and what appeared on screen, if you opened it in a browser.
- **If you did not run it, it does not go in this section.** Not as a plan, not as a suggestion, not as "tests should pass".
- If nothing was verified, write `Not verified.` and list what a reviewer would need to run. An empty section is honest. An invented one is not.

### Acceptance criteria

Copy the checkboxes from the ticket verbatim — the ticket's wording, not your summary of it.

- `[x]` only when you can point at the code that satisfies it.
- `[ ]` when it is not done.
- Partial work stays unticked, with one line underneath saying which half is done.

Never tick a box because you intended to meet it. A criterion reported honestly as unmet costs less than one the reviewer discovers for themselves — the first reads as a limitation, the second reads as a lie.

If a criterion was already satisfied before your change, tick it and say so. Taking credit for code you did not write is the same failure in a friendlier costume.

### Deliberately not done

Everything you chose not to do, and why.

- Out-of-scope items the ticket named.
- Bugs you found and left alone — name the file and the root cause, not the symptom, and say where the fix belongs.
- Follow-ups, rough edges, and the test you meant to write.

If there is genuinely nothing, write `Nothing.` Do not pad it.

## Step 4 — Hand it over

Write the finished description to a file and print it.

Opening the pull request is a separate decision and it is the user's. Do not run `gh pr create` unless you are asked to.

## Rules

- **No invented verification.** This is the one that matters. If it is not in this session's output, it does not go in the description. Re-run it or leave it out.
- **No numbers from memory.** A test count, a row count, a status code — read it back before you write it down. Written into a PR, it stops being a recollection and becomes your claim.
- **Say what you did not do.** Stating a limit is not a weakness. Discovering it is.
- **Plain language over ceremony.** Short paragraphs, real bullets. A reviewer skims first and reads second.
