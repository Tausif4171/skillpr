# Launch post

Rule from the method: say what it does, show it, name the gap, **no job ask**.

---

## X / Twitter

Skillsync made skills hot-reload to your whole team.

That means one person edits a SKILL.md at 11pm and every teammate's agent is
running it by 11:01. No diff. No approval. No revert.

I opened their skill page today to check I wasn't making this up. It has a cloud
icon, an edit pencil and a delete bin. That's it. No history behind the pencil.

Code gets a pull request. Skills get nothing.

So I built `skillpr` — a diff and a risk verdict for two versions of a skill
folder. It reads the changed lines and asks one question: does this line give the
agent power it didn't have before?

curl … | bash → flagged
a new `Bash` in allowed-tools → flagged
"publish without asking the user" → flagged (that one's prose, no scanner sees it)
an encoded blob → flagged

Every finding quotes the file, the line, and the exact text. If it can't point at
the line, it says nothing.

Zero dependencies. 22 tests. Doesn't run the skill and can't prove one is safe —
it's the missing diff, not the missing scanner.

@skillsync — the hot-reload is the right default for a personal folder. For a
shared one, is a review step on the roadmap, or is the open file the point?

---

## LinkedIn

**A skill is not a note. It's instructions your agent obeys.**

Which is why this line, from Skillsync's HN launch, stuck with me:

> "Once someone updates a skill, it hot-reloads and make the latest version
> available to everyone instantly."

Great for your own folder. Risky for a shared team library — one edit reaches
every teammate's agent, with no diff, no approval, no way to pin or revert.

I checked before posting this. Their skill page shows the skill, the description,
which agents have it, a cloud icon, an edit pencil and a delete bin. No history
behind the pencil. An edit is final.

A user in the same thread put it better than I could: *"figuring out when someone
makes an update whether that's something that deserves human review… if skills are
the place where guardrails exist, who watches the watchmen?"*

Their workaround: ship a second skill whose job is to help you update skills.

So I spent a day on the missing piece. `skillpr` diffs two versions of a skill
folder and returns a verdict.

What it caught on my test pair:
• `curl … | bash` added to a deploy script
• `Bash` silently added to `allowed-tools`
• a new line telling the agent to publish "without asking the user to confirm"
• two new outbound hosts
• an upload endpoint with a bearer token

That third one is the interesting one. No code scanner would flag it — it's plain
English in a markdown file. That's the part people miss: the attack surface in a
skill is mostly *prose*.

Design rule I kept from my last project: no finding without a quote. Every result
carries the file, the line, and the exact text. If it can't point at it, it stays
quiet.

Honest limits: it doesn't run the skill, doesn't sandbox it, and a careful author
could rephrase past every rule. It's the missing diff, not the missing scanner.

Code: github.com/Tausif4171/skillpr

Would love to know if teams actually want the gate, or if hot-reload is
deliberately the point.

---

## Do not do

- Don't say "I found a security hole in Skillsync." You found a design trade-off.
- Don't say "you should add this." Ask whether the trade-off is intentional.
- Don't tag the company without tagging a founder, and don't tag five people.
- Don't ask for a job. Not in the post, not in the first reply.
