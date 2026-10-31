"""Contract tests for the mandatory per-PR version gate."""
import unittest

from scripts.check_pr_version import (
    check_version_policy,
    components_for_path,
    parse_version,
)


def ui(version):
    return f'const VERSION_UI = "{version}";'


def api(version):
    return f'[project]\nversion = "{version}"'


def issues(changed, ui_new="0.1.0", api_new="0.2.0"):
    return check_version_policy(
        ui("0.1.0"), ui(ui_new),
        api("0.2.0"), api(api_new), changed
    )


class VersionPolicyTests(unittest.TestCase):
    def test_documentation_requires_ui_release_number(self):
        self.assertIn("UI: PR must increase", " ".join(issues(["README.md"])))
        self.assertEqual([], issues(["README.md"], ui_new="0.1.1"))

    def test_ui_change_requires_ui_only(self):
        path = ["overlays/mosaic/public/ad4-v3.css"]
        self.assertEqual([], issues(path, ui_new="0.1.1"))
        self.assertIn("UI: PR must increase", " ".join(issues(path, api_new="0.2.1")))

    def test_backend_change_requires_backend_only(self):
        path = ["server/cura_bridge.py"]
        self.assertEqual([], issues(path, api_new="0.2.1"))
        self.assertIn("API: PR must increase", " ".join(issues(path)))

    def test_mixed_change_requires_both(self):
        paths = ["server/cura_bridge.py", "overlays/mosaic/public/ad4-v3.js"]
        self.assertEqual(2, len(issues(paths)))
        self.assertEqual(1, len(issues(paths, ui_new="0.1.1")))
        self.assertEqual(1, len(issues(paths, api_new="0.2.1")))
        self.assertEqual([], issues(paths, ui_new="0.1.1", api_new="0.2.1"))

    def test_install_script_affects_both(self):
        self.assertEqual({"API", "UI"}, components_for_path("scripts/install.sh"))
        self.assertEqual(2, len(issues(["scripts/install.sh"])))

    def test_downgrade_is_rejected_even_on_unrelated_component(self):
        self.assertIn("decreased", " ".join(issues(["README.md"], ui_new="0.0.9")))
        self.assertIn("decreased", " ".join(issues(["README.md"], ui_new="0.1.1",
                                                    api_new="0.1.9")))

    def test_minor_and_major_increments_are_accepted(self):
        self.assertEqual([], issues(["README.md"], ui_new="0.2.0"))
        self.assertEqual([], issues(["server/cura_bridge.py"], api_new="1.0.0"))

    def test_versions_have_strict_semver_format(self):
        for invalid in ("0.01.1", "0.1", "0.1.0-dev", "no-version"):
            with self.assertRaises(ValueError):
                parse_version(ui(invalid), "UI")
        with self.assertRaises(ValueError):
            parse_version(api("v0.2.1"), "API")


if __name__ == "__main__":
    unittest.main()
