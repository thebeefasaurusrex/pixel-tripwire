import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


class ScanTest(unittest.TestCase):
    def test_demo_detects_known_faults_and_strict_mode_fails(self):
        script = Path(__file__).resolve().parents[1] / "bin" / "scan.py"
        with TemporaryDirectory() as folder:
            frames = Path(folder) / "frames"
            cmd = [sys.executable, str(script), str(frames)]
            run = subprocess.run([*cmd, "--demo"], check=True, text=True, capture_output=True)
            flags = [json.loads(row)["flags"] for row in run.stdout.splitlines()]
            self.assertEqual(flags, [[], ["frozen"], ["flat"], ["magenta"]])
            strict = subprocess.run([*cmd, "--fail-on-flag"], text=True, capture_output=True)
            self.assertEqual(strict.returncode, 1)
            self.assertEqual(run.stdout, strict.stdout)
