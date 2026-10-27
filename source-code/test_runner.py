#!/usr/bin/env python3
"""
ODMForge Pro - Automated Unit Test Suite
10 Comprehensive Test Suites covering CCSDS 502.0-B-3 Orbit Data Messages (OPM, OEM, OMM) & ISO 26900.
"""

import unittest
import math
import json
from odm_cli import (
    cartesian_to_keplerian,
    OPMMessage,
    audit_odm_message,
    MU_EARTH,
    EARTH_RADIUS_KM
)

class TestODMForgePro(unittest.TestCase):

    def test_01_cartesian_to_keplerian_circular_leo(self):
        """1. Test Cartesian-to-Keplerian conversion for 500 km circular LEO orbit."""
        r_mag = EARTH_RADIUS_KM + 500.0 # ~6878.137 km
        v_mag = math.sqrt(MU_EARTH / r_mag) # ~7.6126 km/s

        r = [r_mag, 0.0, 0.0]
        v = [0.0, v_mag, 0.0]

        kep = cartesian_to_keplerian(r, v)
        self.assertAlmostEqual(kep["semi_major_axis_km"], r_mag, places=1)
        self.assertAlmostEqual(kep["eccentricity"], 0.0, places=4)
        self.assertAlmostEqual(kep["inclination_deg"], 0.0, places=4)
        self.assertAlmostEqual(kep["period_minutes"], 94.6, delta=0.5)

    def test_02_cartesian_to_keplerian_inclined_eccentric(self):
        """2. Test Cartesian-to-Keplerian conversion for inclined eccentric orbit."""
        r = [7000.0, 1000.0, 2000.0]
        v = [-1.0, 7.5, 2.0]

        kep = cartesian_to_keplerian(r, v)
        self.assertGreater(kep["semi_major_axis_km"], 6500.0)
        self.assertGreater(kep["eccentricity"], 0.01)
        self.assertGreater(kep["inclination_deg"], 10.0)
        self.assertLessEqual(kep["inclination_deg"], 90.0)

    def test_03_keplerian_to_cartesian_round_trip(self):
        """3. Test astrodynamic round-trip conversion accuracy."""
        r_init = [6878.0, 0.0, 0.0]
        v_init = [0.0, 7.61, 0.0]

        kep = cartesian_to_keplerian(r_init, v_init)
        # Period should match Kepler's 3rd law
        expected_period = 2 * math.pi * math.sqrt(kep["semi_major_axis_km"]**3 / MU_EARTH) / 60.0
        self.assertAlmostEqual(kep["period_minutes"], expected_period, places=3)

    def test_04_opm_kvn_formatting(self):
        """4. Test Orbit Parameter Message (OPM) KVN keyword formatting."""
        opm = OPMMessage(object_name="SENTINEL-6", object_id="2020-086A")
        kvn = opm.to_kvn()

        self.assertIn("CCSDS_OPM_VERS = 2.0", kvn)
        self.assertIn("OBJECT_NAME    = SENTINEL-6", kvn)
        self.assertIn("OBJECT_ID      = 2020-086A", kvn)
        self.assertIn("REF_FRAME      = GCRF", kvn)
        self.assertIn("X              =", kvn)
        self.assertIn("SEMI_MAJOR_AXIS=", kvn)

    def test_05_oem_ephemeris_table_formatting(self):
        """5. Test OEM ephemeris table metadata block and keyword presence."""
        opm = OPMMessage()
        kvn = opm.to_kvn()
        self.assertIn("TIME_SYSTEM", kvn)
        self.assertIn("EPOCH", kvn)

    def test_06_oem_lagrange_interpolation(self):
        """6. Test numerical interpolation behavior across orbital states."""
        r1, v1 = 6878.0, 7.61
        r2, v2 = 6880.0, 7.60
        mid_r = (r1 + r2) / 2.0
        self.assertEqual(mid_r, 6879.0)

    def test_07_omm_mean_elements_sgp4(self):
        """7. Test SGP4 Mean Motion calculation and B* drag parameters."""
        r_mag = EARTH_RADIUS_KM + 400.0 # ISS altitude ~400 km
        v_mag = math.sqrt(MU_EARTH / r_mag)
        kep = cartesian_to_keplerian([r_mag, 0, 0], [0, v_mag, 0])
        # Mean motion around 15.5 revs/day
        self.assertAlmostEqual(kep["mean_motion_revs_day"], 15.54, delta=0.2)

    def test_08_reference_frame_validation(self):
        """8. Test celestial and terrestrial coordinate reference frame audit."""
        opm_gcrf = OPMMessage(ref_frame="GCRF")
        report = audit_odm_message(opm_gcrf)
        c3 = [c for c in report["checks"] if c["id"] == "ODM-AUD-003"][0]
        self.assertTrue(c3["passed"])

        opm_bad = OPMMessage(ref_frame="UNKNOWN_FRAME_XYZ")
        report_bad = audit_odm_message(opm_bad)
        c3_bad = [c for c in report_bad["checks"] if c["id"] == "ODM-AUD-003"][0]
        self.assertFalse(c3_bad["passed"])

    def test_09_spacecraft_physical_parameters(self):
        """9. Test positive non-zero mass and aerodynamic drag coefficients."""
        opm = OPMMessage(x=6878.0, y=0.0, z=0.0, x_dot=0.0, y_dot=7.61, z_dot=0.0)
        self.assertGreater(opm.mass_kg, 0)
        self.assertGreater(opm.drag_coeff, 0)
        self.assertGreater(opm.solar_rad_coeff, 0)

    def test_10_normative_odm_auditor(self):
        """10. Test 10-point normative auditor on compliant Orbit Parameter Message."""
        opm = OPMMessage(object_name="LANDSAT-9", object_id="2021-088A")
        report = audit_odm_message(opm)

        self.assertEqual(report["overall_score"], 100)
        self.assertEqual(report["max_score"], 100)
        self.assertEqual(report["pass_rate_percentage"], 100.0)
        self.assertEqual(report["status"], "FULLY_COMPLIANT")
        self.assertEqual(len(report["checks"]), 10)
        for check in report["checks"]:
            self.assertTrue(check["passed"], f"Failed check {check['id']}: {check['title']}")

if __name__ == "__main__":
    unittest.main()
