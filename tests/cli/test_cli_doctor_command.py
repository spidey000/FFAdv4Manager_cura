import json
from contextlib import nullcontext

from ffadv4manager import cli
from ffadv4manager.core.models import PrinterStatus


def test_doctor_reports_printer_and_camera_checks(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("FFADV4MANAGER_CONFIG", str(tmp_path / "config.ini"))

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def status(self):
            return PrinterStatus(raw="", machine_status="READY")

    monkeypatch.setattr(cli, "FlashForgeClient", Client)
    monkeypatch.setattr(cli.urllib.request, "urlopen", lambda *_a, **_kw: nullcontext(type("Response", (), {"read": lambda self, _size: b"x"})()))
    assert cli.main(["--host", "printer", "doctor"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["host"] == "printer"
    assert {check["name"] for check in report["checks"]} == {"printer_status", "camera_http"}
    assert all(check["ok"] for check in report["checks"])


def test_doctor_does_not_report_partial_status_as_healthy(monkeypatch, tmp_path, capsys):
    from unittest.mock import Mock
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    client = Mock()
    client.status.return_value = PrinterStatus(raw='ok\n', status_errors={'M119': 'MachineStatus missing'})
    monkeypatch.setattr(cli, 'FlashForgeClient', lambda *_a, **_k: client)
    monkeypatch.setattr(cli.urllib.request, 'urlopen', lambda *_a, **_k: nullcontext(Mock()))
    assert cli.main(['--host', 'printer', 'doctor']) == 1
    check = json.loads(capsys.readouterr().out)['checks'][0]
    assert not check['ok']
    assert check['connection_status'] == 'partial'
