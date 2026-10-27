# CCSDS 502.0-B-3 & ISO 26900 Orbit Data Messages (ODM) Technical Specification

## 1\. Executive Summary & Normative Scope

The Consultative Committee for Space Data Systems (CCSDS) 502.0-B-3 Blue Book and ISO 26900 standard define standard formats for the exchange of ephemeris, state vector, and orbital mean elements data between space agencies, satellite operators, ground tracking networks, and space situational awareness (SSA) centers.

ODM replaces ambiguous, legacy 1960s formats (such as 2-line element sets / TLEs) with rigorous, metadata-rich, self-describing messages formatted in Keyword-Value Notation (KVN) and Extensible Markup Language (XML).

ODMForge Pro focuses on the primary ODM data structures:

1. **Orbit Parameter Message (OPM)**: Encapsulates single-epoch Cartesian state vectors, optional Keplerian osculating elements, spacecraft physical parameters (mass, drag, radiation pressure), and planned impulsive/continuous maneuvers.  
2. **Orbit Ephemeris Message (OEM)**: Encapsulates time-series position and velocity vectors over an interpolation interval, enabling high-precision trajectory reconstruction via Lagrange or Hermite polynomial interpolators.  
3. **Orbit Mean-Elements Message (OMM)**: Encapsulates orbit mean elements compatible with SGP4/SDP4 analytical propagation models, providing a modernized, unambiguous alternative to NORAD 2-line element sets.

---

## 2\. Normative Coordinate Reference Frames

Conforming implementations must state the reference frame in the metadata block using approved standard identifiers:

- **GCRF**: Geocentric Celestial Reference Frame (IERS standard realization of the International Celestial Reference System / ICRS).  
- **EME2000**: Earth Mean Equator and Equinox of J2000.0 (FK5-based coordinate system).  
- **ITRF**: International Terrestrial Reference Frame (Earth-fixed rotating reference frame for ground stations and low altitude tracking).  
- **ICRF**: International Celestial Reference Frame (inertial reference frame for interplanetary trajectories).

---

## 3\. Orbit Parameter Message (OPM) Structure

### 3.1 Header Block

CCSDS\_OPM\_VERS \= 2.0

CREATION\_DATE  \= 2026-10-16T11:23:45.000Z

ORIGINATOR     \= ODMFORGE\_STUDIO

### 3.2 Metadata Block

OBJECT\_NAME          \= PROBA-V

OBJECT\_ID            \= 2013-021A

CENTER\_NAME          \= EARTH

REF\_FRAME            \= GCRF

TIME\_SYSTEM          \= UTC

### 3.3 State Vector Block (Cartesian)

EPOCH                \= 2026-10-16T12:00:00.000Z

X                    \= 7178.137000 \[km\]

Y                    \= 0.000000 \[km\]

Z                    \= 0.000000 \[km\]

X\_DOT                \= 0.000000 \[km/s\]

Y\_DOT                \= 4.475653 \[km/s\]

Z\_DOT                \= 6.160195 \[km/s\]

### 3.4 Keplerian Elements Block (Osculating)

SEMI\_MAJOR\_AXIS      \= 7198.137000 \[km\]

ECCENTRICITY         \= 0.00120000

INCLINATION          \= 98.200000 \[deg\]

RA\_OF\_ASC\_NODE       \= 45.000000 \[deg\]

ARG\_OF\_PERICENTER    \= 75.000000 \[deg\]

TRUE\_ANOMALY         \= 12.500000 \[deg\]

GM                   \= 398600.441800 \[km\*\*3/s\*\*2\]

### 3.5 Spacecraft Physical Parameters Block

MASS                 \= 160.000000 \[kg\]

SOLAR\_RAD\_AREA       \= 1.800000 \[m\*\*2\]

SOLAR\_RAD\_COEFF      \= 1.300000

DRAG\_AREA            \= 1.400000 \[m\*\*2\]

DRAG\_COEFF           \= 2.200000

---

## 4\. Orbit Ephemeris Message (OEM) Specification

OEM conveys continuous trajectories through discrete time-stepped ephemeris points:

- Interpolation method: HERMITE or LAGRANGE.  
- Interpolation degree: 5 to 9 recommended for LEO/GEO orbits.  
- Interpolation interval: Explicitly defined by the time differences between contiguous state vectors.

---

## 5\. Orbit Mean-Elements Message (OMM) Specification

OMM modernizes legacy SGP4 distribution:

- MEAN\_MOTION: Expressed in revolutions per day (rev/day).  
- EPHEMERIS\_TYPE: Set to 0 for SGP4.  
- BSTAR: Ballistic drag coefficient in 1/Earth-radii.  
- Eliminates 69-character truncation and checksum bugs inherent in classical ASCII TLEs.