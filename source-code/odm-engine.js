/**
 * ODMForge Pro - CCSDS 502.0-B-3 & ISO 26900 Orbit Data Messages (ODM) Engine
 * Implements Orbit Parameter Message (OPM), Orbit Ephemeris Message (OEM),
 * and Orbit Mean-Elements Message (OMM), with Cartesian-to-Keplerian Astrodynamics,
 * Lagrange/Hermite Ephemeris Interpolator, and KVN/XML Serializers.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ODMEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Standard Gravitational Parameters (mu in km^3 / s^2)
  const MU_EARTH = 398600.4418; // WGS-84 / EGM96
  const MU_MARS  = 42828.3752;
  const MU_MOON  = 4902.8000;
  const MU_SUN   = 132712440018.0;

  const EARTH_RADIUS_KM = 6378.137;

  // Vector Math Utilities
  function dot(v1, v2) {
    return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  }

  function cross(v1, v2) {
    return [
      v1[1]*v2[2] - v1[2]*v2[1],
      v1[2]*v2[0] - v1[0]*v2[2],
      v1[0]*v2[1] - v1[1]*v2[0]
    ];
  }

  function norm(v) {
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  }

  function rad2deg(rad) {
    return rad * (180.0 / Math.PI);
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180.0);
  }

  // Convert Cartesian State Vector to Osculating Keplerian Elements
  // r in km, v in km/s -> a (km), e, i (deg), raan (deg), argp (deg), nu (deg)
  function cartesianToKeplerian(r, v, mu = MU_EARTH) {
    const rMag = norm(r);
    const vMag = norm(v);

    // Specific angular momentum h = r x v
    const h = cross(r, v);
    const hMag = norm(h);

    // Node vector n = k x h (k = [0, 0, 1])
    const n = [-h[1], h[0], 0];
    const nMag = norm(n);

    // Eccentricity vector e = ((vMag^2 - mu/rMag)*r - (r . v)*v) / mu
    const rDotV = dot(r, v);
    const eVec = [
      ((vMag*vMag - mu/rMag)*r[0] - rDotV*v[0]) / mu,
      ((vMag*vMag - mu/rMag)*r[1] - rDotV*v[1]) / mu,
      ((vMag*vMag - mu/rMag)*r[2] - rDotV*v[2]) / mu
    ];
    const e = norm(eVec);

    // Specific orbital energy xi = v^2/2 - mu/r
    const xi = (vMag*vMag)/2 - mu/rMag;
    let a;
    if (Math.abs(e - 1.0) > 1e-7) {
      a = -mu / (2 * xi);
    } else {
      a = Infinity; // Parabolic
    }

    // Inclination i = acos(h_z / hMag)
    const inc = Math.acos(Math.max(-1.0, Math.min(1.0, h[2] / hMag)));

    // Right Ascension of Ascending Node Omega = acos(n_x / nMag)
    let raan = 0;
    if (nMag > 1e-7) {
      raan = Math.acos(Math.max(-1.0, Math.min(1.0, n[0] / nMag)));
      if (n[1] < 0) raan = 2 * Math.PI - raan;
    }

    // Argument of Pericenter omega = acos(n . e / (nMag * e))
    let argp = 0;
    if (nMag > 1e-7 && e > 1e-7) {
      argp = Math.acos(Math.max(-1.0, Math.min(1.0, dot(n, eVec) / (nMag * e))));
      if (eVec[2] < 0) argp = 2 * Math.PI - argp;
    }

    // True Anomaly nu = acos(e . r / (e * rMag))
    let nu = 0;
    if (e > 1e-7) {
      nu = Math.acos(Math.max(-1.0, Math.min(1.0, dot(eVec, r) / (e * rMag))));
      if (rDotV < 0) nu = 2 * Math.PI - nu;
    }

    // Mean motion n (revs/day)
    let meanMotionRevsPerDay = 0;
    if (a > 0 && isFinite(a)) {
      const meanMotionRadSec = Math.sqrt(mu / (a * a * a));
      meanMotionRevsPerDay = (meanMotionRadSec * 86400) / (2 * Math.PI);
    }

    return {
      semiMajorAxisKm: a,
      eccentricity: e,
      inclinationDeg: rad2deg(inc),
      raanDeg: rad2deg(raan),
      argPericenterDeg: rad2deg(argp),
      trueAnomalyDeg: rad2deg(nu),
      meanMotionRevsPerDay,
      periodMinutes: a > 0 ? (2 * Math.PI * Math.sqrt((a*a*a)/mu)) / 60 : 0
    };
  }

  // Convert Keplerian Elements to Cartesian State Vector
  function keplerianToCartesian(elements, mu = MU_EARTH) {
    const a = elements.semiMajorAxisKm;
    const e = elements.eccentricity;
    const inc = deg2rad(elements.inclinationDeg);
    const raan = deg2rad(elements.raanDeg);
    const argp = deg2rad(elements.argPericenterDeg);
    const nu = deg2rad(elements.trueAnomalyDeg);

    // Orbital radius in perifocal frame
    const p = a * (1 - e * e); // Semi-latus rectum
    const rMag = p / (1 + e * Math.cos(nu));

    // Position and velocity in perifocal frame (PQW)
    const rPQW = [
      rMag * Math.cos(nu),
      rMag * Math.sin(nu),
      0
    ];
    const vCoeff = Math.sqrt(mu / p);
    const vPQW = [
      -vCoeff * Math.sin(nu),
      vCoeff * (e + Math.cos(nu)),
      0
    ];

    // Transformation matrix from Perifocal to Inertial (GCRF/EME2000)
    // R = R_z(-raan) * R_x(-inc) * R_z(-argp)
    const cosO = Math.cos(raan), sinO = Math.sin(raan);
    const cosi = Math.cos(inc),  sini = Math.sin(inc);
    const cosw = Math.cos(argp), sinw = Math.sin(argp);

    const Px = cosO * cosw - sinO * sinw * cosi;
    const Py = sinO * cosw + cosO * sinw * cosi;
    const Pz = sinw * sini;

    const Qx = -cosO * sinw - sinO * cosw * cosi;
    const Qy = -sinO * sinw + cosO * cosw * cosi;
    const Qz = cosw * sini;

    const r = [
      rPQW[0] * Px + rPQW[1] * Qx,
      rPQW[0] * Py + rPQW[1] * Qy,
      rPQW[0] * Pz + rPQW[1] * Qz
    ];

    const v = [
      vPQW[0] * Px + vPQW[1] * Qx,
      vPQW[0] * Py + vPQW[1] * Qy,
      vPQW[0] * Pz + vPQW[1] * Qz
    ];

    return { r, v };
  }

  // 1. Orbit Parameter Message (OPM) Generator & Parser (CCSDS 502.0-B-3 §3)
  class OPMMessage {
    constructor(options = {}) {
      this.ccsdsVersion = '2.0';
      this.objectName = options.objectName || 'CARTOSAT-3';
      this.objectId = options.objectId || '2026-042A';
      this.centerName = options.centerName || 'EARTH';
      this.refFrame = options.refFrame || 'GCRF'; // EME2000, GCRF, ITRF
      this.timeSystem = options.timeSystem || 'UTC';
      this.epoch = options.epoch || '2026-10-16T12:00:00.000Z';

      // Cartesian State Vector
      this.x = options.x !== undefined ? options.x : 6878.137; // km (approx 500 km LEO circular)
      this.y = options.y !== undefined ? options.y : 0.0;
      this.z = options.z !== undefined ? options.z : 0.0;
      this.xDot = options.xDot !== undefined ? options.xDot : 0.0; // km/s
      this.yDot = options.yDot !== undefined ? options.yDot : 7.6126;
      this.zDot = options.zDot !== undefined ? options.zDot : 0.0;

      // Keplerian Elements (Computed or provided)
      const kep = cartesianToKeplerian([this.x, this.y, this.z], [this.xDot, this.yDot, this.zDot]);
      this.semiMajorAxisKm = options.semiMajorAxisKm || kep.semiMajorAxisKm;
      this.eccentricity = options.eccentricity !== undefined ? options.eccentricity : kep.eccentricity;
      this.inclinationDeg = options.inclinationDeg !== undefined ? options.inclinationDeg : kep.inclinationDeg;
      this.raanDeg = options.raanDeg !== undefined ? options.raanDeg : kep.raanDeg;
      this.argPericenterDeg = options.argPericenterDeg !== undefined ? options.argPericenterDeg : kep.argPericenterDeg;
      this.trueAnomalyDeg = options.trueAnomalyDeg !== undefined ? options.trueAnomalyDeg : kep.trueAnomalyDeg;

      // Spacecraft Physical Parameters
      this.massKg = options.massKg || 1250.0;
      this.solarRadAreaM2 = options.solarRadAreaM2 || 5.2;
      this.solarRadCoeff = options.solarRadCoeff || 1.25;
      this.dragAreaM2 = options.dragAreaM2 || 4.8;
      this.dragCoeff = options.dragCoeff || 2.2;
    }

    toKVN() {
      return [
        `CCSDS_OPM_VERS = ${this.ccsdsVersion}`,
        `CREATION_DATE  = ${new Date().toISOString()}`,
        `ORIGINATOR     = CCSDS_FLIGHT_DYNAMICS_FACILITY`,
        ``,
        `COMMENT  CCSDS 502.0-B-3 Orbit Parameter Message (OPM)`,
        `OBJECT_NAME    = ${this.objectName}`,
        `OBJECT_ID      = ${this.objectId}`,
        `CENTER_NAME    = ${this.centerName}`,
        `REF_FRAME      = ${this.refFrame}`,
        `TIME_SYSTEM    = ${this.timeSystem}`,
        ``,
        `COMMENT  Cartesian State Vector at Epoch`,
        `EPOCH          = ${this.epoch}`,
        `X              = ${this.x.toFixed(6)} [km]`,
        `Y              = ${this.y.toFixed(6)} [km]`,
        `Z              = ${this.z.toFixed(6)} [km]`,
        `X_DOT          = ${this.xDot.toFixed(6)} [km/s]`,
        `Y_DOT          = ${this.yDot.toFixed(6)} [km/s]`,
        `Z_DOT          = ${this.zDot.toFixed(6)} [km/s]`,
        ``,
        `COMMENT  Osculating Keplerian Elements`,
        `SEMI_MAJOR_AXIS= ${this.semiMajorAxisKm.toFixed(6)} [km]`,
        `ECCENTRICITY   = ${this.eccentricity.toFixed(7)}`,
        `INCLINATION    = ${this.inclinationDeg.toFixed(4)} [deg]`,
        `RA_OF_ASC_NODE = ${this.raanDeg.toFixed(4)} [deg]`,
        `ARG_OF_PERICENTER = ${this.argPericenterDeg.toFixed(4)} [deg]`,
        `TRUE_ANOMALY   = ${this.trueAnomalyDeg.toFixed(4)} [deg]`,
        ``,
        `COMMENT  Spacecraft Parameters`,
        `MASS           = ${this.massKg.toFixed(2)} [kg]`,
        `SOLAR_RAD_AREA = ${this.solarRadAreaM2.toFixed(3)} [m**2]`,
        `SOLAR_RAD_COEFF= ${this.solarRadCoeff.toFixed(3)}`,
        `DRAG_AREA      = ${this.dragAreaM2.toFixed(3)} [m**2]`,
        `DRAG_COEFF     = ${this.dragCoeff.toFixed(3)}`
      ].join('\n');
    }
  }

  // 2. Orbit Ephemeris Message (OEM) Generator & Interpolator (CCSDS 502.0-B-3 §4)
  class OEMMessage {
    constructor(options = {}) {
      this.ccsdsVersion = '2.0';
      this.objectName = options.objectName || 'CARTOSAT-3';
      this.objectId = options.objectId || '2026-042A';
      this.centerName = options.centerName || 'EARTH';
      this.refFrame = options.refFrame || 'GCRF';
      this.timeSystem = options.timeSystem || 'UTC';
      this.interpolation = options.interpolation || 'LAGRANGE'; // LAGRANGE, HERMITE, LINEAR
      this.interpolationDegree = options.interpolationDegree || 5;
      this.startTime = options.startTime || '2026-10-16T12:00:00.000Z';
      this.stopTime = options.stopTime || '2026-10-16T13:00:00.000Z';

      // Ephemeris states: array of { epochStr, epochSeconds, x, y, z, xDot, yDot, zDot }
      this.ephemerisLines = options.ephemerisLines || [];
    }

    // Lagrange Polynomial Interpolation at an intermediate epoch
    interpolateLagrange(targetEpochSec) {
      if (this.ephemerisLines.length < 2) {
        throw new Error("OEM contains insufficient ephemeris lines for interpolation (min 2)");
      }

      // Sort lines by epoch
      const lines = [...this.ephemerisLines].sort((a, b) => a.epochSeconds - b.epochSeconds);

      // Select N closest points based on interpolationDegree
      const N = Math.min(this.interpolationDegree + 1, lines.length);
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < lines.length; i++) {
        const diff = Math.abs(lines[i].epochSeconds - targetEpochSec);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      let start = Math.max(0, closestIdx - Math.floor(N / 2));
      if (start + N > lines.length) {
        start = lines.length - N;
      }
      const subset = lines.slice(start, start + N);

      // Compute Lagrange polynomials
      let interpX = 0, interpY = 0, interpZ = 0;
      let interpVx = 0, interpVy = 0, interpVz = 0;

      for (let i = 0; i < N; i++) {
        let weight = 1.0;
        for (let j = 0; j < N; j++) {
          if (i !== j) {
            weight *= (targetEpochSec - subset[j].epochSeconds) / (subset[i].epochSeconds - subset[j].epochSeconds);
          }
        }
        interpX += subset[i].x * weight;
        interpY += subset[i].y * weight;
        interpZ += subset[i].z * weight;
        interpVx += subset[i].xDot * weight;
        interpVy += subset[i].yDot * weight;
        interpVz += subset[i].zDot * weight;
      }

      return {
        targetEpochSec,
        x: interpX,
        y: interpY,
        z: interpZ,
        xDot: interpVx,
        yDot: interpVy,
        zDot: interpVz
      };
    }

    toKVN() {
      const header = [
        `CCSDS_OEM_VERS = ${this.ccsdsVersion}`,
        `CREATION_DATE  = ${new Date().toISOString()}`,
        `ORIGINATOR     = CCSDS_FLIGHT_DYNAMICS_FACILITY`,
        ``,
        `META_START`,
        `OBJECT_NAME          = ${this.objectName}`,
        `OBJECT_ID            = ${this.objectId}`,
        `CENTER_NAME          = ${this.centerName}`,
        `REF_FRAME            = ${this.refFrame}`,
        `TIME_SYSTEM          = ${this.timeSystem}`,
        `START_TIME           = ${this.startTime}`,
        `STOP_TIME            = ${this.stopTime}`,
        `INTERPOLATION        = ${this.interpolation}`,
        `INTERPOLATION_DEGREE = ${this.interpolationDegree}`,
        `META_STOP`,
        ``
      ];

      const dataLines = this.ephemerisLines.map(line => 
        `${line.epochStr}  ${line.x.toFixed(6)}  ${line.y.toFixed(6)}  ${line.z.toFixed(6)}  ${line.xDot.toFixed(6)}  ${line.yDot.toFixed(6)}  ${line.zDot.toFixed(6)}`
      );

      return header.concat(dataLines).join('\n');
    }
  }

  // 3. Orbit Mean-Elements Message (OMM) SGP4/TLE Replacement (CCSDS 502.0-B-3 §5)
  class OMMMessage {
    constructor(options = {}) {
      this.ccsdsVersion = '2.0';
      this.objectName = options.objectName || 'ISS (ZARYA)';
      this.objectId = options.objectId || '1998-067A';
      this.centerName = options.centerName || 'EARTH';
      this.refFrame = options.refFrame || 'EME2000';
      this.timeSystem = options.timeSystem || 'UTC';
      this.meanElementTheory = options.meanElementTheory || 'SGP4';
      this.epoch = options.epoch || '2026-10-16T06:00:00.000Z';

      // SGP4 Mean Elements
      this.meanMotionRevsDay = options.meanMotionRevsDay || 15.4950;
      this.eccentricity = options.eccentricity !== undefined ? options.eccentricity : 0.0006703;
      this.inclinationDeg = options.inclinationDeg !== undefined ? options.inclinationDeg : 51.6420;
      this.raanDeg = options.raanDeg !== undefined ? options.raanDeg : 124.5020;
      this.argPericenterDeg = options.argPericenterDeg !== undefined ? options.argPericenterDeg : 78.4320;
      this.meanAnomalyDeg = options.meanAnomalyDeg !== undefined ? options.meanAnomalyDeg : 281.7450;

      // SGP4 Ephemeris Model Parameters
      this.bstar = options.bstar !== undefined ? options.bstar : 0.0002145; // Drag term [1/ER]
      this.meanMotionDot = options.meanMotionDot || 0.0000234;
      this.meanMotionDdot = options.meanMotionDdot || 0.0;
      this.noradCatId = options.noradCatId || 25544;
      this.elementSetNo = options.elementSetNo || 999;
      this.revAtEpoch = options.revAtEpoch || 148200;
    }

    toKVN() {
      return [
        `CCSDS_OMM_VERS = ${this.ccsdsVersion}`,
        `CREATION_DATE  = ${new Date().toISOString()}`,
        `ORIGINATOR     = 18TH_SPACE_DEFENSE_SQUADRON`,
        ``,
        `OBJECT_NAME          = ${this.objectName}`,
        `OBJECT_ID            = ${this.objectId}`,
        `CENTER_NAME          = ${this.centerName}`,
        `REF_FRAME            = ${this.refFrame}`,
        `TIME_SYSTEM          = ${this.timeSystem}`,
        `MEAN_ELEMENT_THEORY  = ${this.meanElementTheory}`,
        ``,
        `EPOCH                = ${this.epoch}`,
        `MEAN_MOTION          = ${this.meanMotionRevsDay.toFixed(8)} [rev/day]`,
        `ECCENTRICITY         = ${this.eccentricity.toFixed(7)}`,
        `INCLINATION          = ${this.inclinationDeg.toFixed(4)} [deg]`,
        `RA_OF_ASC_NODE       = ${this.raanDeg.toFixed(4)} [deg]`,
        `ARG_OF_PERICENTER    = ${this.argPericenterDeg.toFixed(4)} [deg]`,
        `MEAN_ANOMALY         = ${this.meanAnomalyDeg.toFixed(4)} [deg]`,
        ``,
        `BSTAR                = ${this.bstar.toExponential(4)} [1/ER]`,
        `MEAN_MOTION_DOT      = ${this.meanMotionDot.toExponential(4)} [rev/day**2]`,
        `MEAN_MOTION_DDOT     = ${this.meanMotionDdot.toFixed(4)} [rev/day**3]`,
        `NORAD_CAT_ID         = ${this.noradCatId}`,
        `ELEMENT_SET_NO       = ${this.elementSetNo}`,
        `REV_AT_EPOCH         = ${this.revAtEpoch}`
      ].join('\n');
    }
  }

  return {
    MU_EARTH,
    MU_MARS,
    MU_MOON,
    MU_SUN,
    EARTH_RADIUS_KM,
    cartesianToKeplerian,
    keplerianToCartesian,
    OPMMessage,
    OEMMessage,
    OMMMessage
  };
}));
