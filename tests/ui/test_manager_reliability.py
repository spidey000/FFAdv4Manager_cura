from pathlib import Path
import subprocess


def test_manager_actions_and_recording_states():
    root = Path(__file__).resolve().parents[2]
    subprocess.run(['node', 'tests/ui/manager_reliability.cjs'], cwd=root, check=True)
