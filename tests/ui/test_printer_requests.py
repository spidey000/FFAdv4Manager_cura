from pathlib import Path
import subprocess


def test_shared_request_transport():
    subprocess.run(['node', 'tests/ui/printer_requests.cjs'],
                   cwd=Path(__file__).resolve().parents[2], check=True)
