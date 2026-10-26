"""Offline, side-effect-free validations for the single-printer Cura integration."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
CURA = ROOT / "cura-profiles"


class CuraOnlyAdventurer4Tests(unittest.TestCase):
    def test_only_one_machine_is_listed(self):
        source = (CURA / "profile_list.toml").read_text(encoding="utf-8")
        machines = source.split("[machine_profiles]", 1)[1].split("[print_profiles]", 1)[0]
        self.assertEqual(len([x for x in machines.splitlines() if "=" in x and "manufacturer" not in x]), 1)
        self.assertIn("adventurer4 =", machines)
        self.assertIn("artillery_pla_basic =", source)

    def test_uses_original_cura_adventurer4_definition(self):
        source = json.loads((CURA / "official-cura" / "definitions" / "flashforge_adventurer4.def.json").read_text())
        self.assertEqual(source["name"], "Adventurer 4")
        self.assertEqual(source["overrides"]["machine_width"]["default_value"], 220)
        self.assertEqual(source["overrides"]["machine_depth"]["default_value"], 200)
        self.assertEqual(source["overrides"]["machine_height"]["default_value"], 250)

    def test_default_material_cautious(self):
        source = (CURA / "print_profiles" / "artillery_pla_basic.toml").read_text()
        self.assertIn("material_print_temperature = 205", source)
        self.assertIn("material_bed_temperature = 55", source)

    def test_cura_wsgi_server_does_not_replace_cli(self):
        source = (ROOT / "server" / "cura_bridge.py").read_text()
        self.assertIn("bridge.Handler = CuraHandler", source)
        self.assertIn("bridge.serve(require_access=require_access)", source)


if __name__ == "__main__":
    unittest.main()
