from ffadv4manager import cli
from ffadv4manager.core.models import PrinterStatus


def test_notify_dispatches_requested_desktop_event(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("FFADV4MANAGER_CONFIG", str(tmp_path / "config.ini"))
    monkeypatch.setattr(cli.shutil, "which", lambda _name: "/usr/bin/notify-send")
    calls = []
    monkeypatch.setattr(cli.subprocess, "run", lambda args, **_kwargs: calls.append(args))

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def status(self):
            return PrinterStatus(raw="", machine_status="PAUSED")

    monkeypatch.setattr(cli, "FlashForgeClient", Client)
    assert cli.main(["--host", "printer", "notify", "--events", "paused", "--count", "1"]) == 0
    assert calls == [["/usr/bin/notify-send", "FFADV4Manager", "Printer state: paused"]]
    capsys.readouterr()


def test_notify_distinguishes_communication_loss_partial_status_and_busy(monkeypatch, capsys):
    import argparse
    import json
    from unittest.mock import Mock
    from ffadv4manager.core.control import ControlBusy
    monkeypatch.setattr(cli.shutil, 'which', lambda _: '/usr/bin/notify-send')
    monkeypatch.setattr(cli.time, 'sleep', lambda _: None)
    desktop = []
    monkeypatch.setattr(cli.subprocess, 'run', lambda args, **_: desktop.append(args))
    client = Mock()
    client.status.side_effect = [
        PrinterStatus(raw='', machine_status='READY'),
        PrinterStatus(raw='SD printing byte 98/100', status_errors={'M119': 'No response'}),
        ControlBusy('busy'),
        PrinterStatus(raw='', status_errors={'M119': 'Connection refused'}),
        PrinterStatus(raw='', machine_status='IDLE'),
    ]
    args = argparse.Namespace(interval=.1, count=5, events='offline,ready')
    assert cli._notify(client, args) == 0
    events = [json.loads(line)['event'] for line in capsys.readouterr().out.splitlines()]
    assert events == ['ready', 'offline', 'ready']
    assert len(desktop) == 3
