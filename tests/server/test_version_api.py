"""Version endpoint reports the real backend build without printer actions."""
from unittest.mock import Mock, patch

from server.cura_bridge import MosaicHandler
from server.version import backend_version_info


def test_backend_version_matches_project_metadata_or_installed_distribution():
    data = backend_version_info()
    assert data["version"] and data["version"] != "unknown"
    assert data["revision"] is None or (
        isinstance(data["revision"], str) and len(data["revision"]) == 8
    )


def test_version_get_is_read_only_and_authorized():
    handler = Mock()
    handler.path = "/api/version"
    handler.request_authorized.return_value = True
    with patch("server.cura_bridge.backend_version_info",
               return_value={"version": "0.2.0", "revision": "abc12345"}):
        MosaicHandler.do_GET(handler)
    handler.request_authorized.assert_called_once_with()
    handler.json.assert_called_once_with(200, {"version": "0.2.0", "revision": "abc12345"})


def test_version_get_rejects_unauthorized_requests():
    handler = Mock()
    handler.path = "/api/version"
    handler.request_authorized.return_value = False
    MosaicHandler.do_GET(handler)
    assert handler.json.call_args.args[0] in (401, 403)
    assert handler.json.call_args.args[1] == {"error": "Unauthorized"}
