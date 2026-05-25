# Examiner V2
Examiner is simple website for practicing your skills before exams.
Just simply [open the app](https://adaxiik.github.io/examiner-v2/) and drag and drop your DLC file to the app.

# DLC structure

### DLC file is a simple JSON file with the following structure:

```json
{
    "filetype": "examiner-dlc",
    "version": "1.4",
    "type": "prompter" | "wheeler", // optional, default "prompter"
    "name": ... ,
    "poolsize" : ... , // optional (default: 5)
    "data": []
}
```

The optional top-level `type` field selects the app's mode:

- `prompter` (default) — the standard examiner with a question pool.
- `wheeler` — the spinnable Questions Wheel.

### The `data` field is an array of questions. Each question is an object with the following structure:

```json
{
    "id": .. ,
    "type": .. ,
    "question": {
        ..
    },
    "answers": [
        ..
    ]
 }
```

- `id` is unique question id, recommended to use 0,1...
- `type` is a type of question — `self-assessment` or `question-with-answers`

## For type `question-with-answers`:

### `question` is an object with the following structure:
- `type` (text/image)
- `content` or `src`, depending on the type

### `answers` is an array of objects with the following structure:
- `type` (text/image/text-md)
- `content` or `src`, depending on the type (`content` for text and text-md)
- `correct` (true/false)
    
## For type `self-assessment`:
- same as `question-with-answers`, but without `correct` field in `answers`

# Example

```json
{
    "filetype": "examiner-dlc",
    "version": "1.4",
    "name": "example",
    "data": [
        {
            "id": 1,
            "type": "question-with-answers",
            "question": {
                "type": "text",
                "content": "What is the capital of Czech Republic?"
            },
            "answers": [
                {
                    "type": "text",
                    "content": "Ostrava",
                    "correct": false
                },
                {
                    "type": "text",
                    "content": "Prague",
                    "correct": true
                },
                {
                    "type": "text",
                    "content": "Brno",
                    "correct": false
                }
            ]
        },
        {
            "id": 2,
            "type": "question-with-answers",
            "question": {
                "type": "text",
                "content": "What is the capital of Slovakia?"
            },
            "answers": [
                {
                    "type": "text",
                    "content": "Bratislava",
                    "correct": true
                },
                {
                    "type": "text",
                    "content": "Kosice",
                    "correct": false
                },
                {
                    "type": "text",
                    "content": "Nitra",
                    "correct": false
                }
            ]
        },
        {
            "id": 3,
            "type": "self-assessment",
            "question": {
                "type": "text",
                "content": "What is the capital of Hungary?"
            },
            "answers": [
                {
                    "type": "text",
                    "content": "Budapest"
                }
            ]
        }
    ]
}
```

# Questions Wheel

A questions-wheel DLC turns the app into a spinnable wheel. Every section is
a question, colored by its `question.color`. Spinning picks one at random and
shows it in a modal with the full question text. Questions can be hidden from
the wheel via the question list in the sidebar (sorted by color) or via the
"Hide question" button in the modal.

To enable wheel mode set the top-level `"type": "wheeler"` field on the DLC.
Each question is currently a `self-assessment` (free-form question with
optional hint text); `question-with-answers` may be added to the wheel in
the future.

### Wheel question structure

```json
{
    "id": 0,
    "type": "self-assessment",
    "question": {
        "type": "text",
        "content": "long question version",
        "title": "short version shown on wheel",
        "color": "#e53935"
    },
    "answers": [
        "optional hint text — supports **markdown**"
    ]
}
```

- outer `type` — `self-assessment`
- `question.type` — `text` or `image`, controls how `question.content` renders
- `question.content` — full question text (or image URL when `question.type` is `image`)
- `question.title` — short label shown on the wheel section
- `question.color` — hex color (e.g. `#e53935`) used for the wheel section
- `answers` — array of strings used as optional hints in the modal; rendered
  as markdown when the user presses "Show hint"

### Wheel controls

Top section title:

- Gear icon — configuration panel (wheel size, text size, spin time, show
  hints toggle, self-rating toggle, members toggle). All settings persist
  across sessions.
- Speaker icon — sound configuration (only sounds used in the wheel are
  shown).

The wheel also remembers its current state per DLC — which questions are
hidden, the section order, and collapsed groups — so reopening the same DLC
restores where you left off.

Sidebar header (Questions):

- `⟳` — Show all hidden questions (restores them onto the wheel).
- `⇄` — Shuffle the wheel's section order. Only the wheel is randomized;
  the sidebar list always stays grouped by color.
- 🔍 — Search the question list by title.

Each question row also has an open button (eye icon, shown on hover) that
opens that question's modal directly, so you can review (and rate) a specific
question without spinning.

Inside the modal:

- "Show hint" — reveals the markdown-rendered hints (only present if hints
  are enabled in the config and the question has any).
- Self-rating stars (1-5) — when enabled in the config, rate how well you
  know the question. The rating is saved per DLC between sessions and shown
  as a small `★` badge next to the question in the sidebar.
- "Close question" — closes the modal, keeps the question on the wheel.
- "Hide question" — removes that section from the wheel.

### Members (optional, off by default)

Enable the **Members** toggle in the configuration panel to track a group of
people answering each question. The member roster is saved per DLC, so it is
restored whenever the same DLC is reopened.

- Once enabled, a people icon appears next to the gear button in the header.
  Click it to open the roster panel, where you can add members, rename them
  (click the name and type), remove them, or temporarily disable one with the
  per-member switch. Disabled members are skipped by the roll and don't count
  toward a question's completion until re-enabled.
- The roster panel also has two bulk actions: **Show unanswered** brings back
  every question that an enabled member still hasn't answered, and **Hide
  answered** hides every question all enabled members have already answered.
- When viewing a question, a members button (top-right of the question box)
  expands the members list on the right side of the modal. There you can:
  - mark each member as having answered the current question (click to
    toggle), and
  - **Roll** a random member who has not answered the question yet — the
    pick cycles through the remaining candidates and slows to a stop on the
    chosen one.
- Each member's answered status is saved per question (and per DLC) so it
  survives reloads, just like hidden questions.
- When every member has answered a question, that question is automatically
  hidden from the wheel. The question view stays open so you can review it
  (or undo a mark); close it yourself when done. The sidebar shows an
  `answered/total` badge per question.

See [example-wheel.dlc](example/example-wheel.dlc) for a complete example.

# Text to DLC tool
`txt2dlc.py` is a simple tool for converting text files to DLC files. 

## Usage
```sh
./txt2dlc.py <input file>
```

## Input file structure
Input file has following structure:
```
# question
+ correct answer
- wrong answer
- wrong answer

@ self-assessment question
+ correct answer (not recommended to mix with markdown)
! # Markdown support
! ## starts with !
! - list elements
! - are supported
! - as well as **bold** and *italic*
! - and code blocks, etc..
! 
! ![image from url](https://example.com/image.png)
! ![image file](example/image.png)
!
! [link](https://example.com)
```

## Example
```
# What is the capital of Czech Republic?
- Ostrava
+ Prague
- Brno

# What is the capital of Slovakia?
+ Bratislava
- Košice
- Nitra

# What is the capital of Poland?
+ Warsaw
- Kraków
- Wrocław

@ What is the capital of Hungary?
+ Budapest
```
Output is displayed above.

See [example input](example/example.txt) and [example output](example/example.dlc).