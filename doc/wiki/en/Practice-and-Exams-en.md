# Practice and Exams

## Similar-question practice

Open similar-question practice from a question's detail page and choose a difficulty; the AI generates a variant testing the same knowledge points. Generated questions are fill-in-the-blank or free-response, and the question text should not carry a question number, score or multiple-choice options.

Answer on your own first, then view the answer and analysis and record whether you got it right. Records are linked to the original question for reviewing practice history and evaluating mastery.

Answers are checked when you submit. If your text-only answer matches the reference answer (ignoring spaces, formula delimiters and prefixes like "The answer is"; for multiple choice only the option letters are compared), it is marked correct right away. Otherwise the AI compares it with the reference answer and analysis and gives a one-line reason. Equivalent forms (such as `1/2` and `0.5`) count as correct; giving only some of several answers counts as wrong. If the AI check fails, you choose the result yourself. The check is only a suggestion and can be changed before saving.

Each question keeps the most recently generated variant and its solution. Reopening practice shows that question and when it was generated without calling the AI again; click "Regenerate" for a new one, which replaces the saved variant.

Saving a practice result also saves your answer, working notes and the automatic grading reason in the original question’s expandable answer history. Changing the suggested result does not overwrite the original grading reason. Grading checks the displayed question version; if another tab has regenerated it, automatic grading stops and your work is preserved. You can check against the answer on the current page and confirm the result manually, or reload the new question.

## iPad and Apple Pencil handwriting

Original reviews and similar-question practice both offer Keyboard / Handwriting. Typed text is optional: either text or strokes enable submission, and both are graded together. Switching keeps both inputs. On mobile the question is above the canvas; wide screens (1024px and up) place them side by side. Vector drafts remain in the current page across rotation and window resizing. Refreshing, leaving the question or successfully generating a new one clears unsaved drafts.

- Use black, blue or red ink in three widths. Pencil uses actual pressure; mouse and touch use simulated pressure.
- The eraser removes whole strokes. Undo/redo keeps the last 50 operations, including clear. Choose blank, grid or ruled paper.
- Pencil only turns on after the first pen input, and the browser remembers that a pen was detected. Fingers scroll when enabled and draw on the canvas when disabled. Pen input takes over an unfinished touch stroke and rejects palm touches. Scroll using the toolbar or outside the canvas as well.
- Submission crops the strokes with padding onto white, choosing the smaller PNG/JPEG. The longest edge is at most 1600px and the image at most 1.5MB, reducing resolution and quality if necessary. Paper guides are excluded. Export failure keeps the draft for retry; submitted strokes are read-only.

Answers with handwriting always use AI grading, asking for transcription, step checking and specific errors; matching typed text cannot bypass image grading. Configure a model that supports images. OpenAI/Azure, Gemini and Anthropic reuse their existing multimodal transports. Transcription is shown separately and never replaces typed text. Illegible content should be marked rather than guessed; you still confirm correct/incorrect. If AI grading fails, the answer remains available for manual confirmation.

Confirmation saves the image (`answerImageUrl`), transcription (`recognizedAnswer`), typed text and grading reason in expandable answer history. Images use authenticated local storage. Full backups carry their contents, and older backups restore missing fields as null. `POST /api/practice/grade` and `/api/practice/record` accept optional `answerImage` data URLs (PNG/JPEG/WebP, 1.5MB maximum). Grading requires text or an image; `record` also accepts optional `recognizedAnswer`.

Submitting for grading sends handwriting to the configured AI provider under existing AI data consent. See the [privacy notice](../../PRIVACY.en.md).

## Mastery

Mastery probability is estimated from the actual answer history linked to the original question, including similar-question practice, exam answers and repeated imports.

- AI evaluation is used first; if the AI call fails, a rule-based estimate is used and the source is recorded.
- A question's status is decided automatically by its answer records and mastery probability, not marked manually:
  - **To review**: no similar-question records yet.
  - **Reviewing**: has records and a mastery probability below the mastered threshold (also used while a new record is still being evaluated).
  - **Mastered**: has records and a mastery probability at or above the mastered threshold.
- The mastered threshold defaults to 50% and each user can change it in **Settings → General** (a whole number from 1% to 100%). Status filters, statistics and the mastery scope of random exam papers use the new threshold immediately.
- Notebooks can be filtered by these three statuses; the "not mastered" scope of random exam papers covers both to review and reviewing.
- Without usable answer records, the mastery probability is empty.
- Evaluation runs in the background, so after recording results you may need to wait or refresh to see the update.

Mastery probability helps plan reviews. It does not guarantee the student understands the question and is not an exam score.

![Variant answer history and mastery probability under the original question](https://raw.githubusercontent.com/shuiguojiao/wrong-notebook/a5f816515e3dc31dcdb90c9fa456baed12eef94d/doc/screenshots/en/mastery-history.png)

## Daily review

The **Review** page in the navigation lists questions due today, and the home page shows how many are due.

- Reviews follow intervals of 1, 2, 4, 7, 15 and 30 days: the first review is the day after adding a question; each correct answer moves it to the next interval, and a wrong answer starts over.
- Intervals count from the most recent answer, whether from original reviews, similar-question practice, manual entry, exams or duplicate imports; "not attempted" records do not change the schedule.
- After 6 correct answers in a row the question is no longer scheduled. Dates follow the application time zone, and the earliest due questions come first.
- Open a card for details, or click **Practice** to practice right away; after you record a result the question leaves the list until its next interval.

Click **Start review** for a continuous session, filtered by subject. The limit defaults to 20 questions, with 10 or all also available. IDs and their order are fixed at the start, so saving results and changing the due list cannot skip questions in the active session. Phones show one question at a time; desktops use a centered wide layout with a question counter and progress bar.

- **Retry original (default)**: shows the Markdown question, figure and original-image viewer while hiding the solution. Enter an answer and optional working notes for AI grading, then compare the reference answer, analysis and previous wrong answer. Confirm correct or wrong before saving; the AI result is only a suggestion. Missing reference answers or failed AI checks still allow manual confirmation.
- **Similar-question practice**: reuses the existing practice flow after switching. A cached variant can be reused; generation quota is spent only when you click Generate. No next question or variant is generated ahead of time. Switching modes preserves this question’s drafts; saving locks the mode and result.
- **Skip**: saves no record and leaves the schedule unchanged. After saving, click **Next question**; the final summary counts correct, wrong and skipped questions and lists each next review date. Skipped questions retain their original due date, and completed schedules show a completion message.

Viewing originals uses no AI. Original grading shares the existing grading quota and recoverable-request mechanism. Original-review records use `source: "review"`, saving typed/handwritten answers, transcription, working notes and grading reason without variant fields. All correct/wrong records use the same schedule algorithm. Full JSON backups preserve the source and work; the current version is 15, including handwriting images and transcription. Session progress stays in the current page only; refreshing or leaving requires starting a new session, while saved answer records remain.

## Generate an exam paper

1. Open the exam entry and choose the scope: notebooks, knowledge points, question types, mastery and so on, plus the mode (Similar Questions / Original). Question types are optional (leave empty for no restriction); you can also select one or more types to only pick questions of those types, including "Not set" (questions without a question type).
2. The system picks questions from that scope (by default **Least practiced first**: questions with fewer practice records come first; for ties, questions that have never appeared in an existing exam paper come first, then random; **Fully random** is also available).
3. **Similar Questions** (default): the AI generates a variant for each question. Check the progress in background tasks; when it finishes, open the paper and check the questions, figures and answers. You can choose the difficulty (Easy / Medium / Hard / Challenge).
4. **Original**: uses the original question text, answer, analysis and figure directly. No AI is called and no AI quota is consumed; the paper is ready to print immediately. No difficulty selection needed.
5. Print or export it, and afterwards record the result for each question.

When creating an exam, turn on **Generate A/B papers simultaneously**. The system picks up to 2× the question count of non-overlapping questions under the same conditions and splits them into two parallel papers, balanced by question type and difficulty: Paper A and Paper B have no overlapping questions, with similar type distributions and difficulty levels—suitable for class quizzes or comparison practice. Titles automatically get the suffixes "(Paper A)" and "(Paper B)". In Similar Questions mode, each paper generates separately and consumes its own AI quota. When there are not enough source questions, Paper B is still created as long as it gets at least one question (it may have fewer questions than Paper A) and a warning is shown; if Paper B would get zero questions, only Paper A is created.

Original-mode papers do not show the "Regenerate question" button (the original question cannot be replaced), but "Regenerate solution" is still available; recorded results store no difficulty.

In the exam list a paper shows Generating, then Generated (or Partly failed / Failed), and Completed once results have been entered.

Exam papers keep the source question IDs so you can go back to the originals. Results can be correct, wrong or not attempted; the same question can keep several results, all linked to the original question's review history.

Each question can have its own score (0–1000, up to one decimal place such as 2.5), or you can apply a uniform score to every question at once; leaving it empty means no score is set. The paper header shows the total score (only questions with a score are summed, with a note of how many questions have no score). In the printout the question number is followed by "(N pts)", and the full score line sits under the title; papers without any score print exactly as before. Scores are included in backup export and import.

The exam detail page has a "Group by question type" switch: when on, questions are grouped into sections such as Single Choice and Fill in the Blank (in the default question-type order), each section header shows the question count and the score subtotal ("N question(s), X pts in total", noting how many questions have no score when partially set), and question numbers run continuously across sections. Printing and HTML export use the same sections, with bold section titles bordered above and below, suitable for black-and-white printing. The question type is snapshotted from each source question when the paper is created; for older papers without a snapshot, the current type of the linked source question is used, and questions whose source was deleted or whose type is unknown fall into "Other". The switch and the type snapshots are included in backup export and import (backup version 11).

![Source IDs and recorded results in a generated exam paper](https://raw.githubusercontent.com/shuiguojiao/wrong-notebook/a5f816515e3dc31dcdb90c9fa456baed12eef94d/doc/screenshots/en/exam.png)

## Print and export

| Method | Contents and options |
| --- | --- |
| Print questions | Prints the filtered questions, with question text or original image, answers, analysis, knowledge points and image scale as options; when answers and analysis are hidden, you can choose a global answer-space mode (auto by question type, none, small, medium, large) and manually adjust each question's blank space (0–600 px) via its slider or `-`/`+` buttons; the value is saved to the question and reused next time, and "Reset" or "Reset custom spaces" returns to the global mode. With many questions the selection list starts collapsed; search by question text, ID or knowledge point, and Select / Deselect / Invert apply to the search results. "Don't print this question" at the top right of each question removes it from the printout. Display options are remembered in this browser. Original images load on demand; clicking Print loads all images first, then opens the print dialog; when printing, choice options listed one per line are laid out across 4, 2 or 1 columns depending on their length, and standalone answer lines get writing room above them |
| Print exam papers | Print preview with an optional answer page and a choice of answer space below each question: automatic by question type (about 0.3–0.4 cm for true/false, choice and fill-in questions, about 6.3 cm for worked problems plus about 3.2 cm per extra sub-question, up to about 14.8 cm) or a fixed none, small (about 1.6 cm), medium (about 3.2 cm) or large (about 6.3 cm), plus per-question manual blank-space adjustment (0–600 px), saved with the exam and reused next time; the global mode is remembered in this browser. Exams with figures also allow adjusting figure scale (10–200%) and alignment (left / center / right, default center) per question or uniformly across the exam, saved for display, printing and backups; when printing, choice options listed one per line are laid out across 4, 2 or 1 columns depending on their length, and standalone answer lines get writing room above them |
| Download HTML | Save the exam paper as HTML and open it in a browser |
| Save as PDF | Choose "Save as PDF" in the browser's print dialog |

Before printing, check page breaks, formulas and figures. Paper size, scaling and margins are controlled by the browser's print settings.

## Statistics

Mistake statistics show total questions, mastered count, mastery rate, subject distribution and a trend chart. Practice statistics separately show practice count, accuracy, active days, and distribution by difficulty and subject. Both tabs support filtering by time range (last 7 days / 30 days / 6 months / all time) and subject. When a subject is selected, clicking the To Review / Reviewing / Mastered cards jumps directly to the corresponding filtered error list of that notebook (the URL carries a `?mastery=` parameter to preset the filter). The trend chart shows daily or monthly bars depending on the selected granularity, with two series: "Added" counts mistakes created within each bucket, and "Newly Mastered" counts mastered mistakes whose most recent mastery evaluation falls within each bucket (an approximation using the latest evaluation time as the mastery time; such mistakes may have been created before the range, so they are not restricted by the creation-time filter). Comparing the two series reveals whether your mistake notebook is shrinking or accumulating. Below the subject distribution and trend chart, the mistake statistics tab also shows a "Mistake Cause" card: the top half is a donut chart of attempt status (not attempted / wrong attempt / unknown) with counts and percentages, and the bottom half is a horizontal bar list of error types (name + count + progress bar). Error type is free text; only the top 7 by count are shown and the rest are merged into "Other". When no error types have been filled in yet, a hint is shown instead. The stats respect the current time-range and subject filters. Next to the Mistake Cause card, the mistake statistics tab also shows a "Difficulty Distribution" card: for each difficulty level (1–5 stars), the total number of mistakes and the mastered count are displayed as a stacked horizontal bar, with unrated mistakes listed separately. When there are no rated mistakes at all, this card is hidden. The mistake statistics tab also shows a "Weak Knowledge Points" ranking below the overview and progress bar: the top 10 knowledge points you most need to reinforce, sorted by unmastered mistake count and recent practice error rate. Clicking a row jumps to the corresponding notebook's error list filtered by that knowledge point (the URL carries a `?tag=` parameter). The ranking only counts mistakes within the selected time range and subject filter, and the recent accuracy uses the same criteria as practice statistics (attempted records in the last 30 days, excluding duplicate-import records). The practice stats tab also includes a "Learning Calendar" heatmap at the top: a GitHub-style grid showing daily learning activity (recorded mistakes + practice count) for the last 26 weeks, along with current streak, longest streak and total active days. Recording mistakes counts as activity, so the heatmap is visible even when there are no practice records yet. At the bottom of the practice stats tab there is also a "Repeated Mistakes" ranking: the top 10 questions answered wrong 2 or more times within the selected range (including similar-question practice, exam answers, manual entry and duplicate-import wrong records). Each row shows a question preview, subject, wrong count, the most recent wrong date and the review status; clicking a row opens the question details, highlighting questions worth revisiting. When there are none, a short hint is shown instead.

Knowledge points also live in the stats center: the **Knowledge Points** tab shows a tag system switcher at the top (visible once another tag system is imported), a usage frequency Top 20 card below (counting identically named points in different tag systems or subjects separately), and the standard knowledge points for each stage and subject with custom tag management at the bottom, all shown and added per the selected system. Old `/tags` links redirect here.

Dates and statistics boundaries use the [app time zone](Settings-and-Users-en). Changing the time zone affects daily and monthly grouping but does not shift the times stored in the database.

Related code: [mastery evaluation](https://github.com/shuiguojiao/wrong-notebook/blob/main/src/lib/mastery.ts) · [exam papers](https://github.com/shuiguojiao/wrong-notebook/blob/main/src/lib/exam/exam.ts).
