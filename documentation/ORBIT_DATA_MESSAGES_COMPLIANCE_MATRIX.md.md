# Orbit Data Messages (ODM) 10-Point Normative Compliance Matrix

| Rule ID | Check Item | Normative Reference | Verification Method | Pass Criteria |
| :---- | :---- | :---- | :---- | :---- |
| **ODM-001** | CCSDS\_OPM\_VERS Syntax | CCSDS 502.0-B-3 §3.2 | Regex & Schema Parse | Must equal 2.0 or 3.0 |
| **ODM-002** | Mandatory Metadata Integrity | CCSDS 502.0-B-3 §3.3 | Field Presence Check | OBJECT\_NAME, OBJECT\_ID, CENTER\_NAME, REF\_FRAME, TIME\_SYSTEM all present |
| **ODM-003** | Reference Frame Validity | ISO 26900 §4.2 | Enumeration Check | REF\_FRAME in {GCRF, EME2000, ITRF, ICRF, TEME} |
| **ODM-004** | ISO 8601 Epoch Format | CCSDS 502.0-B-3 §2.4 | Datetime Strict Parse | YYYY-MM-DDThh:mm:ss\[.sss\]Z format |
| **ODM-005** | Cartesian State Physical Limits | Celestial Mechanics | Vector Range Check | Radius in \[6400, 100000\] km, Velocity in \[0.5, 12.0\] km/s |
| **ODM-006** | Semi-Major Axis Consistency | Astrodynamics | Geometric Check | a \> 6378.137 km (Earth radius clearance) |
| **ODM-007** | Eccentricity Domain | Celestial Mechanics | Range Check | 0.0 \<= e \< 1.0 (bound elliptic orbits) |
| **ODM-008** | Angular Elements Bounds | Astrodynamics | Domain Validation | Inclination in \[0, 180\] deg, RAAN/ArgP/Nu in \[0, 360\] deg |
| **ODM-009** | Physical Parameters Bounds | Spacecraft Systems | Sign & Range Check | Mass \> 0 kg, Drag Area \> 0 m^2, Cd in \[1.0, 3.5\] |
| **ODM-010** | KVN Format Strictness | CCSDS 502.0-B-3 §6.2 | Syntax Parsing | Strict KEY \= VALUE \[UNIT\] structure with valid comments |

