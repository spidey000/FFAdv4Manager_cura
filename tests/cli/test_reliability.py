from unittest.mock import Mock
import pytest

from ffadv4manager import cli
from ffadv4manager.core.client import FlashForgeClient, ProtocolError
from ffadv4manager.core.models import PrinterStatus


@pytest.mark.parametrize('action', ['pause', 'resume', 'cancel'])
@pytest.mark.parametrize('response', ['Error: rejected\nok', '', 'CMD M25 Received.'])
def test_job_actions_fail_without_positive_ack(action, response):
    client = FlashForgeClient('printer')
    client.command = Mock(return_value=response)
    with pytest.raises(ProtocolError):
        getattr(client, action)()


@pytest.mark.parametrize('action', ['pause', 'resume', 'cancel'])
def test_job_actions_accept_positive_ack(action):
    client = FlashForgeClient('printer')
    client.command = Mock(return_value='ok\n')
    assert getattr(client, action)() == 'ok\n'


@pytest.mark.parametrize('action', ['print', 'upload'])
def test_paused_job_cannot_be_replaced(monkeypatch, tmp_path, action):
    client = Mock()
    client.status.return_value = PrinterStatus(raw='', machine_status='PAUSED')
    monkeypatch.setattr(cli, 'FlashForgeClient', lambda *a, **k: client)
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    assert cli.main(['--host', 'printer', action, 'part.gx']) == 2
    client.print_file.assert_not_called()
    client.upload_and_confirm_listed.assert_not_called()


def test_slicer_entry_uses_integrated_server(monkeypatch):
    from server import cura_bridge, ad4_bridge
    serve = Mock()
    monkeypatch.setattr(cura_bridge, 'serve', serve)
    monkeypatch.setattr(ad4_bridge, 'SELECTED', {'host': None, 'profile': None})
    assert cli.main(['--host', '192.168.1.42', 'slicer']) == 0
    serve.assert_called_once_with(require_access=False)
    assert ad4_bridge.SELECTED['host'] == '192.168.1.42'
