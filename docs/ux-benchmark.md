# Strata AI UX benchmark

Date: 2026-09-19

## The product problem

The existing interface is visually sparse, but the flow is not clear. Starting
depends on knowing to press Enter, the learning loop has no persistent sense of
place, graduated help is separated from the question it supports, feedback reads
like an evaluation report, and ending a session produces no useful reflection.

The redesign should make the product feel like a calm learning studio: focused,
serious, encouraging, and visibly adaptive without becoming a chat transcript or
a gamified course catalog.

## Comparable-product findings

### ChatGPT Study Mode

Study Mode uses guiding questions, scaffolded responses, knowledge checks, and
personalized support. Its most useful interaction principle for Strata is
layering: show just enough context for the current step and let the learner ask
to slow down, simplify, or go deeper.

Source: https://openai.com/index/chatgpt-study-mode/

### Khanmigo

Khanmigo's product promise is that the tutor guides the learner to find the
answer instead of simply giving it. Khan Academy's recent product research also
distinguishes help before and after a learner attempts a problem. For Strata,
that supports keeping the attempt primary and making the help ladder explicit,
predictable, and subordinate.

Sources:

- https://www.khanacademy.org/khan-labs
- https://blog.khanacademy.org/learning-in-the-open-what-ai-is-and-isnt-changing/

### Brilliant

Brilliant centers one concept at a time, begins with an attempt, gives immediate
custom feedback, and uses learning history to choose the next problem. Its
learning paths provide a recommended sequence and regular checkpoints, but the
lesson itself stays focused. For Strata, the transferable pattern is a prominent
current task plus a lightweight orientation rail—not a dashboard full of equal
choices.

Sources:

- https://brilliant.org/about/
- https://brilliant.org/help/features/what-are-learning-paths/

### Duolingo

Duolingo replaced a branching tree with one clear path because learners were
unsure what to do next. Practice and reference material were integrated into the
path instead of scattered across destinations. Strata should similarly expose a
single primary next action while keeping review, help, and exit available but
quiet.

Source: https://blog.duolingo.com/new-duolingo-home-screen-design/

## Design decisions

1. **One primary action per state.** Start diagnostic, check answer, continue,
   or return home. Secondary actions are visually quieter.
2. **Persistent orientation.** The top bar carries the topic and question number
   during a session; the question screen adds a compact progress marker.
3. **Attempt and help share one workspace.** The question and answer occupy the
   main column; the support rail explains the learning contract and contains the
   graduated help ladder.
4. **Feedback is coaching, not grading.** Status language is plain, evidence is
   tied directly to the learner's words, and the unresolved gap becomes “your
   next edge.”
5. **Sessions end in reflection.** Completion opens an evidence summary and a
   readable question-by-question timeline instead of a generic confirmation.
6. **A distinct visual voice.** Warm paper surfaces, deep green, restrained
   terracotta accents, serif display type, and functional borders create an
   editorial learning-tool character without gradients, excessive cards, or
   decorative gamification.

## Flow

`Choose a topic → answer a diagnostic → inspect evidence → take the next step → reflect`

History remains on the home screen as a continuation surface, not a competing
navigation system.
