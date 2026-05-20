# Examiner V2
Examiner is simple website for practicing your skills before exams.
Just simply [open the app](https://adaxiik.github.io/examiner-v2/) and drag and drop your DLC file to the app.

# DLC structure

### DLC file is a simple JSON file with the following structure:

```json
{
    "filetype": "examiner-dlc",
    "version": "1.3",
    "name": ... ,
    "poolsize" : ... , // optional (default: 5)
    "data": []
}
```
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
- `type` is a type of question, can be `self-assessment`, `question-with-answers`, `text` or `image`

If every question in a DLC has `type` `text` or `image` and its `question` object
has a `title` field, the DLC opens in **Questions Wheel** mode (see below)
instead of the standard examiner.

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
    "version": "1.3",
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

A questions-wheel DLC turns the app into a spinnable wheel. Every section is a
question; spinning picks one at random and shows it in a modal with the full
text. Questions can be toggled off via the sidebar (excluded from the wheel)
or hidden directly from the question modal.

### Wheel question structure

```json
{
    "id": 0,
    "type": "text",
    "question": {
        "type": "text",
        "content": "long question version",
        "title": "short version shown on wheel",
        "color": "#e53935"
    },
    "answers": [
        "optional hint text shown in the modal"
    ]
}
```

- outer `type` — `text` or `image` (controls how `question.content` is rendered)
- `question.title` — short label shown on the wheel section
- `question.content` — full question text (or image URL when `question.type` is `image`)
- `question.color` — hex color (e.g. `#e53935`) used for the wheel section
- `answers` — array of strings used as optional hints in the modal

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