# Pixel Tripwire

Pixel Tripwire screens game screenshots for visible faults and scores detectors against frames you have labeled. The initial public release includes a local scanner, benchmark scorer, and synthetic examples.

## Install and scan

Clone this repository. Install Python 3.10 or later, then install Pillow.

    python -m venv .venv

On Windows PowerShell, use .venv/Scripts/python.exe in the following commands. On macOS or Linux, use .venv/bin/python.

    python -m pip install -r requirements.txt
    python bin/scan.py demo-frames --demo
    python bin/scan.py demo-frames --fail-on-flag

Use a new directory for the first command. The demo yields a normal frame, a frozen repeat, a black frame, and a frame with a magenta fault. The final command exits 1 because these synthetic faults trip the checks.

Pass a directory of your own PNGs to scan.py. Frames are sorted by filename. Each JSONL result contains the filename, flags, grayscale spread, and magenta ratio. The scanner checks near-flat frames, bright magenta pixels, and exact duplicates of the preceding frame. Tune the two cutoffs for your game. Static menus and deliberate magenta palettes can trip the checks, so strict mode is best for controlled capture sequences.

## Score a detector

Install Node.js 22 or later. No npm dependencies are required.

    node bin/score.mjs examples/labels.jsonl examples/answers.jsonl results

Provide one object per line. Each label needs frame_id, phase, and any planted fault type. Each answer needs frame, key, answerer, job, variant, seconds, and a value or error. The job selects the metric.

| Job | Label fields | Answer value | Report |
| --- | --- | --- | --- |
| J1 | phase | {"phase":"play"} | Phase accuracy |
| J2 | planted.type for a fault, omitted for clean | {"broken":true,"suspicion":1} | Fault detection, false alarms, and ranking |
| J3 | size, look, and cannons with id, bbox in pixels, and optional occluded | {"cannons":[{"x":0.1,"y":0.2}]} | Object precision and recall using normalized coordinates |

Use variant "base" for scored attempts. A synthetic test with working examples for all three jobs lives in test/score.test.mjs. The CLI writes scores.json, SCORECARD.md, and digest.txt. Use your own capture pipeline and detector. The scanner does not make model calls.

## Verify

    python -m unittest discover -s test
    node --test test/*.test.mjs

## License

Original project code is licensed under [Apache 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
