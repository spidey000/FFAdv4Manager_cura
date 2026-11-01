import json

from ffadv4manager import cli
from ffadv4manager.core.models import PrinterStatus


def test_monitor_appends_jsonl_status_record(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("FFADV4MANAGER_CONFIG", str(tmp_path / "config.ini"))
    output = tmp_path / "print.jsonl"

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def status(self):
            return PrinterStatus(raw="", machine_status="BUILDING", current_file="part.gx")

    monkeypatch.setattr(cli, "FlashForgeClient", Client)
    assert cli.main(["--host", "printer", "monitor", "--output", str(output), "--count", "1"]) == 0
    record = json.loads(output.read_text().splitlines()[0])
    assert record["event"] == "state_change"
    assert record["machine_status"] == "BUILDING"
    assert record["current_file"] == "part.gx"
    capsys.readouterr()


def test_monitor_records_total_communication_loss_but_not_busy_as_offline(monkeypatch, tmp_path, capsys):
    from unittest.mock import Mock
    from ffadv4manager.core.control import ControlBusy
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    monkeypatch.setattr(cli.time, 'sleep', lambda _: None)
    client = Mock()
    client.status.side_effect = [ControlBusy('busy'), PrinterStatus(raw='', status_errors={'M119': 'refused'})]
    monkeypatch.setattr(cli, 'FlashForgeClient', lambda *_a, **_k: client)
    output = tmp_path / 'events.jsonl'
    assert cli.main(['--host', 'printer', 'monitor', '--output', str(output), '--count', '2']) == 0
    events = [json.loads(line)['event'] for line in output.read_text().splitlines()]
    assert events == ['status_unavailable', 'offline']
    capsys.readouterr()
