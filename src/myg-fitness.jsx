import { useState, useEffect, useRef, useLayoutEffect } from "react";

const COLORS = {
  bg: "#111111",
  card: "#1E1E1E",
  gold: "#FFD700",
  goldHighlight: "#1A1A00",
  text: "#FFFFFF",
  textSecondary: "#888888",
  border: "#333333",
  inactive: "#666666",
};

/* ── Session Persistence ──────────────────────────────────────────
   localStorage-backed snapshot of app state. Rehearses the AsyncStorage
   pattern from Bible §21.7 — when we port to React Native, these
   getItem/setItem calls become AsyncStorage.getItem/setItem calls with
   identical shape.

   Write strategy: immediate on every meaningful state change. localStorage
   is synchronous and small writes are fast enough that we don't need to
   debounce. The rest timer is an exception — we persist startTs (fixed)
   and mode, never the ticking elapsed value, so the timer survives a
   reload without any per-second writes.

   Read strategy: on App mount, hydrateAll() is called once. If a valid
   snapshot exists and onboardingComplete is true, the app jumps straight
   to the main tabs with the user on whichever tab they left. Otherwise
   it starts at welcome.

   What's persisted: onboardingComplete, userName, selectedEquipment,
   activeTab, activeWorkout (with Date fields serialized), coachChats +
   currentCoachChatId, workoutHistory.

   What's NOT persisted: isOnline (rebuild from browser on mount),
   appSubScreen / workoutMinimized / finishedSession / openHistoryId /
   equipPreset (transient UI state that should always start fresh).

   Artifact note: Claude's artifact sandbox blocks localStorage, so every
   storage op is wrapped in try/catch. The app still runs in the artifact;
   persistence just no-ops. Deploying to Vercel / a real browser is where
   this actually comes to life.
*/

const STORAGE_KEY = "myg_fitness_v1";

function storageAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__myg_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// Convert an activeWorkout into a plain-JSON-safe shape. The only
// non-JSON-safe field is startTime (a Date). Everything else — sets
// with placeholder flags, restTimer with numeric startTs, restDividers,
// etc — is already serializable.
function serializeActiveWorkout(w) {
  if (!w) return null;
  return {
    ...w,
    startTime: w.startTime instanceof Date ? w.startTime.toISOString() : w.startTime,
  };
}

function hydrateActiveWorkout(w) {
  if (!w) return null;
  return {
    ...w,
    startTime: typeof w.startTime === "string" ? new Date(w.startTime) : w.startTime,
  };
}

function saveSnapshot(state) {
  if (!storageAvailable()) return;
  try {
    const snapshot = {
      v: 1,
      onboardingComplete: state.onboardingComplete,
      userName: state.userName,
      // Set → Array for JSON
      selectedEquipment: Array.from(state.selectedEquipment || []),
      // Fitness level + time away. Bible §6.5 (v26) notes: persistence
      // wires in with the Profile tab redesign session. Both are now
      // mirrored to localStorage so the Plan section of Coach's File
      // survives a reload. Null is a valid value (means "not yet set").
      fitnessLevel: state.fitnessLevel || null,
      timeAway: state.timeAway || null,
      activeTab: state.activeTab,
      activeWorkout: serializeActiveWorkout(state.activeWorkout),
      coachChats: state.coachChats,
      currentCoachChatId: state.currentCoachChatId,
      workoutHistory: state.workoutHistory,
      // Bible §3.4 — user-created exercises live here. Plain array of
      // objects, JSON-safe as-is.
      customExercises: state.customExercises || [],
      // Exercises tab sort preference. { mode: "alpha"|"recent"|"frequency", dir: "asc"|"desc" }
      exerciseSort: state.exerciseSort || { mode: "alpha", dir: "asc" },
      // Rest timer user preferences. Persisted across workouts and across
      // logouts (cleared explicitly on logout, like other prefs). Will be
      // exposed in the Profile tab redesign session as a Settings row;
      // for now, the only change interface is the gear menu inside an
      // active workout.
      restTimerModePref: state.restTimerModePref || "countup",
      restCountdownTargetPref: typeof state.restCountdownTargetPref === "number" ? state.restCountdownTargetPref : 90,
      // ── Coach's File state (Bible §6.5, v26) ──
      // The Profile tab is reframed as "Coach's File on Tyler". Each of
      // these arrays/objects backs one section on the landing surface and
      // its corresponding sub-screen. All are JSON-safe primitives.
      //
      // plan: the four fields Coach uses to build workouts. fitnessLevel
      //   and timeAway already live in App state, but the Profile tab
      //   reads them through this plan object for uniformity. Days-per-week
      //   has no home in the current app and starts here.
      // rules: list of standing orders user gave Coach via chat. Created
      //   in Coach chat in a future session; for now seeded with mock data
      //   that matches the HTML reference. Cap of 15 per Bible §12.6.
      // observations: Coach-authored notes about how the user trains.
      //   Coach writes these from observed behavior. User can delete
      //   individual ones or "Reset all". Seeded with mocks.
      // progressPRs: Coach-tracked PRs and notable lifts. Read-only.
      //   Seeded with mocks; future session computes from workoutHistory.
      // bodyStats: height/weight/age/gender. Lives in Settings for v1
      //   per the §15 trade-off; weigh-in log is a v2 feature.
      planGoal: state.planGoal || "build_muscle",
      planDaysPerWeek: typeof state.planDaysPerWeek === "number" ? state.planDaysPerWeek : 3,
      coachRules: Array.isArray(state.coachRules) ? state.coachRules : [],
      coachObservations: Array.isArray(state.coachObservations) ? state.coachObservations : [],
      progressPRs: Array.isArray(state.progressPRs) ? state.progressPRs : [],
      bodyStats: state.bodyStats && typeof state.bodyStats === "object" ? state.bodyStats : null,
      // Coach's File metadata. lastUpdatedAt is shown in the signed footer
      // ("— C, updated 2d ago"). fileOpenedAt is shown on first-launch
      // empty state ("— C, file opened today"). Both are epoch millis.
      coachFileOpenedAt: typeof state.coachFileOpenedAt === "number" ? state.coachFileOpenedAt : null,
      coachFileLastUpdatedAt: typeof state.coachFileLastUpdatedAt === "number" ? state.coachFileLastUpdatedAt : null,
      // Settings prefs (Bible §6.5 Settings sub-screen).
      unitsPref: state.unitsPref || "lbs",
      streakRemindersOn: typeof state.streakRemindersOn === "boolean" ? state.streakRemindersOn : true,
      leaderboardOn: typeof state.leaderboardOn === "boolean" ? state.leaderboardOn : false,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded, serialization error, or private-mode restriction.
    // Silent fail is correct here — persistence is a nice-to-have for
    // prototype testing, not a requirement for the app to function.
  }
}

function loadSnapshot() {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    return {
      onboardingComplete: !!parsed.onboardingComplete,
      userName: parsed.userName,
      // Array → Set back to live state shape
      selectedEquipment: new Set(parsed.selectedEquipment || []),
      activeTab: parsed.activeTab || "home",
      activeWorkout: hydrateActiveWorkout(parsed.activeWorkout),
      coachChats: Array.isArray(parsed.coachChats) ? parsed.coachChats : null,
      currentCoachChatId: parsed.currentCoachChatId || null,
      workoutHistory: Array.isArray(parsed.workoutHistory) ? parsed.workoutHistory : null,
      customExercises: Array.isArray(parsed.customExercises) ? parsed.customExercises : [],
      exerciseSort: parsed.exerciseSort && typeof parsed.exerciseSort === "object"
        ? parsed.exerciseSort
        : { mode: "alpha", dir: "asc" },
      restTimerModePref: ["countup", "countdown", "off"].includes(parsed.restTimerModePref) ? parsed.restTimerModePref : "countup",
      restCountdownTargetPref: typeof parsed.restCountdownTargetPref === "number" && parsed.restCountdownTargetPref > 0 ? parsed.restCountdownTargetPref : 90,
      // Fitness level + time away (v26). Validate against the same
      // enumerations the onboarding screens accept; anything else falls
      // back to null so the app doesn't get into a wedged state.
      fitnessLevel: ["beginner", "intermediate", "advanced"].includes(parsed.fitnessLevel) ? parsed.fitnessLevel : null,
      timeAway: ["current", "lt1yr", "1to3yr", "gt3yr"].includes(parsed.timeAway) ? parsed.timeAway : null,
      // Coach's File state. Each is validated to a sane shape; mismatches
      // fall back to defaults so a corrupted snapshot can't crash the
      // landing page.
      planGoal: ["build_muscle", "lose_weight", "gain_strength", "get_lean"].includes(parsed.planGoal) ? parsed.planGoal : "build_muscle",
      planDaysPerWeek: typeof parsed.planDaysPerWeek === "number" && parsed.planDaysPerWeek >= 1 && parsed.planDaysPerWeek <= 7 ? parsed.planDaysPerWeek : 3,
      coachRules: Array.isArray(parsed.coachRules) ? parsed.coachRules : null,
      coachObservations: Array.isArray(parsed.coachObservations) ? parsed.coachObservations : null,
      progressPRs: Array.isArray(parsed.progressPRs) ? parsed.progressPRs : null,
      bodyStats: parsed.bodyStats && typeof parsed.bodyStats === "object" ? parsed.bodyStats : null,
      coachFileOpenedAt: typeof parsed.coachFileOpenedAt === "number" ? parsed.coachFileOpenedAt : null,
      coachFileLastUpdatedAt: typeof parsed.coachFileLastUpdatedAt === "number" ? parsed.coachFileLastUpdatedAt : null,
      unitsPref: parsed.unitsPref === "kg" ? "kg" : "lbs",
      streakRemindersOn: typeof parsed.streakRemindersOn === "boolean" ? parsed.streakRemindersOn : true,
      leaderboardOn: typeof parsed.leaderboardOn === "boolean" ? parsed.leaderboardOn : false,
    };
  } catch {
    return null;
  }
}

function clearSnapshot() {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

/* ── Equipment Data ──────────────────────────────────────────────
   Mirrors Project Bible §7 Master Equipment List exactly. 7 categories,
   in the Bible's order. This is the single source of truth — the
   exercise library references these ids, and Coach's hard filter will too.
*/

const EQUIPMENT_CATEGORIES = [
  {
    id: "free_weights",
    label: "Free Weights",
    items: [
      { id: "barbell", label: "Barbell" },
      { id: "hex_bar", label: "Hex Bar" },
      { id: "dumbbells", label: "Dumbbells" },
      { id: "kettlebell", label: "Kettlebells" },
      { id: "ez_curl_bar", label: "EZ Curl Bar" },
      { id: "weight_plates", label: "Weight Plates" },
      { id: "medicine_ball", label: "Medicine Ball" },
    ],
  },
  {
    id: "benches_racks",
    label: "Benches & Racks",
    items: [
      { id: "flat_bench", label: "Flat Bench" },
      { id: "adjustable_bench", label: "Adjustable Bench" },
      { id: "squat_rack", label: "Squat Rack / Power Rack" },
      { id: "preacher_bench", label: "Preacher Curl Bench" },
      { id: "hyperextension_bench", label: "Hyperextension Bench" },
    ],
  },
  {
    id: "cables_pulleys",
    label: "Cables & Pulleys",
    items: [
      { id: "cable_high", label: "Single Cable Stack (High Pulley)" },
      { id: "cable_low", label: "Single Cable Stack (Low Pulley)" },
      { id: "cable_crossover", label: "Dual Cable Crossover Machine" },
      { id: "cable_lat_pulldown", label: "Cable Lat Pulldown" },
      { id: "seated_cable_row", label: "Seated Cable Row" },
    ],
  },
  {
    id: "plate_loaded",
    label: "Plate Loaded Machines",
    items: [
      { id: "smith_machine", label: "Smith Machine" },
      { id: "hack_squat_machine", label: "Hack Squat Machine" },
      { id: "leg_press_machine", label: "Leg Press (45°)" },
      { id: "tbar_row_machine", label: "T-Bar Row Machine" },
      { id: "hammer_strength_chest", label: "Hammer Strength Chest Press" },
      { id: "hammer_strength_incline", label: "Hammer Strength Incline Press" },
      { id: "hammer_strength_decline", label: "Hammer Strength Decline Press" },
      { id: "hammer_strength_shoulder", label: "Hammer Strength Shoulder Press" },
      { id: "iso_lateral_row_machine", label: "Iso Lateral Row Machine" },
      { id: "seated_calf_raise_machine", label: "Seated Calf Raise Machine" },
      { id: "rotary_calf_machine", label: "Rotary Calf Machine" },
    ],
  },
  {
    id: "selectorized",
    label: "Selectorized Machines",
    items: [
      { id: "seated_leg_press_machine", label: "Seated Leg Press" },
      { id: "lying_leg_curl_machine", label: "Lying Leg Curl Machine" },
      { id: "seated_leg_curl_machine", label: "Seated Leg Curl Machine" },
      { id: "leg_extension_machine", label: "Leg Extension Machine" },
      { id: "standing_calf_raise_machine", label: "Standing Calf Raise Machine" },
      { id: "lat_pulldown_machine", label: "Lat Pulldown Machine" },
      { id: "hip_abductor_machine", label: "Hip Abductor/Adductor Machine" },
      { id: "hip_thrust_machine", label: "Hip Thrust Machine" },
      { id: "glute_kickback_machine", label: "Glute Kickback Machine" },
      { id: "pec_deck", label: "Pec Deck" },
      { id: "ab_crunch_machine", label: "Ab Crunch Machine" },
      { id: "lateral_raise_machine", label: "Lateral Raise Machine" },
      { id: "bicep_curl_machine", label: "Bicep Curl Machine" },
      { id: "tricep_extension_machine", label: "Tricep Extension Machine" },
      { id: "torso_rotation_machine", label: "Torso Rotation Machine" },
      { id: "back_extension_machine", label: "Back Extension Machine" },
      { id: "assisted_pullup_machine", label: "Assisted Pull-Up Machine" },
    ],
  },
  {
    id: "bodyweight_accessories",
    label: "Bodyweight & Accessories",
    items: [
      { id: "pull_up_bar", label: "Pull-Up Bar" },
      { id: "gymnastics_rings", label: "Gymnastics Rings" },
      { id: "dip_station", label: "Dip Station" },
      { id: "resistance_bands", label: "Resistance Bands" },
      { id: "ab_wheel", label: "Ab Wheel" },
      { id: "jump_rope", label: "Jump Rope" },
      { id: "plyo_box", label: "Plyo Box" },
      { id: "sled", label: "Sled" },
      { id: "battle_ropes", label: "Battle Ropes" },
    ],
  },
  {
    id: "cardio",
    label: "Cardio",
    items: [
      { id: "treadmill", label: "Treadmill" },
      { id: "stationary_bike", label: "Stationary Bike" },
      { id: "rowing_machine", label: "Rowing Machine" },
      { id: "elliptical", label: "Elliptical" },
      { id: "stair_climber", label: "Stair Climber" },
    ],
  },
];

const ALL_IDS = EQUIPMENT_CATEGORIES.flatMap((c) => c.items.map((i) => i.id));

// Flat id → pretty label lookup. Used for the "Needs ___" subline in the
// AlternativesSheet (D-019) when a row's variants aren't available with the
// user's equipment. Built once at module load from the same source of truth
// as ALL_IDS so labels can never drift.
const EQUIPMENT_LABEL_BY_ID = Object.fromEntries(
  EQUIPMENT_CATEGORIES.flatMap((c) => c.items.map((i) => [i.id, i.label]))
);

const PRESETS = {
  full: ALL_IDS,
  home: [
    "barbell", "dumbbells", "kettlebell", "weight_plates",
    "flat_bench", "adjustable_bench", "squat_rack",
    "pull_up_bar", "resistance_bands", "ab_wheel", "jump_rope",
  ],
  bodyweight: [
    "pull_up_bar", "resistance_bands", "ab_wheel", "jump_rope", "plyo_box",
  ],
};

/* ── Exercise Library (117 exercises, source of truth: Project Bible §8) ──
   Each exercise: id, name, primary, secondary[], type, variants[].
   A variant is { label, equipment: [equipment_ids] } — user needs ALL ids in
   the list to have access to that variant (e.g. "Barbell").
   Equipment ids map to EQUIPMENT_CATEGORIES above. Exercises spanning two
   muscle groups (Deadlift, RDL, Good Morning, Rack Pull, Back Extension)
   appear in both filters but are de-duped in "All" by id.
*/

const EXERCISE_LIBRARY = [
  // LEGS (20)
  { id: "squat", name: "Squat", primary: "Legs", pattern: "squat_bilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "front_squat", name: "Front Squat", primary: "Legs", pattern: "squat_bilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "goblet_squat", name: "Goblet Squat", primary: "Legs", pattern: "squat_bilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "deadlift", name: "Deadlift", primary: "Legs", pattern: "hinge_compound", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"], key: "barbell_conventional" },
    { label: "Barbell (Sumo)", equipment: ["barbell"], key: "barbell_sumo" },
    { label: "Hex Bar", equipment: ["hex_bar"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "romanian_deadlift", name: "Romanian Deadlift", primary: "Legs", pattern: "hinge_compound", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "good_morning", name: "Good Morning", primary: "Legs", pattern: "hinge_compound", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "hip_thrust", name: "Hip Thrust", primary: "Legs", pattern: "hinge_accessory", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "flat_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "flat_bench"] },
    { label: "Hip Thrust Machine", equipment: ["hip_thrust_machine"] },
  ]},
  { id: "leg_press", name: "Leg Press", primary: "Legs", pattern: "squat_bilateral", secondary: [], type: "Compound", variants: [
    { label: "Leg Press (45°)", equipment: ["leg_press_machine"] },
    { label: "Seated Leg Press", equipment: ["seated_leg_press_machine"] },
  ]},
  { id: "hack_squat", name: "Hack Squat", primary: "Legs", pattern: "squat_bilateral", secondary: [], type: "Compound", variants: [
    { label: "Hack Squat Machine", equipment: ["hack_squat_machine"] },
  ]},
  { id: "bulgarian_split_squat", name: "Bulgarian Split Squat", primary: "Legs", pattern: "squat_unilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "lunge", name: "Lunge", primary: "Legs", pattern: "squat_unilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "step_up", name: "Step-Up", primary: "Legs", pattern: "squat_unilateral", secondary: ["Core"], type: "Compound", variants: [
    { label: "Dumbbells + Plyo Box", equipment: ["dumbbells", "plyo_box"] },
  ]},
  { id: "glute_bridge", name: "Glute Bridge", primary: "Legs", pattern: "hinge_accessory", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "glute_kickback", name: "Glute Kickback", primary: "Legs", pattern: "isolation_glutes", secondary: [], type: "Isolation", variants: [
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Glute Kickback Machine", equipment: ["glute_kickback_machine"] },
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "leg_curl", name: "Leg Curl", primary: "Legs", pattern: "isolation_hamstrings", secondary: [], type: "Isolation", variants: [
    { label: "Seated Leg Curl", equipment: ["seated_leg_curl_machine"] },
    { label: "Lying Leg Curl", equipment: ["lying_leg_curl_machine"] },
  ]},
  { id: "leg_extension", name: "Leg Extension", primary: "Legs", pattern: "isolation_quads", secondary: [], type: "Isolation", variants: [
    { label: "Leg Extension Machine", equipment: ["leg_extension_machine"] },
  ]},
  { id: "standing_calf_raise", name: "Standing Calf Raise", primary: "Legs", pattern: "isolation_calves", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
    { label: "Standing Calf Raise Machine", equipment: ["standing_calf_raise_machine"] },
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "seated_calf_raise", name: "Seated Calf Raise", primary: "Legs", pattern: "isolation_calves", secondary: [], type: "Isolation", variants: [
    { label: "Seated Calf Raise Machine", equipment: ["seated_calf_raise_machine"] },
    { label: "Plate on Knees", equipment: ["weight_plates"] },
    { label: "Rotary Calf Machine", equipment: ["rotary_calf_machine"] },
    { label: "Calf Press on 45° Leg Press", equipment: ["leg_press_machine"] },
    { label: "Calf Press on Seated Leg Press", equipment: ["seated_leg_press_machine"] },
  ]},
  { id: "hip_abductor", name: "Hip Abductor", primary: "Legs", pattern: "isolation_hip_abductor", secondary: [], type: "Isolation", variants: [
    { label: "Hip Abductor Machine", equipment: ["hip_abductor_machine"] },
  ]},
  { id: "hip_adductor", name: "Hip Adductor", primary: "Legs", pattern: "isolation_hip_adductor", secondary: [], type: "Isolation", variants: [
    { label: "Hip Adductor Machine", equipment: ["hip_abductor_machine"] },
  ]},
  { id: "box_jump", name: "Box Jump", primary: "Legs", pattern: "conditioning", secondary: ["Core"], type: "Compound", variants: [
    { label: "Plyo Box", equipment: ["plyo_box"], bodyweight: true },
  ]},

  // BACK (18) — deadlift/RDL/good_morning already declared under Legs with alsoIn
  { id: "rack_pull", name: "Rack Pull", primary: "Back", pattern: "hinge_compound", secondary: ["Legs"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
  ]},
  { id: "bent_over_row", name: "Bent-Over Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "single_arm_row", name: "Single-Arm Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "incline_row", name: "Incline Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "seated_row", name: "Seated Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Seated Cable Row", equipment: ["seated_cable_row"] },
    { label: "Iso Lateral Row Machine", equipment: ["iso_lateral_row_machine"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "tbar_row", name: "T-Bar Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "T-Bar Row Machine", equipment: ["tbar_row_machine"] },
  ]},
  { id: "upright_row", name: "Upright Row", primary: "Back", pattern: "isolation_traps", secondary: ["Shoulders"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "lat_pulldown", name: "Lat Pulldown", primary: "Back", pattern: "vertical_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Cable Lat Pulldown", equipment: ["cable_lat_pulldown"] },
    { label: "Lat Pulldown Machine", equipment: ["lat_pulldown_machine"] },
    { label: "Single-Arm Cable", equipment: ["cable_high"], key: "cable_high_single_arm" },
  ]},
  { id: "pull_up", name: "Pull-Up", primary: "Back", pattern: "vertical_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"], bodyweight: true },
    { label: "Assisted Pull-Up Machine", equipment: ["assisted_pullup_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands", "pull_up_bar"], bodyweight: true },
  ]},
  { id: "chin_up", name: "Chin-Up", primary: "Back", pattern: "vertical_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"], bodyweight: true },
    { label: "Assisted Pull-Up Machine", equipment: ["assisted_pullup_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands", "pull_up_bar"], bodyweight: true },
  ]},
  { id: "inverted_row", name: "Inverted Row", primary: "Back", pattern: "horizontal_pull", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "straight_arm_pulldown", name: "Straight-Arm Pulldown", primary: "Back", pattern: "isolation_lats", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "face_pull", name: "Face Pull", primary: "Back", pattern: "isolation_rear_delt", secondary: ["Shoulders"], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "shrug", name: "Shrug", primary: "Back", pattern: "isolation_traps", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "back_extension", name: "Back Extension", primary: "Back", pattern: "hinge_accessory", secondary: ["Legs"], type: "Compound", variants: [
    { label: "Hyperextension Bench", equipment: ["hyperextension_bench"], bodyweight: true },
    { label: "Back Extension Machine", equipment: ["back_extension_machine"] },
  ]},

  // CHEST (11)
  { id: "bench_press", name: "Bench Press", primary: "Chest", pattern: "horizontal_press", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "flat_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "flat_bench"] },
    { label: "Smith Machine", equipment: ["smith_machine", "flat_bench"] },
  ]},
  { id: "incline_press", name: "Incline Bench Press", primary: "Chest", pattern: "horizontal_press", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "adjustable_bench"] },
    { label: "Smith Machine", equipment: ["smith_machine", "adjustable_bench"] },
  ]},
  { id: "decline_press", name: "Decline Bench Press", primary: "Chest", pattern: "horizontal_press", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "machine_press", name: "Machine Press", primary: "Chest", pattern: "horizontal_press", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Hammer Strength Chest Press", equipment: ["hammer_strength_chest"] },
    { label: "Hammer Strength Incline Press", equipment: ["hammer_strength_incline"] },
    { label: "Hammer Strength Decline Press", equipment: ["hammer_strength_decline"] },
  ]},
  { id: "chest_fly", name: "Chest Fly", primary: "Chest", pattern: "isolation_chest", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells", "flat_bench"] },
    { label: "Pec Deck", equipment: ["pec_deck"] },
  ]},
  { id: "incline_chest_fly", name: "Incline Chest Fly", primary: "Chest", pattern: "isolation_chest", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "cable_crossover", name: "Cable Crossover", primary: "Chest", pattern: "isolation_chest", secondary: [], type: "Isolation", variants: [
    { label: "Cable Crossover", equipment: ["cable_crossover"] },
  ]},
  { id: "push_up", name: "Push-Up", primary: "Chest", pattern: "horizontal_press", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Standard", equipment: [], key: "bodyweight_standard", bodyweight: true },
    { label: "Diamond", equipment: [], key: "bodyweight_diamond", bodyweight: true },
  ]},
  { id: "dip", name: "Dip", primary: "Chest", pattern: "horizontal_press", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dip Station", equipment: ["dip_station"], bodyweight: true },
    { label: "Assisted Dip Machine", equipment: ["assisted_pullup_machine"] },
  ]},
  { id: "svend_press", name: "Svend Press", primary: "Chest", pattern: "isolation_chest", secondary: [], type: "Isolation", variants: [
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "floor_press", name: "Floor Press", primary: "Chest", pattern: "horizontal_press", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "pullover", name: "Pullover", primary: "Chest", pattern: "isolation_chest", secondary: ["Back"], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells", "flat_bench"] },
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},

  // SHOULDERS (9)
  { id: "overhead_press", name: "Overhead Press", primary: "Shoulders", pattern: "vertical_press", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "arnold_press", name: "Arnold Press", primary: "Shoulders", pattern: "vertical_press", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "machine_shoulder_press", name: "Machine Shoulder Press", primary: "Shoulders", pattern: "vertical_press", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Hammer Strength Shoulder Press", equipment: ["hammer_strength_shoulder"] },
  ]},
  { id: "lateral_raise", name: "Lateral Raise", primary: "Shoulders", pattern: "isolation_side_delt", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Lateral Raise Machine", equipment: ["lateral_raise_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "front_raise", name: "Front Raise", primary: "Shoulders", pattern: "isolation_front_delt", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "rear_delt_fly", name: "Rear Delt Fly", primary: "Shoulders", pattern: "isolation_rear_delt", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable Crossover", equipment: ["cable_crossover"] },
    { label: "Pec Deck (Reverse)", equipment: ["pec_deck"] },
  ]},
  { id: "landmine_press", name: "Landmine Press", primary: "Shoulders", pattern: "vertical_press", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
  ]},
  { id: "handstand_push_up", name: "Handstand Push-Up", primary: "Shoulders", pattern: "vertical_press", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},

  // ARMS (13)
  { id: "bicep_curl", name: "Bicep Curl", primary: "Arms", pattern: "isolation_biceps", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar"] },
    { label: "Bicep Curl Machine", equipment: ["bicep_curl_machine"] },
  ]},
  { id: "hammer_curl", name: "Hammer Curl", primary: "Arms", pattern: "isolation_biceps", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "preacher_curl", name: "Preacher Curl", primary: "Arms", pattern: "isolation_biceps", secondary: [], type: "Isolation", variants: [
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar", "preacher_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "preacher_bench"] },
  ]},
  { id: "concentration_curl", name: "Concentration Curl", primary: "Arms", pattern: "isolation_biceps", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "incline_curl", name: "Incline Curl", primary: "Arms", pattern: "isolation_biceps", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "tricep_pushdown", name: "Tricep Pushdown", primary: "Arms", pattern: "isolation_triceps", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Tricep Extension Machine", equipment: ["tricep_extension_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "overhead_tricep_extension", name: "Overhead Tricep Extension", primary: "Arms", pattern: "isolation_triceps", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar"] },
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Tricep Extension Machine", equipment: ["tricep_extension_machine"] },
  ]},
  { id: "skull_crusher", name: "Skull Crusher", primary: "Arms", pattern: "isolation_triceps", secondary: [], type: "Isolation", variants: [
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar", "flat_bench"] },
    { label: "Dumbbells", equipment: ["dumbbells", "flat_bench"] },
  ]},
  { id: "close_grip_bench", name: "Close-Grip Bench Press", primary: "Arms", pattern: "horizontal_press", secondary: ["Chest"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell", "flat_bench"] },
    { label: "Smith Machine", equipment: ["smith_machine", "flat_bench"] },
  ]},
  { id: "tricep_kickback", name: "Tricep Kickback", primary: "Arms", pattern: "isolation_triceps", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "wrist_curl", name: "Wrist Curl", primary: "Arms", pattern: "isolation_forearms", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "bench_dip", name: "Bench Dip", primary: "Arms", pattern: "isolation_triceps", secondary: ["Chest"], type: "Compound", variants: [
    { label: "Flat Bench", equipment: ["flat_bench"], bodyweight: true },
  ]},

  // CORE (19)
  { id: "plank", name: "Plank", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "side_plank", name: "Side Plank", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "reverse_plank", name: "Reverse Plank", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "dead_bug", name: "Dead Bug", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "pallof_press", name: "Pallof Press", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Compound", variants: [
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "ab_wheel_rollout", name: "Ab Wheel Rollout", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Compound", variants: [{ label: "Ab Wheel", equipment: ["ab_wheel"], bodyweight: true }]},
  { id: "cable_twist", name: "Cable Twist", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Compound", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Torso Rotation Machine", equipment: ["torso_rotation_machine"] },
  ]},
  { id: "mountain_climber", name: "Mountain Climber", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "crunch", name: "Crunch", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [], bodyweight: true },
    { label: "Ab Crunch Machine", equipment: ["ab_crunch_machine"] },
  ]},
  { id: "cable_crunch", name: "Cable Crunch", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "bicycle_crunch", name: "Bicycle Crunch", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "oblique_crunch", name: "Oblique Crunch", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "decline_crunch", name: "Decline Crunch", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [
    { label: "Adjustable Bench", equipment: ["adjustable_bench"], bodyweight: true },
  ]},
  { id: "hanging_leg_raise", name: "Hanging Leg Raise", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"], bodyweight: true },
  ]},
  { id: "leg_raise", name: "Leg Raise", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [], bodyweight: true },
  ]},
  { id: "russian_twist", name: "Russian Twist", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [], bodyweight: true },
    { label: "Medicine Ball", equipment: ["medicine_ball"] },
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "side_bend", name: "Side Bend", primary: "Core", pattern: "isolation_obliques", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "superman", name: "Superman", primary: "Core", pattern: "isolation_lower_back", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "v_up", name: "V-Up", primary: "Core", pattern: "isolation_abs", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},

  // CARDIO (7)
  { id: "treadmill", name: "Treadmill", primary: "Cardio", pattern: "cardio_steady", secondary: ["Legs"], type: "Compound", variants: [{ label: "Treadmill", equipment: ["treadmill"] }]},
  { id: "stationary_bike", name: "Stationary Bike", primary: "Cardio", pattern: "cardio_steady", secondary: ["Legs"], type: "Compound", variants: [{ label: "Stationary Bike", equipment: ["stationary_bike"] }]},
  { id: "rowing_machine", name: "Rowing Machine", primary: "Cardio", pattern: "cardio_steady", secondary: ["Back", "Arms"], type: "Compound", variants: [{ label: "Rowing Machine", equipment: ["rowing_machine"] }]},
  { id: "elliptical", name: "Elliptical", primary: "Cardio", pattern: "cardio_steady", secondary: ["Legs"], type: "Compound", variants: [{ label: "Elliptical", equipment: ["elliptical"] }]},
  { id: "stair_climber", name: "Stair Climber", primary: "Cardio", pattern: "cardio_steady", secondary: ["Legs"], type: "Compound", variants: [{ label: "Stair Climber", equipment: ["stair_climber"] }]},
  { id: "jump_rope", name: "Jump Rope", primary: "Cardio", pattern: "conditioning", secondary: [], type: "Compound", variants: [{ label: "Jump Rope", equipment: ["jump_rope"] }]},
  { id: "battle_ropes", name: "Battle Ropes", primary: "Cardio", pattern: "conditioning", secondary: ["Arms", "Shoulders"], type: "Compound", variants: [{ label: "Battle Ropes", equipment: ["battle_ropes"] }]},

  // FULL BODY (18)
  { id: "power_clean", name: "Power Clean", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "hang_clean", name: "Hang Clean", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "clean_and_press", name: "Clean and Press", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders", "Arms"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "clean_and_jerk", name: "Clean and Jerk", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders", "Arms"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "snatch", name: "Snatch", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "power_snatch", name: "Power Snatch", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "hang_snatch", name: "Hang Snatch", primary: "Full Body", pattern: "olympic", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "deadlift_high_pull", name: "Deadlift High Pull", primary: "Full Body", pattern: "olympic", secondary: ["Back", "Shoulders"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "muscle_up", name: "Muscle-Up", primary: "Full Body", pattern: "olympic", secondary: ["Back", "Chest", "Arms"], type: "Olympic", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"], bodyweight: true },
    { label: "Gymnastics Rings", equipment: ["gymnastics_rings"], bodyweight: true },
  ]},
  { id: "kettlebell_swing", name: "Kettlebell Swing", primary: "Full Body", pattern: "conditioning", secondary: ["Legs", "Back"], type: "Compound", variants: [{ label: "Kettlebells", equipment: ["kettlebell"] }]},
  { id: "turkish_get_up", name: "Turkish Get-Up", primary: "Full Body", pattern: "conditioning", secondary: ["Shoulders", "Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "thruster", name: "Thruster", primary: "Full Body", pattern: "conditioning", secondary: ["Legs", "Shoulders"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "farmer_carry", name: "Farmer Carry", primary: "Full Body", pattern: "carry", secondary: ["Back", "Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "sled_push", name: "Sled Push", primary: "Full Body", pattern: "conditioning", secondary: ["Legs", "Core"], type: "Compound", variants: [{ label: "Sled", equipment: ["sled"] }]},
  { id: "sled_pull", name: "Sled Pull", primary: "Full Body", pattern: "conditioning", secondary: ["Legs", "Back"], type: "Compound", variants: [{ label: "Sled", equipment: ["sled"] }]},
  { id: "bear_crawl", name: "Bear Crawl", primary: "Full Body", pattern: "conditioning", secondary: ["Core", "Shoulders"], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "burpee", name: "Burpee", primary: "Full Body", pattern: "conditioning", secondary: ["Core", "Legs"], type: "Compound", variants: [{ label: "Bodyweight", equipment: [], bodyweight: true }]},
  { id: "ball_slam", name: "Ball Slam", primary: "Full Body", pattern: "conditioning", secondary: ["Core", "Shoulders"], type: "Compound", variants: [{ label: "Medicine Ball", equipment: ["medicine_ball"] }]},
];

/* Variant key helper: deterministic string derived from a variant's equipment
   list. Sorting ensures stability regardless of how the variant was declared.
   Example: { equipment: ["barbell", "flat_bench"] } → "barbell+flat_bench".
   Empty equipment (pure bodyweight) → "bodyweight".

   For variants that use the same equipment but are meaningfully different
   lifts (e.g. Sumo vs Conventional Deadlift, both on a barbell), the variant
   can specify an explicit `key` field to disambiguate. */
function variantKey(variant) {
  if (variant.key) return variant.key;
  if (!variant.equipment || variant.equipment.length === 0) return "bodyweight";
  return [...variant.equipment].sort().join("+");
}


/* Build the set of body-part filters, including exercises that appear in
   two groups via alsoIn. Returns a new array each call, already sorted A-Z.
   Optionally merges in a list of user-created custom exercises. Custom
   exercises are always included in "All"; for body-part filters, we match
   on their `primary` field the same way library exercises do. */
function getExercisesForFilter(filter, customs = []) {
  const all = [...EXERCISE_LIBRARY, ...customs];
  if (filter === "All") return all.sort((a, b) => a.name.localeCompare(b.name));
  return all
    .filter((e) => e.primary === filter || (e.alsoIn && e.alsoIn.includes(filter)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* Generic lookup against the combined library + custom exercises. Callers
   that used to call `EXERCISE_LIBRARY.find(...)` should use this instead so
   references survive for custom exercises too (active workout that contains
   a custom exercise, recent-workouts on Home, etc). */
function findExerciseById(id, customs = []) {
  return EXERCISE_LIBRARY.find((e) => e.id === id) || customs.find((e) => e.id === id) || null;
}
function findExerciseByName(name, customs = []) {
  return EXERCISE_LIBRARY.find((e) => e.name === name) || customs.find((e) => e.name === name) || null;
}

/* A variant is "available" if the user has every equipment id it requires.
   A variant with an empty equipment array is always available (bodyweight). */
function variantAvailable(variant, userEquip) {
  return variant.equipment.every((id) => userEquip.has(id));
}
function exerciseHasAnyAvailableVariant(ex, userEquip) {
  return ex.variants.some((v) => variantAvailable(v, userEquip));
}

/* For the AlternativesSheet (D-019) row dim state. Returns a short label
   like "Needs flat bench" or "Needs barbell + adjustable bench" describing
   what the user is missing. Strategy: pick the variant with the FEWEST
   missing equipment ids (the cheapest path to "I can do this today"), then
   join their pretty labels with " + ". Returns null when the user has at
   least one variant fully covered (i.e. nothing is missing — not dimmed).
   Falls back to "Needs equipment" when the joined label would exceed ~28
   chars, since the row is one-line and ellipsis on this string reads worse
   than a generic message. */
function getMissingEquipmentLabel(exercise, userEquip) {
  if (exerciseHasAnyAvailableVariant(exercise, userEquip)) return null;
  // Cheapest-missing variant
  let best = null;
  for (const v of exercise.variants) {
    const missing = v.equipment.filter((id) => !userEquip.has(id));
    if (missing.length === 0) return null; // safety; covered by the early return above
    if (best === null || missing.length < best.length) best = missing;
  }
  if (!best) return "Needs equipment";
  const labels = best.map((id) => (EQUIPMENT_LABEL_BY_ID[id] || id).toLowerCase());
  const joined = `Needs ${labels.join(" + ")}`;
  return joined.length > 28 ? "Needs equipment" : joined;
}

/* A variant is "bodyweight" if its data carries the explicit bodyweight: true
   flag. Used by the active logger to decide whether the lbs field is required
   for completing a set. Bodyweight variants still render the lbs tap-target
   so the user can optionally log added weight (belt, plate held, etc.); the
   flag only affects checkbox gating. Coalesce to false defensively — older
   persisted variant snapshots may not carry the field. */
function isBodyweightVariant(variant) {
  return !!(variant && variant.bodyweight);
}

/* Multi-field search matcher. Matches if the query is a substring of any of:
   - exercise name ("Bench Press")
   - primary muscle group ("Chest")
   - secondary muscles ("Arms", "Shoulders")
   - variant labels ("Barbell", "Dumbbells", "Smith Machine")

   This lets users search by equipment ("dumbbell"), muscle ("chest"), or
   name ("bench") and get sensible results instead of only name matching.
   Case-insensitive; query is trimmed. */
/* ── Search alias map ─────────────────────────────────────────────
   Common lifter shorthand → the actual term the exercise library uses.
   When a user types an alias, we also match against the expansion. This
   is additive — the existing name/primary/secondary/variant matches still
   apply. If a word isn't in the map it's passed through unchanged.

   The alias value is ALSO substring-matched against the same fields as
   the raw query, so "RDL" expanding to "romanian deadlift" finds the
   Romanian Deadlift entry; "db" expanding to "dumbbells" finds every
   exercise with a dumbbell variant.

   Bible §3.1 — add aliases as we see them come up in usage. Start small.
*/
const SEARCH_ALIASES = {
  // Compound lift shorthand
  "rdl": "romanian deadlift",
  "sldl": "romanian deadlift",
  "ohp": "overhead press",
  "cgbp": "close-grip bench press",
  "bp": "bench press",
  "bb": "barbell",
  "db": "dumbbells",
  "kb": "kettlebells",
  "smith": "smith machine",
  // Muscle / body part shorthand
  "tris": "arms",
  "bis": "arms",
  "delts": "shoulders",
  "quads": "legs",
  "hams": "legs",
  "glutes": "legs",
  "abs": "core",
  "lats": "back",
  "traps": "back",
  "pecs": "chest",
  // Movement shorthand
  "pullup": "pull-up",
  "pullups": "pull-up",
  "pushup": "push-up",
  "pushups": "push-up",
  "chinup": "chin-up",
  "chinups": "chin-up",
  // Bench press short forms — exercises were renamed to "Incline Bench Press"
  // and "Decline Bench Press", but plenty of users will still type the
  // shorter "Incline Press" / "Decline Press". Keys are normalized form
  // (no spaces/hyphens) to match the alias-lookup key.
  "inclinepress": "incline bench press",
  "declinepress": "decline bench press",
};

// Normalize for search matching: lowercase, strip hyphens and whitespace.
// Lets "Pull Up" match "Pull-Up", "push-up" match "push up", "chinup" match
// "Chin-Up", etc. Applied symmetrically to query and haystack.
function normalizeForSearch(s) {
  return s.toLowerCase().replace(/[-\s]+/g, "");
}

function exerciseMatchesSearch(ex, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  // Direct match against name, primary, secondary, variants.
  if (normalizeForSearch(ex.name).includes(q)) return true;
  if (normalizeForSearch(ex.primary).includes(q)) return true;
  if (ex.secondary && ex.secondary.some((m) => normalizeForSearch(m).includes(q))) return true;
  if (ex.variants.some((v) => normalizeForSearch(v.label).includes(q))) return true;
  // Alias match — if the query is a known abbreviation, also try its
  // expansion against the same fields. Avoids false negatives like "rdl"
  // returning zero results. Lookup key is normalized so "Incline Press",
  // "incline press", "incline-press", and "InclinePress" all resolve.
  const alias = SEARCH_ALIASES[q];
  if (alias) {
    const a = normalizeForSearch(alias);
    if (normalizeForSearch(ex.name).includes(a)) return true;
    if (normalizeForSearch(ex.primary).includes(a)) return true;
    if (ex.secondary && ex.secondary.some((m) => normalizeForSearch(m).includes(a))) return true;
    if (ex.variants.some((v) => normalizeForSearch(v.label).includes(a))) return true;
  }
  return false;
}
/* ── Derived history helpers ─────────────────────────────────────
   History was previously stored in a separate MOCK_HISTORY keyed by
   exerciseId + variantKey. That's gone. Everything below derives on
   the fly from workoutHistory (session log) + customExercises.

   A session looks like:
     { id, name, date, durationSec, exercises: [
       { name, variantLabel, sets: [{ weight, reps, type }] }, ...
     ]}
   We resolve each (name, variantLabel) pair back to (exerciseId, variantKey)
   against the library + customs so the existing callers stay unchanged.

   A note on deleted customs: once a user deletes a custom exercise, its
   definition is gone from `customExercises`, so `findExerciseByName` won't
   resolve it. The session log still contains the exercise's name and sets
   (history is preserved in the session record itself) — but there's no
   way to land on a detail sheet for it, because the list won't include it.
   This is the locked behavior (Bible §15, "Custom exercise edits create
   deliberate history mismatches"). */

/* Resolve a (session exercise name, variantLabel) pair to (exerciseId, variantKey).
   Returns null if the exercise can't be resolved (e.g. deleted custom). */
function resolveSessionExercise(sessionEx, customs = []) {
  const exDef = findExerciseByName(sessionEx.name, customs);
  if (!exDef) return null;
  // Match variant by label. Custom exercises are single-variant so their
  // single variant wins regardless.
  const variant =
    exDef.variants.find((v) => v.label === sessionEx.variantLabel) ||
    exDef.variants[0];
  return { exerciseId: exDef.id, vKey: variantKey(variant) };
}

/* Returns the session history for a (exerciseId, variantKey) pair, derived
   from workoutHistory. Sessions are returned chronologically oldest-first
   to match the shape callers expect (they index [length-1] for most recent).
   Shape per entry: { date, sets: [{ weight, reps }] }. */
function getVariantHistory(exerciseId, vKey, workoutHistory = [], customs = []) {
  const out = [];
  for (const session of workoutHistory) {
    for (const ex of session.exercises || []) {
      const resolved = resolveSessionExercise(ex, customs);
      if (!resolved) continue;
      if (resolved.exerciseId === exerciseId && resolved.vKey === vKey) {
        // Strip the `type` field — downstream code only needs weight/reps
        // (warmups are kept; sessionTopSet filters them out where needed).
        out.push({
          date: session.date,
          sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, type: s.type })),
        });
      }
    }
  }
  // Chronological ascending (oldest first, most recent last).
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/* Returns the most recent session date (ISO string) across a variant's
   history, or null if the variant has no history. Used for the smart-default
   variant picker and the dropdown previews. */
function getVariantLastDate(exerciseId, vKey, workoutHistory = [], customs = []) {
  const hist = getVariantHistory(exerciseId, vKey, workoutHistory, customs);
  if (hist.length === 0) return null;
  return hist[hist.length - 1].date;
}

/* Smart default variant selection for opening the detail sheet:
   1. The variant with the most recently logged session (any history wins)
   2. Otherwise, the first variant whose equipment the user has
   3. Otherwise, the first variant in the list (so the sheet never crashes)
*/
function pickDefaultVariant(exercise, userEquipment, workoutHistory = [], customs = []) {
  // (1) most recently logged
  let best = null;
  let bestDate = null;
  for (const v of exercise.variants) {
    const d = getVariantLastDate(exercise.id, variantKey(v), workoutHistory, customs);
    if (d && (!bestDate || d > bestDate)) {
      best = v;
      bestDate = d;
    }
  }
  if (best) return best;

  // (2) first available by equipment
  const available = exercise.variants.find((v) => variantAvailable(v, userEquipment));
  if (available) return available;

  // (3) first variant in the list
  return exercise.variants[0];
}

/* Alternatives lookup for D-019. Strict same-primary + same-pattern filter,
   with a same-primary fallback when the strict bucket is sparse (<3 peers).
   Returns:
     { peers, fallback, bucket }
   where bucket ∈ "primary" | "fallback" | "empty":
     • "primary":  3+ peers — show peers only
     • "fallback": 1-2 peers — show peers, divider, then fallback ("Other <muscle> exercises")
     • "empty":    0 peers — caller renders the Ask Coach / Browse empty state
   Custom exercises (pattern: null) and orphan isolations (Lateral Raise,
   Wrist Curl, etc — bucket size 1) intentionally trigger empty-state per
   Session 31. The Coach paywall is a designed conversion moment, not a gap.
   No equipment filter: all peers/fallback are returned regardless of what
   the user owns. The traveling-user / drop-in-gym case is real — we don't
   hide options. AlternativesSheet dims rows for un-owned exercises and
   surfaces the missing equipment in the row's subline.
*/
function getAlternatives(exercise, userEquipment, customExercises = []) {
  // No pattern means the exercise opted out of algorithmic alternatives —
  // route to Coach. Customs land here, plus any future library entries we
  // explicitly leave untagged.
  if (!exercise.pattern) {
    return { peers: [], fallback: [], bucket: "empty" };
  }

  const pool = [...EXERCISE_LIBRARY, ...customExercises];

  const peers = pool.filter((e) =>
    e.id !== exercise.id &&
    e.pattern === exercise.pattern &&
    e.primary === exercise.primary
  );

  // Fallback only matters when peers are sparse. Same primary, different
  // pattern, not the exercise itself.
  let fallback = [];
  if (peers.length < 3) {
    const peerIds = new Set(peers.map((e) => e.id));
    fallback = pool.filter((e) =>
      e.id !== exercise.id &&
      !peerIds.has(e.id) &&
      e.primary === exercise.primary
    );
  }

  let bucket;
  if (peers.length >= 3) bucket = "primary";
  else if (peers.length >= 1) bucket = "fallback";
  else bucket = "empty";

  return { peers, fallback, bucket };
}

/* For the list row display: last max of the user's most-recently-logged
   variant of this exercise. Returns { value, date, variantLabel } or null.
   Falls back to null for exercises with no logged history at all. */
function getRowLastMax(exerciseId, exercise, workoutHistory = [], customs = []) {
  // Walk the whole history once, tracking the latest session for every
  // variant of this exercise. Cheaper than calling getVariantHistory for
  // each variant, since the list uses this on every row.
  let latestDate = null;
  let latestVKey = null;
  let latestSets = null;

  for (const session of workoutHistory) {
    for (const ex of session.exercises || []) {
      const resolved = resolveSessionExercise(ex, customs);
      if (!resolved || resolved.exerciseId !== exerciseId) continue;
      if (!latestDate || session.date > latestDate) {
        latestDate = session.date;
        latestVKey = resolved.vKey;
        latestSets = ex.sets;
      }
    }
  }
  if (!latestDate) return null;

  const topSet = sessionTopSet(latestSets);

  // Resolve variant label from the library so the display matches the
  // canonical variant name (not the session's possibly-stale label).
  let variantLabel = null;
  if (exercise) {
    const matchedVariant = exercise.variants.find((v) => variantKey(v) === latestVKey);
    if (matchedVariant) variantLabel = matchedVariant.label;
  }

  return {
    value: formatSetSummary(topSet, " × "),
    date: latestDate,
    variantLabel,
  };
}

/* Format an ISO date as a short relative label: "today", "1d ago", "2w ago",
   "3mo ago", etc. Used for the last-max display on exercise list rows. */
function formatRelativeDate(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + "T00:00:00");
  const days = Math.round((today - d) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 14) return "1w ago";
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 60) return "1mo ago";
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  if (days < 730) return "1y ago";
  return `${Math.floor(days / 365)}y ago`;
}

/* Epley estimated 1RM: weight × (1 + reps/30). For reps=1, returns weight
   exactly. Caps reps at 15 since the formula loses accuracy beyond that. */
function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  const r = Math.min(reps, 15);
  return weight * (1 + r / 30);
}

/* Given a session's sets, return the best e1RM across all sets in that
   session. This is the canonical per-session strength metric. */
function sessionBestE1rm(sets) {
  return Math.max(...sets.map((s) => e1rm(s.weight, s.reps)));
}

/* Total volume for a session: sum of weight × reps across all sets. */
function sessionVolume(sets) {
  return sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}

/* Heaviest weight across a session (ties broken by most reps at that weight). */
function sessionTopSet(sets) {
  let best = null;
  for (const s of sets) {
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
      best = s;
    }
  }
  return best;
}

/* Render a "weight × reps" summary, collapsing the weight portion when the
   set has no meaningful weight (bodyweight sets stored as 0 in older mock
   history, or "" in new sessions where the user left the optional lbs field
   blank). Returns formatted string for display in history rows, recaps, and
   PR cards. Caller controls separator (`×` vs ` × ` vs ` lbs × `). */
function hasMeaningfulWeight(set) {
  return set && set.weight !== "" && set.weight != null && set.weight !== 0;
}
function formatSetSummary(set, sep = "×") {
  if (!set) return "—";
  if (!hasMeaningfulWeight(set)) return `${set.reps}`;
  return `${set.weight}${sep}${set.reps}`;
}

/* Format a date string (YYYY-MM-DD) into a short display label like "Mar 22" */
function formatShortDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Shared Components ───────────────────────────────────────── */

function PhoneFrame({ children }) {
  // Full-viewport container for real-device rendering.
  //
  // Replaces the old fake-bezel mockup (375×812 hardcoded box with fake
  // "9:41" status bar, fake signal/wifi/battery SVGs, and fake home
  // indicator) that worked for desktop previews but rendered as a
  // "phone-in-a-phone" on real iOS devices.
  //
  // Important: we apply safe-area padding for top/left/right ONLY here.
  // Bottom safe-area is handled by the TabBar itself, so the bar's
  // background extends to the screen's actual bottom edge while its icons
  // sit above the home indicator. That's how native iOS apps do it —
  // adding bottom padding here pushes the whole TabBar up instead and
  // leaves a black gap below it.
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh", // fallback
        minHeight: "100dvh",
        maxHeight: "100dvh",
        background: COLORS.bg,
        position: "relative",
        overflow: "hidden",
        overscrollBehavior: "contain",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

function TopBar({ onBack, onSkip, showBack = true, showSkip = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 24px 8px", minHeight: 36, flexShrink: 0 }}>
      {showBack ? (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span style={{ color: COLORS.textSecondary, fontSize: 15 }}>Back</span>
        </button>
      ) : <div />}
      {showSkip ? (
        <button onClick={onSkip} style={{ background: "none", border: "none", color: COLORS.textSecondary, fontSize: 15, cursor: "pointer", padding: "4px 0" }}>Skip for now</button>
      ) : <div />}
    </div>
  );
}

function GoldButton({ children, onClick, style: s = {} }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: "100%", padding: "18px 24px",
        background: h ? "#e6c200" : COLORS.gold,
        color: COLORS.bg, border: "none", borderRadius: 12,
        fontSize: 17, fontWeight: 700, cursor: "pointer",
        transition: "all 0.2s ease",
        transform: h ? "scale(1.02)" : "scale(1)",
        letterSpacing: 0.3, ...s,
      }}
    >
      {children}
    </button>
  );
}

function ProgressBar({ current, total }) {
  return (
    <div style={{ padding: "0 24px", marginBottom: 14, flexShrink: 0 }}>
      <div style={{ height: 6, background: COLORS.border, borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${(current / total) * 100}%`, background: COLORS.gold, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function SelectableChip({ label, selected, onClick, style: s = {} }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "14px 20px", borderRadius: 10,
        border: `1.5px solid ${selected ? COLORS.gold : COLORS.border}`,
        background: selected ? COLORS.goldHighlight : COLORS.card,
        color: selected ? COLORS.gold : COLORS.text,
        fontSize: 15, fontWeight: selected ? 600 : 400,
        cursor: "pointer", transition: "all 0.2s ease",
        textAlign: "center", whiteSpace: "nowrap", ...s,
      }}
    >
      {label}
    </button>
  );
}

function TextInput({ placeholder, value, onChange, type = "text" }) {
  const [f, setF] = useState(false);
  return (
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        width: "100%", padding: "16px 18px", background: COLORS.card,
        border: `1.5px solid ${f ? COLORS.gold : COLORS.border}`,
        borderRadius: 10, color: COLORS.text, fontSize: 16,
        outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box",
      }}
    />
  );
}

function SocialButtons() {
  const bs = { width: "100%", padding: "16px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.text, fontSize: 15, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button style={bs}><svg width="18" height="20" viewBox="0 0 18 20" fill="white"><path d="M17.05 14.67c-.41.96-.6 1.39-1.13 2.24-.73 1.18-1.76 2.66-3.04 2.67-1.13.01-1.42-.74-2.96-.73-1.53.01-1.85.74-2.99.73-1.28-.01-2.25-1.33-2.98-2.51C2.14 14.24 1.9 11.08 3.14 9.4c.88-1.2 2.27-1.9 3.57-1.9 1.33 0 2.17.74 3.27.74 1.07 0 1.72-.75 3.26-.75 1.16 0 2.39.63 3.26 1.72-2.87 1.57-2.4 5.66.55 6.46zM12.15 5.53c.56-.72.99-1.74.83-2.78-.92.06-2 .65-2.63 1.4-.57.68-1.04 1.71-.86 2.71 1.01.03 2.05-.57 2.66-1.33z" /></svg> Continue with Apple</button>
      <button style={bs}><svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.08-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" fill="#4285F4" /><path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z" fill="#34A853" /><path d="M3.96 10.71c-.18-.54-.28-1.11-.28-1.71s.1-1.17.28-1.71V4.96H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.04l3-2.33z" fill="#FBBC05" /><path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" fill="#EA4335" /></svg> Continue with Google</button>
    </div>
  );
}

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
      <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>or</span>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    </div>
  );
}

function MYGLogo({ size = 40 }) {
  return <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: size, fontWeight: 700, color: COLORS.gold, letterSpacing: 4, textAlign: "center" }}>MYG</div>;
}

/* ── ONBOARDING SCREENS ─────────────────────────────────────── */

function WelcomeScreen({ onGetStarted, onSignIn }) {
  const [logoV, setLogoV] = useState(false);
  const [contentV, setContentV] = useState(false);
  useEffect(() => { setTimeout(() => setLogoV(true), 200); setTimeout(() => setContentV(true), 900); }, []);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", position: "relative" }}>
      {/* V.6 marker — temporary build indicator so we can confirm the file
          actually updated on the device after each push. Top-right corner,
          dimmed, doesn't compete with the logo. Remove before shipping.
          Bump the number with each push so cache staleness is obvious. */}
      <div style={{ position: "absolute", top: 16, right: 20, color: COLORS.textSecondary, fontSize: 11, fontWeight: 500, letterSpacing: 1, opacity: 0.7 }}>V.6</div>
      <div style={{ position: "absolute", top: "40%", textAlign: "center", opacity: logoV ? 1 : 0, transform: logoV ? "translateY(-50%) scale(1)" : "translateY(-50%) scale(1.08)", transition: "all 0.9s cubic-bezier(0.22,1,0.36,1)" }}>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 92, fontWeight: 700, color: COLORS.gold, margin: 0, letterSpacing: 8 }}>MYG</h1>
      </div>
      <div style={{ position: "absolute", bottom: 40, left: 32, right: 32, opacity: contentV ? 1 : 0, transform: contentV ? "translateY(0)" : "translateY(16px)", transition: "all 0.6s ease" }}>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, textAlign: "center", margin: "0 0 4px", fontWeight: 400 }}>Your AI fitness coach to help</p>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, color: COLORS.gold, textAlign: "center", margin: "0 0 28px", fontWeight: 400, fontStyle: "italic" }}>Meet Your Goals</p>
        <GoldButton onClick={onGetStarted}>Get Started</GoldButton>
        <button onClick={onSignIn} style={{ width: "100%", padding: 14, background: "none", border: "none", color: COLORS.textSecondary, fontSize: 14, cursor: "pointer", marginTop: 8 }}>
          Already have an account? <span style={{ color: COLORS.text, fontWeight: 500 }}>Sign in</span>
        </button>
      </div>
    </div>
  );
}

function SignInScreen({ onBack, onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} showSkip={false} />
      <div style={{ flex: 1, padding: "0 24px", overflowY: "auto" }}>
        <div style={{ marginTop: 8, marginBottom: 32 }}><MYGLogo size={36} /></div>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "0 0 8px", fontWeight: 400 }}>Welcome back</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Sign in to your account.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TextInput placeholder="Email" value={email} onChange={setEmail} type="email" />
          <TextInput placeholder="Password" value={password} onChange={setPassword} type="password" />
        </div>
        <div style={{ textAlign: "right", marginTop: 12 }}><button style={{ background: "none", border: "none", color: COLORS.gold, fontSize: 14, cursor: "pointer", padding: 0, fontWeight: 500 }}>Forgot Password?</button></div>
        <div style={{ marginTop: 24 }}><GoldButton onClick={onSignIn}>Sign In</GoldButton></div>
        <Divider />
        <div style={{ paddingBottom: 20 }}><SocialButtons /></div>
      </div>
    </div>
  );
}

function GoalsScreen({ onNext, onBack, onSkip }) {
  const [selected, setSelected] = useState(null);
  const goals = ["Lose Weight", "Build Muscle", "Gain Strength", "Get Lean"];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>
          What is your <span style={{ color: COLORS.gold }}>primary fitness goal</span>?
        </h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Choose one — your Coach will build around this.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map((g) => <SelectableChip key={g} label={g} selected={selected === g} onClick={() => setSelected(g)} />)}
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

function FitnessLevelScreen({ value, onChange, onNext, onBack, onSkip }) {
  const level = value;
  const setLevel = onChange;
  const levels = [
    { id: "beginner", label: "Beginner", desc: "New to lifting" },
    { id: "intermediate", label: "Intermediate", desc: "Some experience in the gym" },
    { id: "advanced", label: "Advanced", desc: "Lifted seriously, know your way around the gym" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>Your fitness level</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Be honest — your Coach adjusts to you.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {levels.map((l) => (
            <button key={l.id} onClick={() => setLevel(l.id)} style={{ padding: 20, borderRadius: 10, border: `1.5px solid ${level === l.id ? COLORS.gold : COLORS.border}`, background: level === l.id ? COLORS.goldHighlight : COLORS.card, cursor: "pointer", textAlign: "left", transition: "all 0.2s ease" }}>
              <div style={{ color: level === l.id ? COLORS.gold : COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{l.label}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.4 }}>{l.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

/* TimeAwayScreen (Screen 3b) — only shown to Intermediate / Advanced.
   Beginner skips this screen entirely (not applicable). The selected
   value lives on App state as `timeAway` and feeds the future Coach
   AI context packet (returning-lifter awareness — Bible §10). */
function TimeAwayScreen({ value, onChange, onNext, onBack, onSkip }) {
  const selected = value;
  const setSelected = onChange;
  const options = [
    { id: "current", label: "Currently training", desc: "I'm in the gym right now" },
    { id: "lt1yr", label: "Less than a year off", desc: "Took a break, getting back into it" },
    { id: "1to3yr", label: "1–3 years off", desc: "Been a while since I was consistent" },
    { id: "gt3yr", label: "3+ years off", desc: "It's been a long time" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>How long since you trained?</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Helps your Coach ramp up at the right pace.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((o) => (
            <button key={o.id} onClick={() => setSelected(o.id)} style={{ padding: 20, borderRadius: 10, border: `1.5px solid ${selected === o.id ? COLORS.gold : COLORS.border}`, background: selected === o.id ? COLORS.goldHighlight : COLORS.card, cursor: "pointer", textAlign: "left", transition: "all 0.2s ease" }}>
              <div style={{ color: selected === o.id ? COLORS.gold : COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{o.label}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.4 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

function AboutYouScreen({ onNext, onBack, onSkip }) {
  const [gender, setGender] = useState(null);
  const [ageRange, setAgeRange] = useState(null);
  const genders = ["Male", "Female", "Prefer not to say"];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>A bit about you</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Helps your Coach tailor recommendations.</p>
        <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "0 0 10px", letterSpacing: 1, textTransform: "uppercase", fontWeight: 500 }}>Gender</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {genders.map((g) => <SelectableChip key={g} label={g} selected={gender === g} onClick={() => setGender(g)} style={{ padding: "12px 12px", fontSize: 13, flex: g === "Prefer not to say" ? "none" : 1 }} />)}
        </div>
        <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "0 0 10px", letterSpacing: 1, textTransform: "uppercase", fontWeight: 500 }}>Age Range</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["18–24", "25–34", "35–44"].map((a) => <SelectableChip key={a} label={a} selected={ageRange === a} onClick={() => setAgeRange(a)} style={{ flex: 1, padding: "12px 8px", fontSize: 14 }} />)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {["45–54", "55+"].map((a) => <SelectableChip key={a} label={a} selected={ageRange === a} onClick={() => setAgeRange(a)} style={{ flex: 1, maxWidth: "calc(33.33% - 3px)", padding: "12px 8px", fontSize: 14 }} />)}
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

function DaysScreen({ onNext, onBack, onSkip }) {
  const [days, setDays] = useState(3);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>How many days per week?</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: 0 }}>Your Coach will plan around your schedule.</p>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
          <div style={{ fontSize: 80, fontFamily: "Georgia, 'Times New Roman', serif", color: COLORS.gold, fontWeight: 700, marginBottom: 4 }}>{days}</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 16, marginBottom: 40 }}>{days === 1 ? "day" : "days"} per week</div>
          <div style={{ width: "100%", padding: "0 8px" }}>
            <input type="range" min="1" max="7" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "100%", appearance: "none", height: 4, borderRadius: 2, background: `linear-gradient(to right, ${COLORS.gold} 0%, ${COLORS.gold} ${((days - 1) / 6) * 100}%, ${COLORS.border} ${((days - 1) / 6) * 100}%, ${COLORS.border} 100%)`, outline: "none", cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} style={{ color: d === days ? COLORS.gold : COLORS.textSecondary, fontSize: 13, fontWeight: d === days ? 700 : 400, width: 20, textAlign: "center" }}>{d}</span>)}
            </div>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

/* ── Equipment Preset Screen ─────────────────────────────────── */

function EquipmentPresetScreen({ onBack, onSkip, selectedEquipment, onPickPreset, onEditDetail, onContinue }) {
  const count = selectedEquipment.size;
  const hasSelection = count > 0;

  // Simple on-brand icons (gold stroke) replacing the old emoji treatment.
  // Barbell, house, and flexed-arm metaphors kept but now in-style.
  const iconFull = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="9" width="2" height="6" />
      <rect x="5" y="7" width="2" height="10" />
      <rect x="17" y="7" width="2" height="10" />
      <rect x="20" y="9" width="2" height="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
  const iconHome = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
  const iconBody = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 8v5" />
      <path d="M8 12l4 2 4-2" />
      <path d="M9 21l3-8 3 8" />
    </svg>
  );

  const opts = [
    { id: "full", label: "Full Gym", icon: iconFull, desc: "Commercial gym — all equipment" },
    { id: "home", label: "Home Gym", icon: iconHome, desc: "Dumbbells, bench, maybe a rack" },
    { id: "bodyweight", label: "Bodyweight Only", icon: iconBody, desc: "No equipment needed" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>Your equipment</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: "0 0 24px", fontStyle: "italic" }}>
          Coach will only suggest exercises using equipment you select.
        </p>
        {!hasSelection && (
          <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 24px" }}>
            Select a starting point to customize.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {opts.map((o) => (
            <button
              key={o.id}
              onClick={() => onPickPreset(o.id)}
              style={{
                padding: "20px", borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
                cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 14,
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,215,0,0.08)", border: `1px solid rgba(255,215,0,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {o.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 3 }}>{o.label}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>{o.desc}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          ))}
        </div>

        {hasSelection && (
          <div style={{ marginTop: 20, padding: "16px 18px", background: COLORS.goldHighlight, border: `1px solid rgba(255,215,0,0.25)`, borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: COLORS.gold, fontSize: 15, fontWeight: 600 }}>{count} items selected</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>Equipment saved</div>
              </div>
              <button onClick={onEditDetail} style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${COLORS.gold}`, borderRadius: 8, color: COLORS.gold, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Edit
              </button>
            </div>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>

      {/* Pinned Continue button */}
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onContinue} style={{ opacity: hasSelection ? 1 : 0.35, pointerEvents: hasSelection ? "auto" : "none" }}>
          Continue
        </GoldButton>
      </div>
    </div>
  );
}

/* ── Equipment Detail Screen — Accordion (Strong-style) ─────────

   Collapsed-by-default accordion. Each category row shows a thumbnail,
   the category name, a chevron, and a category-level checkbox that
   selects/deselects every item inside. Tapping the row (anywhere
   except the checkbox) expands to reveal individual items, each with
   their own thumbnail and checkbox.

   Partial selection shows an "X selected" subtitle under the category
   name. Full selection hides the subtitle. See Bible §2.4 (via April
   2026 change log).

   📝 Thumbnails are MYG-monogram placeholders for now. The real
   equipment photography / licensed illustration set is a pre-launch
   asset task. The <EquipThumb> component is the single seam to swap
   when that pipeline lands.
*/

function EquipThumb({ size = 40, small = false }) {
  // Monogram placeholder. Smaller variant (32px) used for item rows,
  // larger (40px) for category headers.
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700, color: COLORS.gold,
        fontSize: small ? 10 : 12, letterSpacing: 0.5,
      }}>MYG</span>
    </div>
  );
}

function EquipCheckbox({ state, size = 22 }) {
  // Three visual states: "empty" (unchecked), "partial" (dash), "full" (check).
  // Category rows use all three; item rows use empty/full only.
  const isFull = state === "full";
  const isPartial = state === "partial";
  const isActive = isFull || isPartial;
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      border: `1.5px solid ${isActive ? COLORS.gold : COLORS.border}`,
      background: isActive ? COLORS.gold : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 0.15s ease",
    }}>
      {isFull && (
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke={COLORS.bg} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {isPartial && (
        <div style={{ width: size * 0.5, height: 2.5, background: COLORS.bg, borderRadius: 1 }} />
      )}
    </div>
  );
}

function EquipmentDetailScreen({ presetId, existingSelection, onDone, onBack }) {
  const [selected, setSelected] = useState(() => {
    if (existingSelection && existingSelection.size > 0 && presetId === null) {
      return new Set(existingSelection);
    }
    return new Set(PRESETS[presetId] || []);
  });

  // Accordion: all collapsed by default per Bible §2.4. We track which
  // categories are EXPANDED (opposite of the old `collapsed` set) to
  // make the default state obvious from the code.
  const [expanded, setExpanded] = useState(new Set());

  const toggleItem = (id, e) => {
    if (e) e.stopPropagation();
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSection = (catId) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(catId)) n.delete(catId); else n.add(catId);
      return n;
    });
  };

  // Tapping the category checkbox selects ALL if none or some are selected,
  // and deselects ALL if everything in the category is already selected.
  // Does NOT toggle the expand/collapse state.
  const toggleAllInCat = (cat, e) => {
    e.stopPropagation();
    const ids = cat.items.map((i) => i.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => { if (allIn) n.delete(id); else n.add(id); });
      return n;
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 24px 4px", minHeight: 36, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span style={{ color: COLORS.textSecondary, fontSize: 15 }}>Back</span>
        </button>
        <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>
          <span style={{ color: COLORS.gold, fontWeight: 600 }}>{selected.size}</span> selected
        </span>
      </div>

      <div style={{ padding: "0 24px 14px", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, color: COLORS.text, margin: "4px 0 4px", fontWeight: 400 }}>Available Equipment</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Coach will only suggest exercises using equipment you select.
        </p>
      </div>

      {/* Scrollable equipment list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {EQUIPMENT_CATEGORIES.map((cat) => {
          const isOpen = expanded.has(cat.id);
          const catCount = cat.items.filter((i) => selected.has(i.id)).length;
          const total = cat.items.length;
          const catState = catCount === 0 ? "empty" : (catCount === total ? "full" : "partial");

          return (
            <div key={cat.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {/* Category header row */}
              <button
                onClick={() => toggleSection(cat.id)}
                style={{
                  width: "100%", padding: "16px 24px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
                }}
              >
                <EquipThumb size={48} />
                <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                  <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 500 }}>{cat.label}</div>
                  {catState === "partial" && (
                    <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {catCount} selected
                    </div>
                  )}
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={COLORS.textSecondary} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: "transform 0.2s ease", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
                <div onClick={(e) => toggleAllInCat(cat, e)} style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
                  <EquipCheckbox state={catState} size={22} />
                </div>
              </button>

              {/* Individual items */}
              {isOpen && cat.items.map((item, idx) => {
                const isSel = selected.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={(e) => toggleItem(item.id, e)}
                    style={{
                      width: "100%", padding: "14px 24px 14px 48px",
                      background: "rgba(255,255,255,0.02)",
                      border: "none",
                      borderTop: idx === 0 ? `1px solid ${COLORS.border}` : "none",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <EquipThumb size={38} small />
                    <span style={{
                      flex: 1, textAlign: "left",
                      color: isSel ? COLORS.text : COLORS.textSecondary,
                      fontSize: 15, fontWeight: isSel ? 500 : 400,
                    }}>
                      {item.label}
                    </span>
                    <EquipCheckbox state={isSel ? "full" : "empty"} size={20} />
                  </button>
                );
              })}
            </div>
          );
        })}
        <div style={{ height: 20 }} />
      </div>

      {/* Fixed Done button */}
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={() => onDone(selected)}>Done</GoldButton>
      </div>
    </div>
  );
}

/* ── Account & Name ──────────────────────────────────────────── */

function CreateAccountScreen({ onNext, onBack }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} showSkip={false} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ marginTop: 8, marginBottom: 32 }}><MYGLogo size={36} /></div>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "0 0 8px", fontWeight: 400 }}>Create your account</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>One last step before you meet your Coach.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TextInput placeholder="Email" value={email} onChange={setEmail} type="email" />
          <TextInput placeholder="Password" value={pw} onChange={setPw} type="password" />
        </div>
        <Divider />
        <SocialButtons />
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={onNext}>Create Account</GoldButton>
      </div>
    </div>
  );
}

function NameScreen({ onNext, onBack }) {
  const [name, setName] = useState("");
  const handleNext = () => {
    const trimmed = name.trim();
    onNext(trimmed || "Tyler");
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} showSkip={false} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>What should we call you?</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Your Coach will use this name.</p>
        <TextInput placeholder="First name" value={name} onChange={setName} />
        <div style={{ flex: 1, minHeight: 40 }} />
      </div>
      <div style={{ padding: "12px 24px 16px", flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
        <GoldButton onClick={handleNext}>Continue</GoldButton>
      </div>
    </div>
  );
}

function CompletionScreen({ onEnter }) {
  const [v, setV] = useState(false);
  useEffect(() => { setTimeout(() => setV(true), 100); }, []);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", opacity: v ? 1 : 0, transition: "opacity 0.8s ease" }}>
      <div style={{ width: 80, height: 80, borderRadius: 40, border: `3px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "0 0 12px", fontWeight: 400, textAlign: "center" }}>You're all set</h2>
      <p style={{ color: COLORS.textSecondary, fontSize: 15, textAlign: "center", lineHeight: 1.6, margin: "0 0 48px" }}>Your Coach is ready. Let's get to work.</p>
      <GoldButton onClick={onEnter}>Meet Coach AI</GoldButton>
    </div>
  );
}

/* ── MAIN TABS ───────────────────────────────────────────────── */

function HomeTab({ onTabChange, userName, history }) {
  // Recent workouts: pull from the real history (most recent 3) rather
  // than a hardcoded list. Falls back to a friendly empty state below
  // if the user has no workouts yet.
  const recent = (history || []).slice(0, 3);

  // Streak derivation — Bible §7.1. Count consecutive days (anchored
  // to the most recent workout) on which at least one workout was
  // logged. A session logged "today" extends the streak; a gap of
  // more than one day breaks it. Today counts even if no workout
  // logged yet (most recent workout = yesterday is still a 1-day
  // streak that the user can extend by training today).
  const streak = computeStreak(history);

  // Total workouts — simple count from history.
  const totalWorkouts = (history || []).length;

  const initial = (userName || "").trim().charAt(0).toUpperCase() || "?";

  return (
    <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 2px", fontWeight: 400 }}>Good morning, {userName}</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: 0 }}>Level 2 · Grinder</p>
        </div>

        {/* Corner streak pill — subtle, only visible when streak > 0.
            Bible §7.1: "quiet motivator — never intrusive." */}
        {streak > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 12,
            background: "rgba(255,215,0,0.08)",
            border: `1px solid rgba(255,215,0,0.2)`,
            marginRight: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 13 }}>🔥</span>
            <span style={{ color: COLORS.gold, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{streak}</span>
          </div>
        )}

        <div style={{ width: 40, height: 40, borderRadius: 20, background: COLORS.card, border: `2px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: COLORS.gold, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: 16 }}>{initial}</span>
        </div>
      </div>
      <button onClick={() => onTabChange("coach")} style={{ width: "100%", padding: 20, background: COLORS.goldHighlight, border: `1.5px solid ${COLORS.gold}`, borderRadius: 12, cursor: "pointer", textAlign: "left", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.bg} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          </div>
          <div>
            <div style={{ color: COLORS.gold, fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Chat with Coach AI</div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>Get a personalized workout or ask anything</div>
          </div>
        </div>
      </button>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Streak", v: String(streak), u: streak === 1 ? "day" : "days", c: COLORS.gold },
          { l: "XP", v: "750", u: "/ 1,500", c: COLORS.gold },
          { l: "Workouts", v: String(totalWorkouts), u: "total", c: COLORS.text },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, background: COLORS.card, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
            <div style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.l}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ color: s.c, fontSize: 28, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}>{s.v}</span>
              <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{s.u}</span>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>Recent Workouts</p>
      {recent.length === 0 ? (
        <div style={{ background: COLORS.card, borderRadius: 10, padding: 20, border: `1px solid ${COLORS.border}`, textAlign: "center" }}>
          <div style={{ color: COLORS.textSecondary, fontSize: 13, fontStyle: "italic" }}>
            No workouts yet. Log one to start your streak.
          </div>
        </div>
      ) : (
        recent.map((w, i) => {
          // Build a muscle-group summary from the session's exercises.
          const groups = [...new Set(
            (w.exercises || []).map((ex) => {
              const lib = EXERCISE_LIBRARY.find((x) => x.name === ex.name);
              return lib ? lib.primary : null;
            }).filter(Boolean)
          )].slice(0, 3).join(", ");
          return (
            <div key={w.id || i} style={{ background: COLORS.card, borderRadius: 10, padding: 16, marginBottom: 8, border: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{w.name}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>{groups || "—"}</div>
              </div>
              <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{formatRelativeDate(w.date)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// Consecutive-day streak walking backward from the most recent workout.
// Today counts as extending the streak even if today has no workout yet
// (most recent session yesterday → streak 1, trainable today).
function computeStreak(history) {
  if (!history || history.length === 0) return 0;
  const dates = new Set(history.map((w) => w.date));
  // Walk backward from today. If today has no workout, start at yesterday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  if (!dates.has(toISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(toISODate(cursor))) return 0;
  }
  let streak = 0;
  while (dates.has(toISODate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

/* ── Workout Tab ─────────────────────────────────────────────────
   Per Project Bible §6.2. Three phases: idle (empty CTA + history),
   active (logger), finished (summary stub).

   Situation B only for now (no Coach-queued workout). Situation A will
   be added once Coach AI workout generation lands.

   Architecture:
   - Top-level WorkoutTab owns the entire phase state machine.
   - Active logger is a child component that owns the live timer + the
     bulk of the logging UI.
   - Add Exercise picker is its own overlay component (mirrors the
     ExerciseDetailSheet pattern but ends in "add to workout" rather
     than displaying detail).
   - Mock workout history is stored locally below; real history will
     come from Supabase keyed by user.
*/

/* Set types per spec — Strong app convention. Standard sets show their
   number; W/D/F replace the number. */
const SET_TYPES = [
  { id: "warmup",  label: "Warm-up",  short: "W" },
  { id: "working", label: "Working",  short: null }, // shows set number
  { id: "drop",    label: "Drop set", short: "D" },
  { id: "failure", label: "Failure",  short: "F" },
];

/* Mock completed-workout history. Each session captures what actually
   happened (per Bible: data model captures executed, not prescribed).
   Sets carry the type so the recap sheet can render warmups correctly. */
const MOCK_WORKOUT_HISTORY = [
  {
    id: "h1",
    name: "Full Body",
    date: "2026-04-18",
    durationSec: 3480,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 130, reps: 10, type: "warmup" },
        { weight: 235, reps: 7, type: "working" },
        { weight: 245, reps: 6, type: "working" },
        { weight: 255, reps: 5, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 95, reps: 10, type: "warmup" },
        { weight: 170, reps: 7, type: "working" },
        { weight: 180, reps: 6, type: "working" },
        { weight: 190, reps: 5, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 150, reps: 9, type: "working" },
        { weight: 160, reps: 8, type: "working" },
        { weight: 170, reps: 7, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 35, reps: 10, type: "working" },
        { weight: 35, reps: 10, type: "working" },
        { weight: 35, reps: 8, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 8, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 75, reps: 12, type: "working" },
        { weight: 75, reps: 11, type: "working" },
        { weight: 75, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 205, reps: 12, type: "working" },
        { weight: 205, reps: 11, type: "working" },
        { weight: 205, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h2",
    name: "Full Body",
    date: "2026-04-15",
    durationSec: 3420,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 165, reps: 10, type: "warmup" },
        { weight: 305, reps: 6, type: "working" },
        { weight: 325, reps: 5, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 60, reps: 8, type: "working" },
        { weight: 60, reps: 7, type: "working" },
        { weight: 60, reps: 6, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 60, reps: 10, type: "working" },
        { weight: 60, reps: 9, type: "working" },
        { weight: 60, reps: 8, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 90, reps: 10, type: "warmup" },
        { weight: 160, reps: 6, type: "working" },
        { weight: 170, reps: 5, type: "working" },
        { weight: 180, reps: 4, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 135, reps: 10, type: "working" },
        { weight: 135, reps: 9, type: "working" },
        { weight: 135, reps: 8, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 10, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 12, type: "working" },
        { weight: 0, reps: 11, type: "working" },
        { weight: 0, reps: 9, type: "working" },
      ]},
    ],
  },
  {
    id: "h3",
    name: "Full Body",
    date: "2026-04-13",
    durationSec: 3360,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 130, reps: 10, type: "warmup" },
        { weight: 235, reps: 7, type: "working" },
        { weight: 245, reps: 6, type: "working" },
        { weight: 255, reps: 5, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 95, reps: 10, type: "warmup" },
        { weight: 170, reps: 7, type: "working" },
        { weight: 180, reps: 6, type: "working" },
        { weight: 190, reps: 5, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 150, reps: 9, type: "working" },
        { weight: 160, reps: 8, type: "working" },
        { weight: 170, reps: 7, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 210, reps: 8, type: "working" },
        { weight: 210, reps: 7, type: "working" },
        { weight: 210, reps: 6, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 60, reps: 10, type: "warmup" },
        { weight: 100, reps: 6, type: "working" },
        { weight: 110, reps: 5, type: "working" },
        { weight: 120, reps: 4, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 145, reps: 10, type: "working" },
        { weight: 145, reps: 9, type: "working" },
        { weight: 145, reps: 8, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 205, reps: 12, type: "working" },
        { weight: 205, reps: 11, type: "working" },
        { weight: 205, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h4",
    name: "Full Body",
    date: "2026-04-11",
    durationSec: 3480,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 125, reps: 10, type: "warmup" },
        { weight: 230, reps: 8, type: "working" },
        { weight: 240, reps: 7, type: "working" },
        { weight: 250, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 95, reps: 10, type: "warmup" },
        { weight: 170, reps: 8, type: "working" },
        { weight: 180, reps: 7, type: "working" },
        { weight: 190, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 145, reps: 10, type: "working" },
        { weight: 155, reps: 9, type: "working" },
        { weight: 165, reps: 8, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 35, reps: 10, type: "working" },
        { weight: 35, reps: 10, type: "working" },
        { weight: 35, reps: 8, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 8, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 70, reps: 12, type: "working" },
        { weight: 70, reps: 11, type: "working" },
        { weight: 70, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 200, reps: 12, type: "working" },
        { weight: 200, reps: 11, type: "working" },
        { weight: 200, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h5",
    name: "Full Body",
    date: "2026-04-08",
    durationSec: 3420,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 160, reps: 10, type: "warmup" },
        { weight: 295, reps: 6, type: "working" },
        { weight: 315, reps: 5, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 60, reps: 8, type: "working" },
        { weight: 60, reps: 7, type: "working" },
        { weight: 60, reps: 6, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 60, reps: 10, type: "working" },
        { weight: 60, reps: 9, type: "working" },
        { weight: 60, reps: 8, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 90, reps: 10, type: "warmup" },
        { weight: 155, reps: 7, type: "working" },
        { weight: 165, reps: 6, type: "working" },
        { weight: 175, reps: 5, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 130, reps: 10, type: "working" },
        { weight: 130, reps: 9, type: "working" },
        { weight: 130, reps: 8, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 10, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 12, type: "working" },
        { weight: 0, reps: 11, type: "working" },
        { weight: 0, reps: 9, type: "working" },
      ]},
    ],
  },
  {
    id: "h6",
    name: "Full Body",
    date: "2026-04-06",
    durationSec: 3360,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 125, reps: 10, type: "warmup" },
        { weight: 225, reps: 8, type: "working" },
        { weight: 235, reps: 7, type: "working" },
        { weight: 245, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 95, reps: 10, type: "warmup" },
        { weight: 165, reps: 8, type: "working" },
        { weight: 175, reps: 7, type: "working" },
        { weight: 185, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 145, reps: 10, type: "working" },
        { weight: 155, reps: 9, type: "working" },
        { weight: 165, reps: 8, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 205, reps: 8, type: "working" },
        { weight: 205, reps: 7, type: "working" },
        { weight: 205, reps: 6, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 60, reps: 10, type: "warmup" },
        { weight: 95, reps: 7, type: "working" },
        { weight: 105, reps: 6, type: "working" },
        { weight: 115, reps: 5, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 140, reps: 10, type: "working" },
        { weight: 140, reps: 9, type: "working" },
        { weight: 140, reps: 8, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 200, reps: 12, type: "working" },
        { weight: 200, reps: 11, type: "working" },
        { weight: 200, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h7",
    name: "Full Body",
    date: "2026-04-04",
    durationSec: 2880,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 100, reps: 10, type: "warmup" },
        { weight: 180, reps: 10, type: "working" },
        { weight: 190, reps: 9, type: "working" },
        { weight: 200, reps: 8, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 135, reps: 10, type: "working" },
        { weight: 145, reps: 9, type: "working" },
        { weight: 155, reps: 8, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 70, reps: 10, type: "warmup" },
        { weight: 115, reps: 12, type: "working" },
        { weight: 125, reps: 11, type: "working" },
        { weight: 135, reps: 10, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 12, type: "working" },
        { weight: 30, reps: 12, type: "working" },
        { weight: 30, reps: 10, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 25, reps: 12, type: "working" },
        { weight: 25, reps: 12, type: "working" },
        { weight: 25, reps: 10, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 55, reps: 14, type: "working" },
        { weight: 55, reps: 13, type: "working" },
        { weight: 55, reps: 12, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 165, reps: 14, type: "working" },
        { weight: 165, reps: 13, type: "working" },
        { weight: 165, reps: 12, type: "working" },
      ]},
    ],
  },
  {
    id: "h8",
    name: "Full Body",
    date: "2026-04-01",
    durationSec: 2820,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 130, reps: 10, type: "warmup" },
        { weight: 240, reps: 8, type: "working" },
        { weight: 260, reps: 7, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 45, reps: 10, type: "working" },
        { weight: 45, reps: 9, type: "working" },
        { weight: 45, reps: 8, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 45, reps: 12, type: "working" },
        { weight: 45, reps: 11, type: "working" },
        { weight: 45, reps: 10, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 75, reps: 10, type: "warmup" },
        { weight: 125, reps: 9, type: "working" },
        { weight: 135, reps: 8, type: "working" },
        { weight: 145, reps: 7, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 110, reps: 12, type: "working" },
        { weight: 110, reps: 11, type: "working" },
        { weight: 110, reps: 10, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 14, type: "working" },
        { weight: 15, reps: 14, type: "working" },
        { weight: 15, reps: 12, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 11, type: "working" },
        { weight: 0, reps: 10, type: "working" },
        { weight: 0, reps: 8, type: "working" },
      ]},
    ],
  },
  {
    id: "h9",
    name: "Full Body",
    date: "2026-03-30",
    durationSec: 2760,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 100, reps: 10, type: "warmup" },
        { weight: 180, reps: 10, type: "working" },
        { weight: 190, reps: 9, type: "working" },
        { weight: 200, reps: 8, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 135, reps: 10, type: "working" },
        { weight: 145, reps: 9, type: "working" },
        { weight: 155, reps: 8, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 70, reps: 10, type: "warmup" },
        { weight: 115, reps: 12, type: "working" },
        { weight: 125, reps: 11, type: "working" },
        { weight: 135, reps: 10, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 170, reps: 10, type: "working" },
        { weight: 170, reps: 9, type: "working" },
        { weight: 170, reps: 8, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 50, reps: 10, type: "warmup" },
        { weight: 75, reps: 9, type: "working" },
        { weight: 85, reps: 8, type: "working" },
        { weight: 95, reps: 7, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 120, reps: 12, type: "working" },
        { weight: 120, reps: 11, type: "working" },
        { weight: 120, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 165, reps: 14, type: "working" },
        { weight: 165, reps: 13, type: "working" },
        { weight: 165, reps: 12, type: "working" },
      ]},
    ],
  },
  {
    id: "h10",
    name: "Full Body",
    date: "2026-03-28",
    durationSec: 3480,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 115, reps: 10, type: "warmup" },
        { weight: 205, reps: 8, type: "working" },
        { weight: 215, reps: 7, type: "working" },
        { weight: 225, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 90, reps: 10, type: "warmup" },
        { weight: 155, reps: 8, type: "working" },
        { weight: 165, reps: 7, type: "working" },
        { weight: 175, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 135, reps: 10, type: "working" },
        { weight: 145, reps: 9, type: "working" },
        { weight: 155, reps: 8, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 8, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 8, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 60, reps: 12, type: "working" },
        { weight: 60, reps: 11, type: "working" },
        { weight: 60, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 190, reps: 12, type: "working" },
        { weight: 190, reps: 11, type: "working" },
        { weight: 190, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h11",
    name: "Full Body",
    date: "2026-03-25",
    durationSec: 3420,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 150, reps: 10, type: "warmup" },
        { weight: 275, reps: 6, type: "working" },
        { weight: 285, reps: 4, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 55, reps: 8, type: "working" },
        { weight: 55, reps: 7, type: "working" },
        { weight: 55, reps: 6, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 55, reps: 10, type: "working" },
        { weight: 55, reps: 9, type: "working" },
        { weight: 55, reps: 8, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 145, reps: 7, type: "working" },
        { weight: 155, reps: 6, type: "working" },
        { weight: 160, reps: 4, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 125, reps: 10, type: "working" },
        { weight: 125, reps: 9, type: "working" },
        { weight: 125, reps: 8, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 10, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 11, type: "working" },
        { weight: 0, reps: 10, type: "working" },
        { weight: 0, reps: 8, type: "working" },
      ]},
    ],
  },
  {
    id: "h12",
    name: "Full Body",
    date: "2026-03-23",
    durationSec: 3360,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 115, reps: 10, type: "warmup" },
        { weight: 205, reps: 8, type: "working" },
        { weight: 215, reps: 7, type: "working" },
        { weight: 225, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 90, reps: 10, type: "warmup" },
        { weight: 155, reps: 8, type: "working" },
        { weight: 165, reps: 7, type: "working" },
        { weight: 175, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 135, reps: 10, type: "working" },
        { weight: 145, reps: 9, type: "working" },
        { weight: 155, reps: 8, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 195, reps: 8, type: "working" },
        { weight: 195, reps: 7, type: "working" },
        { weight: 195, reps: 6, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 55, reps: 10, type: "warmup" },
        { weight: 85, reps: 7, type: "working" },
        { weight: 95, reps: 6, type: "working" },
        { weight: 105, reps: 5, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 135, reps: 10, type: "working" },
        { weight: 135, reps: 9, type: "working" },
        { weight: 135, reps: 8, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 190, reps: 12, type: "working" },
        { weight: 190, reps: 11, type: "working" },
        { weight: 190, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h13",
    name: "Full Body",
    date: "2026-03-21",
    durationSec: 3480,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 110, reps: 10, type: "warmup" },
        { weight: 195, reps: 8, type: "working" },
        { weight: 205, reps: 7, type: "working" },
        { weight: 215, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 150, reps: 8, type: "working" },
        { weight: 160, reps: 7, type: "working" },
        { weight: 170, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 75, reps: 10, type: "warmup" },
        { weight: 130, reps: 10, type: "working" },
        { weight: 140, reps: 9, type: "working" },
        { weight: 150, reps: 8, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 8, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 8, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 55, reps: 12, type: "working" },
        { weight: 55, reps: 11, type: "working" },
        { weight: 55, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 185, reps: 12, type: "working" },
        { weight: 185, reps: 11, type: "working" },
        { weight: 185, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h14",
    name: "Full Body",
    date: "2026-03-18",
    durationSec: 3420,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 145, reps: 10, type: "warmup" },
        { weight: 265, reps: 6, type: "working" },
        { weight: 285, reps: 5, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 50, reps: 8, type: "working" },
        { weight: 50, reps: 7, type: "working" },
        { weight: 50, reps: 6, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 50, reps: 10, type: "working" },
        { weight: 50, reps: 9, type: "working" },
        { weight: 50, reps: 8, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 140, reps: 7, type: "working" },
        { weight: 150, reps: 6, type: "working" },
        { weight: 160, reps: 5, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 125, reps: 10, type: "working" },
        { weight: 125, reps: 9, type: "working" },
        { weight: 125, reps: 8, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 10, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 10, type: "working" },
        { weight: 0, reps: 9, type: "working" },
        { weight: 0, reps: 7, type: "working" },
      ]},
    ],
  },
  {
    id: "h15",
    name: "Full Body",
    date: "2026-03-16",
    durationSec: 3360,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 110, reps: 10, type: "warmup" },
        { weight: 195, reps: 8, type: "working" },
        { weight: 205, reps: 7, type: "working" },
        { weight: 215, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 150, reps: 8, type: "working" },
        { weight: 160, reps: 7, type: "working" },
        { weight: 170, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 75, reps: 10, type: "warmup" },
        { weight: 130, reps: 10, type: "working" },
        { weight: 140, reps: 9, type: "working" },
        { weight: 150, reps: 8, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 190, reps: 8, type: "working" },
        { weight: 190, reps: 7, type: "working" },
        { weight: 190, reps: 6, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 50, reps: 10, type: "warmup" },
        { weight: 80, reps: 7, type: "working" },
        { weight: 90, reps: 6, type: "working" },
        { weight: 100, reps: 5, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 135, reps: 10, type: "working" },
        { weight: 135, reps: 9, type: "working" },
        { weight: 135, reps: 8, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 185, reps: 12, type: "working" },
        { weight: 185, reps: 11, type: "working" },
        { weight: 185, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h16",
    name: "Full Body",
    date: "2026-03-14",
    durationSec: 3360,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 105, reps: 10, type: "warmup" },
        { weight: 185, reps: 8, type: "working" },
        { weight: 195, reps: 7, type: "working" },
        { weight: 205, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 145, reps: 8, type: "working" },
        { weight: 155, reps: 7, type: "working" },
        { weight: 165, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 75, reps: 10, type: "warmup" },
        { weight: 125, reps: 10, type: "working" },
        { weight: 135, reps: 9, type: "working" },
        { weight: 145, reps: 8, type: "working" },
      ]},
      { name: "Bulgarian Split Squat", variantLabel: "Dumbbells", sets: [
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 10, type: "working" },
        { weight: 30, reps: 8, type: "working" },
      ]},
      { name: "Bicep Curl", variantLabel: "Dumbbells", sets: [
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 10, type: "working" },
        { weight: 25, reps: 8, type: "working" },
      ]},
      { name: "Tricep Pushdown", variantLabel: "Cable (High Pulley)", sets: [
        { weight: 50, reps: 12, type: "working" },
        { weight: 50, reps: 11, type: "working" },
        { weight: 50, reps: 10, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 180, reps: 12, type: "working" },
        { weight: 180, reps: 11, type: "working" },
        { weight: 180, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h17",
    name: "Full Body",
    date: "2026-03-11",
    durationSec: 3300,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 140, reps: 10, type: "warmup" },
        { weight: 255, reps: 6, type: "working" },
        { weight: 275, reps: 5, type: "working" },
      ]},
      { name: "Incline Bench Press", variantLabel: "Dumbbells", sets: [
        { weight: 50, reps: 8, type: "working" },
        { weight: 50, reps: 7, type: "working" },
        { weight: 50, reps: 6, type: "working" },
      ]},
      { name: "Incline Row", variantLabel: "Dumbbells", sets: [
        { weight: 50, reps: 10, type: "working" },
        { weight: 50, reps: 9, type: "working" },
        { weight: 50, reps: 8, type: "working" },
      ]},
      { name: "Front Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 80, reps: 10, type: "warmup" },
        { weight: 135, reps: 7, type: "working" },
        { weight: 145, reps: 6, type: "working" },
        { weight: 155, reps: 5, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 120, reps: 10, type: "working" },
        { weight: 120, reps: 9, type: "working" },
        { weight: 120, reps: 8, type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 10, type: "working" },
      ]},
      { name: "Hanging Leg Raise", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 10, type: "working" },
        { weight: 0, reps: 9, type: "working" },
        { weight: 0, reps: 7, type: "working" },
      ]},
    ],
  },
  {
    id: "h18",
    name: "Full Body",
    date: "2026-03-09",
    durationSec: 3240,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 105, reps: 10, type: "warmup" },
        { weight: 185, reps: 8, type: "working" },
        { weight: 195, reps: 7, type: "working" },
        { weight: 205, reps: 6, type: "working" },
      ]},
      { name: "Bench Press", variantLabel: "Barbell", sets: [
        { weight: 85, reps: 10, type: "warmup" },
        { weight: 145, reps: 8, type: "working" },
        { weight: 155, reps: 7, type: "working" },
        { weight: 165, reps: 6, type: "working" },
      ]},
      { name: "Bent-Over Row", variantLabel: "Barbell", sets: [
        { weight: 75, reps: 10, type: "warmup" },
        { weight: 125, reps: 10, type: "working" },
        { weight: 135, reps: 9, type: "working" },
        { weight: 145, reps: 8, type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 185, reps: 8, type: "working" },
        { weight: 185, reps: 7, type: "working" },
        { weight: 185, reps: 6, type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 50, reps: 10, type: "warmup" },
        { weight: 75, reps: 7, type: "working" },
        { weight: 85, reps: 6, type: "working" },
        { weight: 95, reps: 5, type: "working" },
      ]},
      { name: "Lat Pulldown", variantLabel: "Cable Lat Pulldown", sets: [
        { weight: 130, reps: 10, type: "working" },
        { weight: 130, reps: 9, type: "working" },
        { weight: 130, reps: 8, type: "working" },
      ]},
      { name: "Standing Calf Raise", variantLabel: "Standing Calf Raise Machine", sets: [
        { weight: 180, reps: 12, type: "working" },
        { weight: 180, reps: 11, type: "working" },
        { weight: 180, reps: 10, type: "working" },
      ]},
    ],
  },
];

/* ── Coach's File mock seed data (Bible §6.5, v26) ────────────────
   The Coach's File landing surfaces four kinds of data that don't yet
   exist anywhere else in the app: rules the user has set via Coach,
   observations Coach has authored from training patterns, PRs Coach
   has tracked, and body stats. Until the Coach LLM is wired up these
   come from the seed below, which exactly matches the locked HTML
   reference from Session 35 so what Tyler sees in the prototype
   matches what was designed.

   Schema:
   - rule: { id, text, createdAt (epoch ms) }
   - observation: { id, text, createdAt (epoch ms) }
   - progressPR: { id, exerciseName, value (display string), isPR, isNew, achievedAt (epoch ms) }
   - bodyStats: { heightIn (number), weightLb (number), ageYears (number), gender ("M"|"F"|"X") }

   All createdAt / achievedAt values are computed at module load relative
   to "now" so they read as "12D", "22D", etc. on first run. The signed-
   footer "updated 2d ago" is the most recent of any of these timestamps.
*/
const NOW_FOR_SEED = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const MOCK_COACH_RULES = [
  { id: "r1", text: "No deadlifts on Mondays", createdAt: NOW_FOR_SEED - 12 * DAY },
  { id: "r2", text: "Keep sessions under 60 minutes", createdAt: NOW_FOR_SEED - 22 * DAY },
  { id: "r3", text: "Always start with a compound lift", createdAt: NOW_FOR_SEED - 30 * DAY },
  { id: "r4", text: "Prefer dumbbells over barbells for chest", createdAt: NOW_FOR_SEED - 35 * DAY },
];

const MOCK_COACH_OBSERVATIONS = [
  { id: "o1", text: "Tests heavy on isolation sets, settles 10-15% lower", createdAt: NOW_FOR_SEED - 3 * DAY },
  { id: "o2", text: "Pyramid pattern on plate-loaded compounds", createdAt: NOW_FOR_SEED - 5 * DAY },
  { id: "o3", text: "Often 5+ min between sets on heavy compounds", createdAt: NOW_FOR_SEED - 7 * DAY },
  { id: "o4", text: "Prefers free weights over machines for upper body", createdAt: NOW_FOR_SEED - 9 * DAY },
  { id: "o5", text: "Skips warm-up sets on Leg Day primaries", createdAt: NOW_FOR_SEED - 12 * DAY },
  { id: "o6", text: "Tends to schedule Push days for Mondays", createdAt: NOW_FOR_SEED - 15 * DAY },
  { id: "o7", text: "Cuts sessions short when over 50 minutes", createdAt: NOW_FOR_SEED - 18 * DAY },
];

const MOCK_PROGRESS_PRS = [
  // THIS WEEK
  { id: "p1", exerciseName: "Squat", value: "225 × 5", isPR: true, isNew: false, achievedAt: NOW_FOR_SEED - 2 * DAY },
  { id: "p2", exerciseName: "RDL", value: "225 × 8", isPR: false, isNew: true, achievedAt: NOW_FOR_SEED - 4 * DAY },
  { id: "p3", exerciseName: "Bench Press", value: "205 × 8", isPR: false, isNew: false, achievedAt: NOW_FOR_SEED - 5 * DAY },
  // EARLIER THIS MONTH
  { id: "p4", exerciseName: "Bent Row", value: "205 × 8", isPR: false, isNew: false, achievedAt: NOW_FOR_SEED - 12 * DAY },
  { id: "p5", exerciseName: "Hip Thrust", value: "450 × 8", isPR: true, isNew: false, achievedAt: NOW_FOR_SEED - 14 * DAY },
  // LAST MONTH
  { id: "p6", exerciseName: "Squat", value: "215 × 5", isPR: false, isNew: false, achievedAt: NOW_FOR_SEED - 40 * DAY },
  { id: "p7", exerciseName: "Leg Press", value: "630 × 8", isPR: false, isNew: false, achievedAt: NOW_FOR_SEED - 42 * DAY },
  { id: "p8", exerciseName: "Bulgarian Split Squat", value: "155 × 8", isPR: false, isNew: true, achievedAt: NOW_FOR_SEED - 45 * DAY },
];

const MOCK_BODY_STATS = { heightIn: 70, weightLb: 178, ageYears: 28, gender: "M" };

/* Auto-naming logic per spec: derived from primary muscle groups of
   exercises in the session. Empty session → date + time-of-day fallback.

   Naming heuristic:
   - 0 exercises → "Apr 9 · Morning" (or Afternoon/Evening)
   - 1 group → "<Group> Day" (e.g. "Leg Day", "Back Day")
   - 2 groups → "<G1> & <G2>" (e.g. "Chest & Back")
   - 3+ groups → "Full Body"
   Push/Pull are not auto-detected — those are programming concepts the
   user can name manually if they prefer. */
function deriveWorkoutName(exercises, fallbackDate = new Date()) {
  if (exercises.length === 0) {
    const month = fallbackDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const hr = fallbackDate.getHours();
    const tod = hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening";
    return `${month} · ${tod}`;
  }
  const groups = [...new Set(exercises.map((e) => e.primary))];
  if (groups.length === 1) return `${groups[0]} Day`;
  if (groups.length === 2) return `${groups[0]} & ${groups[1]}`;
  return "Full Body";
}

/* Format seconds as mm:ss or h:mm:ss for the live workout timer. */
function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* Total volume for a list of sets. Bodyweight (weight=0) contributes 0. */
function totalVolumeFromExercises(exercises) {
  let v = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.done !== false) v += (s.weight || 0) * (s.reps || 0);
    }
  }
  return v;
}

/* WorkoutTab is now a thin shell. The active workout state lives in App
   so it survives tab switches. WorkoutTab decides what to render based on
   that state: idle (no workout), active logger (workout exists and not
   minimized), or finish summary. When the workout is minimized, the tab
   shows the idle view — the active workout is reachable via the SessionBar
   that floats above the TabBar globally. */
function WorkoutTab({
  userEquipment, workout, minimized, history, openHistoryId, setOpenHistoryId,
  finishedSession, customExercises = [],
  restTimerMode, restCountdownTarget, onChangeRestTimerMode, onChangeRestCountdownTarget,
  onStartEmpty, onUpdateWorkout, onMinimize, onCancel, onFinish,
  onCommitFinished, onDiscardFinished,
  onRepeatWorkout, onTabChange,
}) {

  // Finish summary screen takes priority — once user taps Finish, that's
  // a deliberate action and we want to show the payoff before anything else.
  if (finishedSession) {
    return (
      <FinishSummaryScreen
        session={finishedSession}
        onDone={onCommitFinished}
        onDiscard={onDiscardFinished}
      />
    );
  }

  // ── Layered Workout tab (Bible §14, step 3) ──
  // Idle view (CTA + history list) is ALWAYS rendered as the base layer.
  // ActiveLogger renders as a bottom-sheet overlay on top when there's
  // an active workout that isn't minimized. As the user drags the sheet
  // down, the idle view becomes visible behind it — matching Strong's
  // model where you can see the underlying tab as the sheet slides away.
  //
  // The CTA's "No active workout" messaging is hidden when a workout is
  // active (the messaging would be wrong), but the Start Empty button
  // stays visible so it can be tapped after minimizing — that triggers
  // the conflict modal from step 2.
  // Ref on the outer container — passed down to ActiveLogger so its drag
  // math can measure the actual rendered height and compute MAX_SHEET_TOP
  // exactly. Hardcoded constants were a few px off (TabBar/PhoneFrame
  // metrics are font-dependent), causing the sheet to overshoot its
  // resting position during drag.
  const containerRef = useRef(null);

  return (
    <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      <div style={{ flex: 1, padding: "8px 24px 20px", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 12px", fontWeight: 400 }}>Workout</h2>

        {/* CTA section — messaging only when no workout. Buttons always
            visible per Bible §14 working-style decision (so user can
            tap Start Empty after minimizing → conflict modal). */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, paddingBottom: 12 }}>
          {!workout && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: COLORS.card, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="1.8"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
              </div>
              <p style={{ color: COLORS.text, fontSize: 17, fontWeight: 500, margin: "0 0 4px" }}>No active workout</p>
              <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: "0 0 22px", textAlign: "center" }}>Start an empty session or ask Coach to build one</p>
            </>
          )}
          <GoldButton onClick={onStartEmpty} style={{ width: "auto", padding: "14px 36px", fontSize: 15 }}>Start Empty Workout</GoldButton>
          <button
            /* Coach CTA — wired to nothing for now; will route to Coach
               tab when that's threaded through. */
            style={{
              marginTop: 14, padding: "10px 20px", background: "transparent",
              border: `1px solid ${COLORS.border}`, borderRadius: 22,
              color: COLORS.textSecondary, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
            Ask Coach to build one
          </button>
        </div>

        {/* History list — full-detail cards per spec */}
        <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "32px 0 10px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>History</p>
        {history.map((w) => {
          const volume = totalVolumeFromExercises(w.exercises);
          return (
            <button
              key={w.id}
              onClick={() => setOpenHistoryId(w.id)}
              style={{
                width: "100%", textAlign: "left",
                background: COLORS.card, borderRadius: 10, padding: "14px 16px",
                marginBottom: 10, border: `1px solid ${COLORS.border}`, cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: COLORS.text, fontSize: 15, fontWeight: 600 }}>{w.name}</span>
                <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{formatShortDate(w.date)}</span>
              </div>
              <div style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(w.durationSec / 60)} min · {volume.toLocaleString()} lbs
              </div>
              {/* Per-exercise rows: name (variant), sets count, max set */}
              {w.exercises.map((ex, i) => {
                const working = ex.sets.filter((s) => s.type !== "warmup");
                const top = sessionTopSet(working.length > 0 ? working : ex.sets);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                    <span style={{ color: COLORS.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ex.name} <span style={{ color: COLORS.textSecondary }}>({ex.variantLabel})</span>
                    </span>
                    <span style={{ color: COLORS.textSecondary, marginLeft: 8, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {ex.sets.length} sets · Max: {formatSetSummary(top)}
                    </span>
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>

      {/* History recap bottom sheet — rendered at the outer (non-scrolling)
          level so it always anchors to the tab viewport bottom. Backdrop
          covers the full tab and blocks interaction with the scroll list
          behind. */}
      {openHistoryId && (
        <HistoryRecapSheet
          session={history.find((w) => w.id === openHistoryId)}
          onClose={() => setOpenHistoryId(null)}
          onRepeat={onRepeatWorkout}
        />
      )}

      {/* ── Active Logger overlay (bottom sheet) ──
          When a workout is active and not minimized, ActiveLogger renders
          as an absolute-positioned overlay on top of the idle view above.
          Drag-down on the sheet's drag handle slides the sheet downward,
          revealing the idle view behind it (matches Strong's model).
          When fully docked, only the sheet's header strip remains visible
          above the TabBar — at that moment the state flips to minimized,
          ActiveLogger unmounts, and the real SessionBar mounts in the same
          position (invisible swap). */}
      {workout && !minimized && (
        <ActiveLogger
          workout={workout}
          onUpdateWorkout={onUpdateWorkout}
          userEquipment={userEquipment}
          customExercises={customExercises}
          workoutHistory={history}
          restTimerMode={restTimerMode}
          restCountdownTarget={restCountdownTarget}
          onChangeRestTimerMode={onChangeRestTimerMode}
          onChangeRestCountdownTarget={onChangeRestCountdownTarget}
          onMinimize={onMinimize}
          onCancel={onCancel}
          onFinish={onFinish}
          onTabChange={onTabChange}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}

/* ── Active Logger ────────────────────────────────────────────────
   The execution surface. Sticky header (name + live timer + finish),
   scrollable list of exercise cards, floating + Add Exercise button.
   Owns: live timer interval, set type popover, rest timer mode menu,
   Add Exercise picker visibility, swipe-action state per exercise.
*/
function ActiveLogger({
  workout, onUpdateWorkout, userEquipment, customExercises = [], workoutHistory = [], onMinimize, onCancel, onFinish,
  onTabChange,
  restTimerMode, restCountdownTarget, onChangeRestTimerMode, onChangeRestCountdownTarget,
  containerRef,
}) {
  // Pull session state out of the workout prop. We mutate via onUpdateWorkout
  // (which writes through to App-level state, so it survives tab switches).
  // restTimerMode and restCountdownTarget are App-level prefs (props), not
  // workout-level state — they persist across workouts.
  const { exercises, workoutName, startTime, restTimer } = workout;

  // Helper that hands a transformed exercises array back to the parent.
  // When given an updater function, we resolve it against the current ref
  // value (set further down) so successive calls within the same tick
  // (e.g. rapid-tick on +/-) compose correctly instead of restarting from
  // a stale closure-captured value.
  const exercisesRef = useRef(exercises);
  const setExercises = (updater) => {
    const base = exercisesRef.current;
    const next = typeof updater === "function" ? updater(base) : updater;
    exercisesRef.current = next; // keep ref in sync immediately for the next call
    onUpdateWorkout({ exercises: next });
  };
  const setWorkoutName = (n) => onUpdateWorkout({ workoutName: n, nameWasEdited: true });
  const setRestTimerMode = (m) => onChangeRestTimerMode(m);
  const setRestCountdownTarget = (s) => onChangeRestCountdownTarget(s);

  const [elapsed, setElapsed] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  // Two-level menu: "main" shows the top-level options (Count up / Countdown / Off /
  // Cancel). "countdownDuration" shows the duration submenu (preset durations + Custom).
  // Reset to "main" whenever the menu closes so re-opens always start at the top.
  const [settingsMenuView, setSettingsMenuView] = useState("main");
  // Custom-duration modal state. customDurationOpen controls visibility; the m/s
  // values are local string state so the user can edit either field freely.
  const [customDurationOpen, setCustomDurationOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // D-019: which exercise's alternatives sheet is open. The uid of the
  // exercise whose row was swiped, or null when no sheet is open.
  const [alternativesFor, setAlternativesFor] = useState(null);
  // When the user opens AddExerciseSheet via the empty-state "Browse
  // Exercises" CTA, we're in swap mode — picking an exercise replaces the
  // target, doesn't append. uid of the swap target, or null for normal add.
  const [pickerSwapTargetUid, setPickerSwapTargetUid] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rirHelpOpen, setRirHelpOpen] = useState(false);

  // Drag-to-minimize: track pointer Y delta on the drag handle.
  // When released past a threshold, triggers onMinimize.
  const [dragY, setDragY] = useState(0);
  const dragMinRef = useRef({ startY: 0, dragging: false });

  // Set type popover: { exerciseUid, setIndex } or null
  const [typePopover, setTypePopover] = useState(null);

  // Variant chip popover: which exercise's variant menu is open
  const [variantMenuFor, setVariantMenuFor] = useState(null);

  // Numeric keypad active field: { exerciseUid, setIdx, field: "weight"|"reps" } | null
  const [activeField, setActiveField] = useState(null);

  // Caret position within the active field. -1 means "all selected" (the
  // default state when a field is first focused — the next digit replaces
  // the entire value). 0..N is a real caret position; digits insert at
  // that index. The user transitions from -1 to a real position by
  // dragging their finger inside the active field button.
  const [caretPos, setCaretPos] = useState(-1);

  // When a field is first focused, the existing value should be "selected"
  // (gold highlight). The first digit press replaces the value entirely;
  // subsequent digits append. This ref tracks whether we're in that
  // "just tapped in" state.
  const freshFocusRef = useRef(false);
  useEffect(() => {
    freshFocusRef.current = true;
    setCaretPos(-1); // reset to "all selected" whenever focus changes
  }, [activeField]);

  // Refs for auto-scrolling the active set into view when keypad opens
  const scrollRef = useRef(null);
  const setRowRefs = useRef({}); // key: `${uid}_${setIdx}` → DOM node

  // Keep exercisesRef synced when state comes back from the parent
  // (e.g. after onUpdateWorkout commits and React re-renders).
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);

  // ── Reorder drag state ────────────────────────────────────────
  // When a card is being long-press-dragged for reorder, this object holds
  // the live drag info. null when no drag is in progress.
  //   uid         — which card is being dragged (stable across renders)
  //   originIdx   — its index when the drag started
  //   pointerY    — current pointer Y in viewport coords
  //   startY      — pointer Y when drag started; used to compute translate
  //   cardHeight  — measured height of dragged card (siblings shift by this)
  //   cardRect    — original bounding rect of dragged card (top is fixed
  //                 in viewport space; translate offset = pointerY - startY)
  // Live reflow is computed in ExerciseCard from this prop — siblings shift
  // when the dragged card's center crosses their midpoint. The actual array
  // mutation happens once on drop, in onReorderEnd.
  const [reorderDrag, setReorderDrag] = useState(null);
  const reorderDragRef = useRef(null);
  useEffect(() => { reorderDragRef.current = reorderDrag; }, [reorderDrag]);

  // Auto-scroll the list when the dragged card is near the top or bottom.
  // Active only during a drag; tick at ~30fps via rAF.
  const autoScrollRafRef = useRef(null);
  useEffect(() => {
    if (!reorderDrag) {
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
      return;
    }
    const tick = () => {
      const drag = reorderDragRef.current;
      const scroller = scrollRef.current;
      if (!drag || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      const EDGE = 60; // px from edge that triggers auto-scroll
      const SPEED = 8; // px per frame
      let dy = 0;
      if (drag.pointerY < rect.top + EDGE) dy = -SPEED;
      else if (drag.pointerY > rect.bottom - EDGE) dy = SPEED;
      if (dy !== 0) scroller.scrollTop += dy;
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, [reorderDrag]);

  // Compute the index the dragged card would land at given current pointerY.
  // Uses the baseline rects snapshotted at drag start (siblingRects), so
  // computation stays stable even as siblings visually shift during reflow.
  const computeTargetIdx = (drag) => {
    if (!drag || !drag.siblingRects) return drag ? drag.originIdx : -1;
    const draggedCenterY = drag.cardRect.top + (drag.pointerY - drag.startY) + drag.cardHeight / 2;
    // Walk baseline rects (already in DOM order, dragged card excluded).
    // Each entry: { uid, top, height, idx }. We find the slot the dragged
    // card's center falls into. With N siblings there are N+1 possible
    // landing slots (before each sibling, plus after the last).
    let target = drag.originIdx;
    for (let i = 0; i < drag.siblingRects.length; i += 1) {
      const r = drag.siblingRects[i];
      if (draggedCenterY < r.top + r.height / 2) {
        // Land just before this sibling. Sibling's array index is r.idx;
        // because we excluded the dragged card from siblingRects, target
        // index in the post-removal array is just r.idx adjusted for
        // whether the dragged card was originally above or below this
        // sibling.
        target = r.idx > drag.originIdx ? r.idx - 1 : r.idx;
        return target;
      }
    }
    // Past every sibling — land at end.
    return exercisesRef.current.length - 1;
  };

  const onReorderStart = (uid, originIdx, pointerY, cardEl) => {
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    // Snapshot every sibling's baseline rect so reflow math is stable
    // even after siblings start visually shifting.
    const scroller = scrollRef.current;
    const siblingRects = [];
    if (scroller) {
      const allCards = scroller.querySelectorAll("[data-exercise-card]");
      allCards.forEach((card, i) => {
        const cardUid = card.getAttribute("data-exercise-card");
        if (cardUid === uid) return;
        const r = card.getBoundingClientRect();
        siblingRects.push({ uid: cardUid, top: r.top, height: r.height, idx: i });
      });
    }
    setReorderDrag({
      uid,
      originIdx,
      pointerY,
      startY: pointerY,
      cardHeight: rect.height,
      cardRect: { top: rect.top, left: rect.left, width: rect.width },
      siblingRects,
    });
  };
  const onReorderMove = (pointerY) => {
    setReorderDrag((prev) => (prev ? { ...prev, pointerY } : prev));
  };
  const onReorderEnd = () => {
    const drag = reorderDragRef.current;
    if (!drag) return;
    const targetIdx = computeTargetIdx(drag);
    if (targetIdx !== drag.originIdx) {
      reorderExercise(drag.originIdx, targetIdx);
    }
    setReorderDrag(null);
  };

  // Live timer — ticks once per second while logger is mounted
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // When the active field changes, scroll its row to a comfortable position
  // above the keypad. We can't use scrollIntoView({ block: "center" }) here
  // because "center" centers the row in the FULL scroll container — but the
  // keypad occludes the bottom ~280px of that container, so a centered row
  // can still end up partially under the keypad on shorter content lists.
  // Manual math: compute the visible area above the keypad and place the row's
  // top at ~30% of that area (Strong-style comfortable position — clearly above
  // the keypad, plenty of breathing room above to confirm context). The
  // paddingBottom on the scroll container is 280px to match the keypad.
  useEffect(() => {
    if (!activeField) return;
    const key = `${activeField.exerciseUid}_${activeField.setIdx}`;
    const node = setRowRefs.current[key];
    const scroller = scrollRef.current;
    if (!node || !scroller) return;
    // Small timeout so React has committed any layout changes first
    // (e.g. paddingBottom: 280 transition just kicked in).
    setTimeout(() => {
      const KEYPAD_ZONE = 260; // ~keypad height + small gap
      const COMFORT_RATIO = 0.3; // row top sits at 30% of visible-above-keypad
      const visibleAbove = scroller.clientHeight - KEYPAD_ZONE;
      // Row's current top relative to the scroll container.
      const nodeTop = node.offsetTop - scroller.offsetTop;
      // Target scrollTop puts the row's top at COMFORT_RATIO of the visible area.
      const target = nodeTop - visibleAbove * COMFORT_RATIO;
      const clamped = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
      scroller.scrollTo({ top: clamped, behavior: "smooth" });
    }, 30);
  }, [activeField]);

  // ── Single global rest timer ──
  // Lives on the workout object itself (App-level state) so it survives
  // tab switches, minimizing, and ActiveLogger unmounts. The SessionBar
  // also reads restTimer from the workout to display it inline when the
  // logger isn't on screen.
  const startRestTimer = (exerciseUid, setIdx) => {
    if (restTimerMode === "off") return;
    onUpdateWorkout({ restTimer: { exerciseUid, setIdx, startTs: Date.now() } });
  };
  const clearRestTimer = () => onUpdateWorkout({ restTimer: null });

  // ── Exercise mutators ──

  // Build a fresh in-workout exercise object. Same first-set placeholder
  // logic shared by addExercise and swapExercise so the swap path doesn't
  // drift from the add path's behavior. New uid every time so activeField,
  // restTimer, and reorderDrag (all uid-keyed) cleanly detach from any
  // prior incarnation.
  const buildExerciseEntry = (libraryEx, variant) => {
    const hist = getVariantHistory(libraryEx.id, variantKey(variant), workoutHistory, customExercises);
    const lastSession = hist[hist.length - 1];
    const prevFirstSet = lastSession && lastSession.sets[0];
    const hasPrev = prevFirstSet != null;
    return {
      uid: `e${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      exerciseId: libraryEx.id,
      name: libraryEx.name,
      primary: libraryEx.primary,
      variant,
      sets: [
        {
          weight: "", reps: "", done: false, type: "working", rir: null,
          weightIsPlaceholder: hasPrev,
          repsIsPlaceholder: hasPrev,
          placeholderWeight: hasPrev ? prevFirstSet.weight : "",
          placeholderReps: hasPrev ? prevFirstSet.reps : "",
        },
      ],
      collapsed: false,
    };
  };

  const addExercise = (libraryEx, variant) => {
    // If the picker was opened from the alternatives empty-state's
    // "Browse Exercises" CTA, picking an exercise SWAPS the target
    // instead of appending. Detect via pickerSwapTargetUid.
    if (pickerSwapTargetUid) {
      swapExercise(pickerSwapTargetUid, libraryEx, variant);
      setPickerSwapTargetUid(null);
      setPickerOpen(false);
      return;
    }
    setExercises((prev) => [...prev, buildExerciseEntry(libraryEx, variant)]);
    setPickerOpen(false);
  };

  // D-019: replace the exercise at `uid` with a fresh entry built from
  // libraryEx + variant. Order preserved. Sets reset (a different exercise
  // means the prior sets are no longer meaningful — same shape as the
  // add path). Cleans up any uid-keyed state that referenced the old row.
  const swapExercise = (uid, libraryEx, variant) => {
    setExercises((prev) => {
      const idx = prev.findIndex((e) => e.uid === uid);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = buildExerciseEntry(libraryEx, variant);
      return next;
    });
    if (restTimer && restTimer.exerciseUid === uid) clearRestTimer();
    if (activeField && activeField.exerciseUid === uid) setActiveField(null);
  };

  const removeExercise = (uid) => {
    setExercises((prev) => prev.filter((e) => e.uid !== uid));
    if (restTimer && restTimer.exerciseUid === uid) clearRestTimer();
  };

  // Move the exercise at `fromIdx` to `toIdx` in the active workout list.
  // No-op if either index is out of range or fromIdx === toIdx. Set state,
  // rest timer, and active field are all uid-keyed and pass through unchanged.
  const reorderExercise = (fromIdx, toIdx) => {
    setExercises((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      if (fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const toggleExerciseCollapsed = (uid) => {
    setExercises((prev) => prev.map((ex) => (
      ex.uid === uid ? { ...ex, collapsed: !ex.collapsed } : ex
    )));
  };

  const updateSet = (uid, setIdx, patch) => {
    setExercises((prev) => prev.map((ex) => {
      if (ex.uid !== uid) return ex;
      const sets = ex.sets.map((s, i) => {
        if (i !== setIdx) return s;
        const next = { ...s, ...patch };
        // When a value is typed into a field, that field's placeholder
        // flag clears. The OTHER field's flag stays — placeholders are
        // independent per field now.
        //
        // Exception: if the patch CLEARS the field (sets it to "") AND
        // we have a stored placeholder value to restore, flip the flag
        // back on. This means "delete everything" reverts the field to
        // its suggested-value state rather than going truly blank, which
        // matches user expectation and also prevents empty-string content
        // from collapsing the input's height.
        //
        // Callers can force a specific flag value by including it in
        // the patch explicitly (the focus handler uses this to clear
        // the placeholder on tap regardless of what's there).
        if ("weight" in patch && !("weightIsPlaceholder" in patch)) {
          const cleared = patch.weight === "" || patch.weight == null;
          if (cleared && next.placeholderWeight !== "" && next.placeholderWeight != null) {
            next.weightIsPlaceholder = true;
          } else {
            next.weightIsPlaceholder = false;
          }
        }
        if ("reps" in patch && !("repsIsPlaceholder" in patch)) {
          const cleared = patch.reps === "" || patch.reps == null;
          if (cleared && next.placeholderReps !== "" && next.placeholderReps != null) {
            next.repsIsPlaceholder = true;
          } else {
            next.repsIsPlaceholder = false;
          }
        }
        return next;
      });

      // Propagation: when set N's weight or reps is changed, walk
      // forward through sets below N. For any set whose corresponding
      // field is still a placeholder, update that field's placeholder
      // value to the new value from set N. Per-field, so weight and
      // reps propagate independently. Touched cells are skipped.
      if ("weight" in patch || "reps" in patch) {
        const newWeight = patch.weight;
        const newReps = patch.reps;
        for (let i = setIdx + 1; i < sets.length; i++) {
          const s = sets[i];
          const updated = { ...s };
          let changed = false;
          if ("weight" in patch && newWeight !== "" && newWeight != null && s.weightIsPlaceholder) {
            updated.placeholderWeight = newWeight;
            changed = true;
          }
          if ("reps" in patch && newReps !== "" && newReps != null && s.repsIsPlaceholder) {
            updated.placeholderReps = newReps;
            changed = true;
          }
          if (changed) sets[i] = updated;
        }
      }

      return { ...ex, sets };
    }));
  };

  const removeSet = (uid, setIdx) => {
    setExercises((prev) => prev.map((ex) => {
      if (ex.uid !== uid) return ex;
      // When removing a set, the previous set's `restAfterSec` (if any)
      // was recorded by the now-deleted set being checked off. That label
      // is now stale, so clear it.
      const sets = ex.sets
        .map((s, i) => (i === setIdx - 1 ? { ...s, restAfterSec: undefined } : s))
        .filter((_, i) => i !== setIdx);
      return { ...ex, sets };
    }));
    if (restTimer && restTimer.exerciseUid === uid) clearRestTimer();
    if (activeField && activeField.exerciseUid === uid && activeField.setIdx === setIdx) {
      setActiveField(null);
    }
  };

  // Called when a set is checked off (or unchecked). Owns the rest timer
  // promotion logic: if this is the first check after a previous timer
  // was running, record the elapsed seconds onto the previously-anchored
  // set as `restAfterSec` so the static "rested X:XX" label can render.
  const toggleSetDone = (uid, setIdx) => {
    const ex = exercisesRef.current.find((e) => e.uid === uid);
    if (!ex) return;
    const set = ex.sets[setIdx];
    const nextDone = !set.done;

    // Build the patch. If the set has placeholder fields being checked
    // off, commit each placeholder to its real field. Per-field, so
    // partially-edited sets still commit the untouched field's placeholder.
    const patch = { done: nextDone };
    if (nextDone) {
      if (set.weightIsPlaceholder && set.placeholderWeight !== "" && set.placeholderWeight != null) {
        patch.weight = set.placeholderWeight;
      }
      if (set.repsIsPlaceholder && set.placeholderReps !== "" && set.placeholderReps != null) {
        patch.reps = set.placeholderReps;
      }
      // After commit, no field is a placeholder anymore
      patch.weightIsPlaceholder = false;
      patch.repsIsPlaceholder = false;
    }

    // If a rest timer is currently running and we're checking a different
    // set, record its elapsed time onto the previously-anchored set.
    if (nextDone && restTimer) {
      const restingSetUid = restTimer.exerciseUid;
      const restingSetIdx = restTimer.setIdx;
      const elapsed = Math.floor((Date.now() - restTimer.startTs) / 1000);
      // Apply the rest record to the source set
      setExercises((prev) => prev.map((e) => {
        if (e.uid !== restingSetUid) return e;
        const sets = e.sets.map((s, i) => (
          i === restingSetIdx ? { ...s, restAfterSec: elapsed } : s
        ));
        return { ...e, sets };
      }));
    }

    updateSet(uid, setIdx, patch);

    if (nextDone) {
      // Start a new rest timer anchored to this set
      startRestTimer(uid, setIdx);
    } else {
      // Unchecking a set clears any rest timer that was anchored to it
      if (restTimer && restTimer.exerciseUid === uid && restTimer.setIdx === setIdx) {
        clearRestTimer();
      }
    }
  };

  const addSet = (uid) => {
    setExercises((prev) => prev.map((ex) => {
      if (ex.uid !== uid) return ex;
      // Pre-fill new set as a placeholder. Priority order:
      //   1. Most recent set in this session that has a real weight/reps
      //      value (touched or completed) — that's what the user is
      //      currently working at
      //   2. Previous workout's set at this index (if available)
      //   3. Previous workout's last set
      //   4. No placeholder
      const newIdx = ex.sets.length;
      let phWeight = "";
      let phReps = "";
      let hasPlaceholder = false;

      // Walk backwards through current session looking for last real values
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        const s = ex.sets[i];
        if (s.type === "warmup") continue;
        if (s.weight !== "" && s.weight != null) {
          phWeight = s.weight;
          hasPlaceholder = true;
        }
        if (s.reps !== "" && s.reps != null) {
          phReps = s.reps;
          hasPlaceholder = true;
        }
        if (hasPlaceholder) break;
        // Also check existing placeholder values from sets above
        if (s.weightIsPlaceholder && s.placeholderWeight !== "" && s.placeholderWeight != null) {
          phWeight = s.placeholderWeight;
          hasPlaceholder = true;
        }
        if (s.repsIsPlaceholder && s.placeholderReps !== "" && s.placeholderReps != null) {
          phReps = s.placeholderReps;
          hasPlaceholder = true;
        }
        if (hasPlaceholder) break;
      }

      // Fall back to prev workout if no current-session values exist
      if (!hasPlaceholder) {
        const hist = getVariantHistory(ex.exerciseId, variantKey(ex.variant), workoutHistory, customExercises);
        const lastSession = hist[hist.length - 1];
        if (lastSession) {
          const prevSet = lastSession.sets[Math.min(newIdx, lastSession.sets.length - 1)];
          if (prevSet) {
            phWeight = prevSet.weight;
            phReps = prevSet.reps;
            hasPlaceholder = true;
          }
        }
      }

      return {
        ...ex,
        sets: [...ex.sets, {
          weight: "", reps: "", done: false, type: "working", rir: null,
          weightIsPlaceholder: hasPlaceholder,
          repsIsPlaceholder: hasPlaceholder,
          placeholderWeight: phWeight, placeholderReps: phReps,
        }],
        collapsed: false,
      };
    }));
  };

  const setVariant = (uid, variant) => {
    setExercises((prev) => prev.map((ex) => (ex.uid === uid ? { ...ex, variant } : ex)));
    setVariantMenuFor(null);
  };

  // ── Keypad helpers ──
  // Compute the next field after the current one. Returns null if there is
  // no next field (in which case the keypad should close).
  // Logic per spec:
  //   - weight  → reps of same set (no auto-check)
  //   - reps    → weight of next set in same exercise (auto-check current set)
  //   - if no next set → first set of next exercise (auto-check current set)
  //   - if no next exercise → null (close keypad, auto-check current set)
  const nextField = (current) => {
    if (!current) return null;
    if (current.field === "weight") {
      return { ...current, field: "reps" };
    }
    // Currently on reps
    const exIdx = exercises.findIndex((e) => e.uid === current.exerciseUid);
    if (exIdx < 0) return null;
    const ex = exercises[exIdx];
    if (current.setIdx + 1 < ex.sets.length) {
      return { exerciseUid: ex.uid, setIdx: current.setIdx + 1, field: "weight" };
    }
    if (exIdx + 1 < exercises.length) {
      return { exerciseUid: exercises[exIdx + 1].uid, setIdx: 0, field: "weight" };
    }
    return null;
  };

  const handleKeypadNext = () => {
    if (!activeField) return;
    // Auto-check fires only when leaving via the reps field. Routed through
    // toggleSetDone (not raw updateSet) so the rest timer recording +
    // promotion logic actually fires. Skipped if either field is empty —
    // the user can still manually tap the checkbox, which surfaces the
    // shake feedback for the empty field(s).
    if (activeField.field === "reps") {
      const ex = exercisesRef.current.find((e) => e.uid === activeField.exerciseUid);
      const set = ex && ex.sets[activeField.setIdx];
      if (set && !set.done) {
        const weightReady =
          (set.weight !== "" && set.weight != null) ||
          (set.weightIsPlaceholder && set.placeholderWeight !== "" && set.placeholderWeight != null);
        const repsReady =
          (set.reps !== "" && set.reps != null) ||
          (set.repsIsPlaceholder && set.placeholderReps !== "" && set.placeholderReps != null);
        if (weightReady && repsReady) {
          toggleSetDone(activeField.exerciseUid, activeField.setIdx);
        }
      }
    }
    const next = nextField(activeField);
    setActiveField(next); // null closes the keypad
  };

  const handleKeypadDigit = (digit) => {
    if (!activeField) return;
    const ex = exercisesRef.current.find((e) => e.uid === activeField.exerciseUid);
    if (!ex) return;
    const set = ex.sets[activeField.setIdx];
    const cur = String(set[activeField.field] ?? "");

    // Three modes:
    //   1. caretPos === -1 (all selected) and the field has a value →
    //      replace entirely with the digit
    //   2. caretPos === -1 and the field is empty → just append
    //   3. caretPos is a real index (user dragged to position) →
    //      insert the digit at that index, advance caret
    let nextVal;
    if (caretPos === -1) {
      if (cur !== "") {
        nextVal = digit;
      } else {
        nextVal = digit;
      }
      freshFocusRef.current = false;
      // After the replace, the caret is conceptually at the end. We don't
      // flip caretPos to a real index here because the user might want to
      // keep typing — leave it at -1 so subsequent digits append.
      // Actually no: after replace, subsequent digits should append, not
      // re-replace. Set caret to end-of-string.
      setCaretPos(nextVal.length);
    } else {
      // Insert at caret
      const max = activeField.field === "weight" ? 5 : 3;
      if (cur.length >= max) return;
      nextVal = cur.slice(0, caretPos) + digit + cur.slice(caretPos);
      setCaretPos(caretPos + 1);
      freshFocusRef.current = false;
    }

    updateSet(activeField.exerciseUid, activeField.setIdx, {
      [activeField.field]: nextVal === "" ? "" : Number(nextVal),
    });
  };

  const handleKeypadBackspace = () => {
    if (!activeField) return;
    freshFocusRef.current = false;
    const ex = exercisesRef.current.find((e) => e.uid === activeField.exerciseUid);
    if (!ex) return;
    const set = ex.sets[activeField.setIdx];
    const cur = String(set[activeField.field] ?? "");
    if (cur === "") return;

    let nextStr;
    if (caretPos === -1) {
      // All selected → backspace clears the whole field
      nextStr = "";
      setCaretPos(0);
    } else if (caretPos > 0) {
      // Delete the character before the caret
      nextStr = cur.slice(0, caretPos - 1) + cur.slice(caretPos);
      setCaretPos(caretPos - 1);
    } else {
      return; // caret at 0, nothing to delete
    }
    updateSet(activeField.exerciseUid, activeField.setIdx, {
      [activeField.field]: nextStr === "" ? "" : Number(nextStr),
    });
  };

  const handleKeypadStep = (delta) => {
    if (!activeField) return;
    freshFocusRef.current = false;
    const ex = exercisesRef.current.find((e) => e.uid === activeField.exerciseUid);
    if (!ex) return;
    const set = ex.sets[activeField.setIdx];
    const cur = Number(set[activeField.field] || 0);
    let nextNum = cur + delta;
    if (nextNum < 0) nextNum = 0;
    updateSet(activeField.exerciseUid, activeField.setIdx, {
      [activeField.field]: nextNum,
    });
  };

  const handleKeypadRir = (rir) => {
    if (!activeField) return;
    updateSet(activeField.exerciseUid, activeField.setIdx, { rir });
  };

  // Drag-to-minimize handlers
  const onDragHandleDown = (e) => {
    dragMinRef.current = { startY: e.clientY, dragging: true };
    setDragY(0);
  };
  const onDragHandleMove = (e) => {
    if (!dragMinRef.current.dragging) return;
    const dy = Math.max(0, e.clientY - dragMinRef.current.startY);
    setDragY(dy);
  };
  const onDragHandleUp = () => {
    if (!dragMinRef.current.dragging) return;
    dragMinRef.current.dragging = false;
    if (dragY > MINIMIZE_THRESHOLD) { onMinimize(); }
    setDragY(0);
  };

  // ── Minimize morph constants (Bible §14, step 3) ──
  // Bottom-sheet model: ActiveLogger renders as a sheet that overlays the
  // WorkoutTab idle view. As the user drags down, the sheet's top edge
  // moves down (sheet shrinks from the bottom-up since its bottom is pinned
  // above the TabBar). The fixed header section stays at the top of the
  // sheet and ends up at SessionBar position when fully docked.
  //
  // MINIMIZE_THRESHOLD: drag distance past which release commits to
  //   minimized state (33% of typical content area, ~240px).
  // MAX_SHEET_TOP: how far the sheet's top can travel — at this distance
  //   only the header is visible above the TabBar, identical to the real
  //   SessionBar's docked position. Computed at runtime from the actual
  //   measured height of the WorkoutTab outer container (passed in via
  //   containerRef). Hardcoded constants were a few px off due to TabBar
  //   font metrics, causing the sheet to overshoot its resting position
  //   on drag. Measuring fixes this exactly.
  // SESSION_BAR_HEIGHT: source-of-truth match with the SessionBar component.
  const MINIMIZE_THRESHOLD = 240;
  const SESSION_BAR_HEIGHT = 52;

  // Measured container height. Defaults to the old hardcoded approximation
  // (624 + 52 = 676) so the very first render before useLayoutEffect
  // settles still looks reasonable. Real value comes in next frame via
  // ResizeObserver.
  const [containerHeight, setContainerHeight] = useState(676);
  useLayoutEffect(() => {
    if (!containerRef || !containerRef.current) return;
    const el = containerRef.current;
    const update = () => setContainerHeight(el.getBoundingClientRect().height);
    update(); // initial sync read
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const MAX_SHEET_TOP = Math.max(0, containerHeight - SESSION_BAR_HEIGHT);
  // dockedness — 0 when fully expanded, 1 when fully docked into bar
  // position. Used for cross-fading header decorations during the gesture.
  const dockedness = MAX_SHEET_TOP > 0 ? Math.min(1, dragY / MAX_SHEET_TOP) : 0;
  // Cap effective drag at MAX_SHEET_TOP so finger can't push sheet
  // off-screen past the docked position.
  const effectiveDragY = Math.min(dragY, MAX_SHEET_TOP);

  // ── DEV-ONLY fake drag (desktop testing) ──
  // Animates dragY from 0 → MAX_SHEET_TOP over 500ms via rAF, mimicking a
  // finger drag that completes the docking gesture. Triggers onMinimize
  // at the end (release-past-threshold).
  // grep marker: DEV_MINIMIZE_BUTTON
  const fakeDragRafRef = useRef(null);
  const playFakeDrag = () => {
    // Don't double-trigger if already playing
    if (fakeDragRafRef.current !== null) return;
    const startTime = performance.now();
    const duration = 500; // ms
    const targetY = MAX_SHEET_TOP;
    dragMinRef.current.dragging = true;
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      // Ease-out cubic — feels like a real finger flick deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      setDragY(targetY * eased);
      if (t < 1) {
        fakeDragRafRef.current = requestAnimationFrame(tick);
      } else {
        // Done — release path: commit minimize, clear dragY, clear flag.
        // The state flip from active → minimized happens here. The real
        // SessionBar mounts in the same screen position the docked sheet
        // header just was, so the swap is invisible.
        fakeDragRafRef.current = null;
        dragMinRef.current.dragging = false;
        onMinimize();
        setDragY(0);
      }
    };
    fakeDragRafRef.current = requestAnimationFrame(tick);
  };
  // Cleanup any in-flight animation if logger unmounts mid-drag
  useEffect(() => () => {
    if (fakeDragRafRef.current !== null) {
      cancelAnimationFrame(fakeDragRafRef.current);
    }
  }, []);

  return (
    <div style={{
      // ── Bottom-sheet positioning (Bible §14, step 3) ──
      // ActiveLogger is a sheet that overlays the WorkoutTab idle view.
      // top moves down with drag; bottom is pinned just above TabBar (handled
      // by parent's flex layout — we sit inside the same flex slot the idle
      // view occupies, but absolutely positioned within it).
      //
      // Goal: by dockedness === 1 the sheet is pixel-identical to the
      // SessionBar that will mount in its place at the state flip. So we
      // interpolate every visible attribute (background, border, internal
      // element coordinates) so they reach SessionBar's resting values
      // before the swap, not at it.
      position: "absolute",
      top: effectiveDragY, left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "column", minHeight: 0,
      // Background: #111111 → #161616 over 0 → 1 (matches SessionBar at end).
      background: `rgb(${17 + dockedness * 5}, ${17 + dockedness * 5}, ${17 + dockedness * 5})`,
      // Gold top border: faded in over the BACK HALF of the morph
      // (dockedness 0.5 → 1). At 1, border is fully opaque and matches the
      // real SessionBar's borderTop. The 'rgba' form lets us interpolate
      // alpha rather than swap colors.
      borderTop: `1px solid rgba(255, 215, 0, ${Math.max(0, (dockedness - 0.5) * 2)})`,
      overflow: "hidden",
      transition: dragMinRef.current.dragging ? "none"
        : "top 0.25s ease, background 0.25s ease, border-color 0.25s ease",
    }}>
      {/* ── Morph header — drag region + shared-element interpolation ──
          Container is 52px tall — exactly matches SessionBar. The whole
          surface is the drag-detection region (no separate drag pill).
          Inside, shared elements (gold dot, workout name, duration) are
          absolutely positioned and interpolate continuously based on
          `dockedness`. By dockedness === 1, the layout is pixel-identical
          to SessionBar's, so the state-flip swap is invisible.

          editingName mode replaces the name <button> with an <input> only
          at dockedness === 0 — interpolating an input would warp it. */}
      {(() => {
        const lerp = (a, b, t) => a + (b - a) * t;
        const d = dockedness;
        // Element-fade windows (0 — active fully visible, 1 — bar fully visible)
        const activeChromeOpacity = Math.max(0, 1 - d * 2);     // out by d=0.5
        const barChromeOpacity   = Math.max(0, (d - 0.5) * 2);  // in from d=0.5

        // Shared dot — in active: 6×6 square at the left of the duration row.
        // In bar (matches SessionBar exactly): 8×8 round, left=18, top=22 (vertically
        // centered in 52px), with subtle glow.
        const dotLeft   = lerp(20, 18, d);
        const dotTop    = lerp(34, 22, d);
        const dotSize   = lerp(6, 8, d);
        const dotRadius = lerp(3, 4, d);
        const dotGlow   = d > 0 ? `0 0 ${8 * d}px rgba(255,215,0,${0.6 * d})` : "none";

        // Shared name — in active: top-left, fontSize 19. In bar (matches
        // SessionBar exactly): left=38 (after 18 padding + 8 dot + 12 gap),
        // top=11 (vertically centering the text column in 52px), fontSize 13.
        const nameLeft     = lerp(20, 38, d);
        const nameTop      = lerp(6, 11, d);
        const nameFontSize = lerp(19, 13, d);
        // Width: reserve right space for whichever chrome is visible. Active
        // needs room for Finish button (~80). Bar needs room for chevron
        // (~40 incl padding).
        const nameRight    = lerp(100, 40, d);

        // Shared duration — in active: inline after the dot at top=32 fontSize 12.
        // In bar (matches SessionBar): below the name at left=38 top=28 fontSize 11.
        const durLeft     = lerp(30, 38, d);
        const durTop      = lerp(32, 28, d);
        const durFontSize = lerp(12, 11, d);

        const exCountSuffix = ` · ${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`;

        return (
          <div
            // The whole 52px header is the drag region (no separate pill).
            // This also gives a much larger drag hitbox than the old 36×4
            // pill — addresses your earlier note about hitbox being too small.
            onPointerDown={onDragHandleDown}
            onPointerMove={onDragHandleMove}
            onPointerUp={onDragHandleUp}
            onPointerCancel={onDragHandleUp}
            style={{
              position: "relative", height: 52, flexShrink: 0,
              touchAction: "none",
              cursor: d === 0 ? "grab" : "default",
              // No padding on the container — children are absolute-positioned
              // with explicit coordinates. This keeps the morph deterministic.
            }}
          >

            {/* SHARED — pulsing gold dot */}
            <div style={{
              position: "absolute",
              left: dotLeft, top: dotTop,
              width: dotSize, height: dotSize, borderRadius: dotRadius,
              background: COLORS.gold,
              boxShadow: dotGlow,
              pointerEvents: "none",
              transition: dragMinRef.current.dragging ? "none"
                : "left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease, border-radius 0.25s ease, box-shadow 0.25s ease",
            }} />

            {/* SHARED — workout name. Interpolates position + font size.
                Becomes an <input> only when editingName is true AND we're
                fully expanded (dockedness === 0). Otherwise it's a button. */}
            {editingName && d === 0 ? (
              <input
                autoFocus
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
                style={{
                  position: "absolute",
                  left: nameLeft, top: nameTop, right: nameRight,
                  background: "transparent", border: "none", outline: "none",
                  color: COLORS.text, fontSize: nameFontSize, fontWeight: 600,
                  padding: 0, lineHeight: 1.2,
                  borderBottom: `1px solid ${COLORS.gold}`,
                }}
              />
            ) : (
              <button
                onClick={() => { if (d === 0) setEditingName(true); }}
                style={{
                  position: "absolute",
                  left: nameLeft, top: nameTop, right: nameRight,
                  background: "none", border: "none", padding: 0,
                  cursor: d === 0 ? "pointer" : "default",
                  color: workoutName ? COLORS.text : COLORS.textSecondary,
                  fontSize: nameFontSize, fontWeight: 600,
                  textAlign: "left",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  lineHeight: 1.2,
                  transition: dragMinRef.current.dragging ? "none"
                    : "left 0.25s ease, top 0.25s ease, right 0.25s ease, font-size 0.25s ease",
                }}
              >
                {workoutName || "Workout Name"}
              </button>
            )}

            {/* SHARED — duration text. Active form: just time. Bar form:
                time · N exercises. The suffix is rendered as a separate
                inline span that fades in. */}
            <div style={{
              position: "absolute",
              left: durLeft, top: durTop,
              color: COLORS.gold, fontSize: durFontSize, fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              transition: dragMinRef.current.dragging ? "none"
                : "left 0.25s ease, top 0.25s ease, font-size 0.25s ease",
            }}>
              {formatDuration(elapsed)}
              <span style={{
                opacity: barChromeOpacity,
                transition: dragMinRef.current.dragging ? "none" : "opacity 0.25s ease",
              }}>
                {exCountSuffix}
              </span>
            </div>

            {/* ACTIVE-ONLY — gear icon, fades out as sheet docks.
                Position matches where it sat in the original active layout
                (after the duration text, vertically aligned with it). */}
            <button
              onClick={() => setSettingsMenuOpen((o) => !o)}
              style={{
                position: "absolute",
                left: 78, top: 30,
                background: "none", border: "none", padding: "2px 4px",
                cursor: "pointer", color: COLORS.textSecondary,
                display: "flex", alignItems: "center",
                opacity: activeChromeOpacity,
                pointerEvents: d > 0.4 ? "none" : "auto",
                transition: dragMinRef.current.dragging ? "none" : "opacity 0.25s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>

            {/* ACTIVE-ONLY — Finish button, fades out as sheet docks. */}
            <button
              onClick={onFinish}
              style={{
                position: "absolute",
                right: 18, top: 9,
                padding: "8px 18px", background: COLORS.gold, border: "none",
                borderRadius: 17, color: COLORS.bg, fontSize: 13, fontWeight: 700,
                cursor: "pointer", height: 34,
                opacity: activeChromeOpacity,
                pointerEvents: d > 0.4 ? "none" : "auto",
                transition: dragMinRef.current.dragging ? "none" : "opacity 0.25s ease",
              }}
            >
              Finish
            </button>

            {/* BAR-ONLY — chevron-up indicator, fades in as sheet docks.
                Position matches SessionBar's right-side chevron. */}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={COLORS.gold} strokeWidth="2.5"
              style={{
                position: "absolute",
                right: 18, top: 19,
                opacity: barChromeOpacity,
                pointerEvents: "none",
                transition: dragMinRef.current.dragging ? "none" : "opacity 0.25s ease",
              }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        );
      })()}

      {/* Settings menu (gear icon) — two-level: main + countdown duration submenu.
          Main view: timer mode picker + Cancel Workout. Countdown submenu:
          preset durations + Custom. Selecting anything that changes timer
          state closes the menu; the user can always re-open it. */}
      {settingsMenuOpen && (
        <>
          <div onClick={() => { setSettingsMenuOpen(false); setSettingsMenuView("main"); }} style={{ position: "absolute", inset: 0, zIndex: 15 }} />
          <div style={{
            position: "absolute", top: 70, left: 20, zIndex: 16,
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            minWidth: 170, padding: 6,
          }}>
            {settingsMenuView === "main" && (
              <>
                <div style={{ padding: "6px 10px 4px", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Rest Timer</div>
                {/* Count up */}
                <button
                  onClick={() => { setRestTimerMode("countup"); setSettingsMenuOpen(false); setSettingsMenuView("main"); }}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 6,
                    background: restTimerMode === "countup" ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: restTimerMode === "countup" ? COLORS.gold : COLORS.text, fontSize: 13,
                    fontWeight: restTimerMode === "countup" ? 600 : 400,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontFamily: "inherit",
                  }}
                >
                  <span>Count up</span>
                  {restTimerMode === "countup" && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
                {/* Countdown → opens submenu */}
                <button
                  onClick={() => setSettingsMenuView("countdownDuration")}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 6,
                    background: restTimerMode === "countdown" ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: restTimerMode === "countdown" ? COLORS.gold : COLORS.text, fontSize: 13,
                    fontWeight: restTimerMode === "countdown" ? 600 : 400,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    Countdown
                    {restTimerMode === "countdown" && (
                      <span style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                        · {formatDuration(restCountdownTarget)}
                      </span>
                    )}
                  </span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={restTimerMode === "countdown" ? COLORS.gold : COLORS.textSecondary} strokeWidth="2.2">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
                {/* Off */}
                <button
                  onClick={() => { setRestTimerMode("off"); setSettingsMenuOpen(false); setSettingsMenuView("main"); }}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 6,
                    background: restTimerMode === "off" ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: restTimerMode === "off" ? COLORS.gold : COLORS.text, fontSize: 13,
                    fontWeight: restTimerMode === "off" ? 600 : 400,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontFamily: "inherit",
                  }}
                >
                  <span>Off</span>
                  {restTimerMode === "off" && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
                <div style={{ height: 1, background: COLORS.border, margin: "6px 4px" }} />
                <button
                  onClick={() => { setSettingsMenuOpen(false); setSettingsMenuView("main"); setConfirmCancel(true); }}
                  style={{
                    width: "100%", padding: "10px 10px", borderRadius: 6,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", color: "#FF6B6B", fontSize: 13, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8,
                    fontFamily: "inherit",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  </svg>
                  Cancel Workout
                </button>
              </>
            )}

            {settingsMenuView === "countdownDuration" && (
              <>
                {/* Submenu header — back chevron + title. Tap the whole strip to go back. */}
                <button
                  onClick={() => setSettingsMenuView("main")}
                  style={{
                    width: "100%", padding: "6px 10px 6px 4px",
                    background: "transparent", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
                    fontFamily: "inherit",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Duration
                </button>
                {/* Preset durations. Tapping a preset selects countdown mode AND sets
                    the target value, then closes the menu. */}
                {[
                  { seconds: 60,  label: "1:00" },
                  { seconds: 90,  label: "1:30" },
                  { seconds: 120, label: "2:00" },
                  { seconds: 180, label: "3:00" },
                ].map((opt) => {
                  const isActive = restTimerMode === "countdown" && restCountdownTarget === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      onClick={() => {
                        setRestCountdownTarget(opt.seconds);
                        setRestTimerMode("countdown");
                        setSettingsMenuOpen(false);
                        setSettingsMenuView("main");
                      }}
                      style={{
                        width: "100%", padding: "9px 10px", borderRadius: 6,
                        background: isActive ? COLORS.goldHighlight : "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        color: isActive ? COLORS.gold : COLORS.text, fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: "inherit",
                      }}
                    >
                      <span>{opt.label}</span>
                      {isActive && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  );
                })}
                {/* Custom — opens modal. If the current target isn't one of the
                    presets, this row also shows as active with the current value. */}
                {(() => {
                  const presets = [60, 90, 120, 180];
                  const isCustomActive = restTimerMode === "countdown" && !presets.includes(restCountdownTarget);
                  return (
                    <button
                      onClick={() => {
                        setCustomDurationOpen(true);
                        setSettingsMenuOpen(false);
                        setSettingsMenuView("main");
                      }}
                      style={{
                        width: "100%", padding: "9px 10px", borderRadius: 6,
                        background: isCustomActive ? COLORS.goldHighlight : "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        color: isCustomActive ? COLORS.gold : COLORS.text, fontSize: 13,
                        fontWeight: isCustomActive ? 600 : 400,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        Custom
                        {isCustomActive && (
                          <span style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                            · {formatDuration(restCountdownTarget)}
                          </span>
                        )}
                      </span>
                      {isCustomActive && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </>
      )}

      {/* Custom duration modal */}
      {customDurationOpen && (
        <CustomDurationModal
          initialSeconds={restCountdownTarget}
          onCancel={() => setCustomDurationOpen(false)}
          onConfirm={(seconds) => {
            setRestCountdownTarget(seconds);
            setRestTimerMode("countdown");
            setCustomDurationOpen(false);
          }}
        />
      )}

      {/* ── Scrollable exercise list ──
          When the keypad is open, an onClick on this container dismisses
          it. Field buttons inside cards already call e.stopPropagation()
          on their onClick, so tapping a field on another row activates
          that field (one tap) without first dismissing the keypad. Tapping
          truly empty space (between cards, around + Add Exercise, scroll
          padding) still closes the keypad. Replaces the previous absolute-
          positioned catcher overlay, which was layering above and below
          the cards in z-order conflicts with AddExerciseSheet, set type
          popover, and variant menu. */}
      <div
        ref={scrollRef}
        onClick={activeField ? () => setActiveField(null) : undefined}
        style={{
          flex: 1,
          padding: "8px 20px 20px",
          paddingBottom: activeField ? 280 : 20,
          overflowY: "auto",
          minHeight: 0,
          transition: "padding-bottom 0.2s ease",
        }}
      >
        {exercises.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px 32px", color: COLORS.textSecondary, fontSize: 13 }}>
            No exercises yet.<br />Tap <span style={{ color: COLORS.gold }}>+ Add Exercise</span> to begin.
          </div>
        )}

        {exercises.map((ex, exIdx) => (
          <ExerciseCard
            key={ex.uid}
            exercise={ex}
            exIdx={exIdx}
            isLast={exIdx === exercises.length - 1}
            restTimerMode={restTimerMode}
            restCountdownTarget={restCountdownTarget}
            restTimer={restTimer}
            activeField={activeField}
            caretPos={caretPos}
            setCaretPos={setCaretPos}
            workoutHistory={workoutHistory}
            customExercises={customExercises}
            reorderDrag={reorderDrag}
            onReorderStart={onReorderStart}
            onReorderMove={onReorderMove}
            onReorderEnd={onReorderEnd}
            onUpdateSet={(setIdx, patch) => updateSet(ex.uid, setIdx, patch)}
            onToggleSetDone={(setIdx) => toggleSetDone(ex.uid, setIdx)}
            onAddSet={() => addSet(ex.uid)}
            onRemoveSet={(setIdx) => removeSet(ex.uid, setIdx)}
            onClearRestTimer={clearRestTimer}
            onRemove={() => removeExercise(ex.uid)}
            onOpenAlternatives={() => setAlternativesFor(ex.uid)}
            onToggleCollapsed={() => toggleExerciseCollapsed(ex.uid)}
            onOpenSetTypePopover={(setIdx) => setTypePopover({ uid: ex.uid, setIdx })}
            onOpenVariantMenu={() => setVariantMenuFor(ex.uid)}
            onFocusField={(setIdx, field) => {
              // Tapping a field just activates it — the placeholder (if any)
              // stays visible in gray so the user can see the suggested
              // value. When they start typing, handleKeypadDigit replaces
              // the placeholder with the real value (and clears the flag).
              setActiveField({ exerciseUid: ex.uid, setIdx, field });
            }}
            registerSetRef={(setIdx, node) => { setRowRefs.current[`${ex.uid}_${setIdx}`] = node; }}
          />
        ))}

        <button
          onClick={() => setPickerOpen(true)}
          style={{
            width: "100%", padding: 14, background: "transparent",
            border: `1.5px dashed ${COLORS.border}`, borderRadius: 10,
            color: COLORS.gold, fontSize: 14, fontWeight: 500, cursor: "pointer",
            marginTop: 12,
          }}
        >
          + Add Exercise
        </button>
      </div>

      {/* ── Numeric Keypad ── */}
      {activeField && (() => {
        const ex = exercises.find((e) => e.uid === activeField.exerciseUid);
        if (!ex) return null;
        const set = ex.sets[activeField.setIdx];
        return (
          <NumericKeypad
            field={activeField.field}
            value={set[activeField.field]}
            rir={set.rir}
            stepSize={activeField.field === "weight" ? 2.5 : 1}
            onDigit={handleKeypadDigit}
            onBackspace={handleKeypadBackspace}
            onStep={handleKeypadStep}
            onRir={handleKeypadRir}
            onNext={handleKeypadNext}
            onOpenRirHelp={() => setRirHelpOpen(true)}
          />
        );
      })()}

      {/* ── RIR explainer popover — wider so title fits one line ── */}
      {rirHelpOpen && (
        <>
          <div onClick={() => setRirHelpOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50 }} />
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 51, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "16px 20px", width: 320,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{
              fontSize: 15, color: COLORS.gold, marginBottom: 8, fontWeight: 600,
              whiteSpace: "nowrap",
            }}>
              RIR — Reps in Reserve
            </div>
            <div style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
              How many reps you had left before failure. RIR 0 = absolute failure. RIR 2 = two more in the tank. Coach uses this to optimize your intensity.
            </div>
            <button
              onClick={() => setRirHelpOpen(false)}
              style={{
                width: "100%", padding: "9px", background: COLORS.gold,
                border: "none", borderRadius: 8, color: COLORS.bg,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </>
      )}

      {/* ── Cancel workout confirm ── */}
      {confirmCancel && (
        <>
          <div onClick={() => setConfirmCancel(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "22px 22px 18px", width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
              Cancel this workout?
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center" }}>
              All logged sets will be lost. This can&apos;t be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmCancel(false)}
                style={{
                  flex: 1, padding: "11px", background: "transparent",
                  border: `1px solid ${COLORS.border}`, borderRadius: 8,
                  color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Keep Going
              </button>
              <button
                onClick={() => { setConfirmCancel(false); onCancel(); }}
                style={{
                  flex: 1, padding: "11px", background: "#3A1A1A",
                  border: "1px solid #5A2A2A", borderRadius: 8,
                  color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Set type popover ── */}
      {typePopover && (() => {
        const ex = exercises.find((e) => e.uid === typePopover.uid);
        if (!ex) return null;
        return (
          <>
            <div onClick={() => setTypePopover(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 25 }} />
            <div style={{
              position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 26, background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 10, minWidth: 220,
              boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            }}>
              <div style={{ padding: "4px 8px 8px", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Set Type</div>
              {SET_TYPES.map((t) => {
                const isActive = ex.sets[typePopover.setIdx].type === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      updateSet(typePopover.uid, typePopover.setIdx, { type: t.id });
                      setTypePopover(null);
                    }}
                    style={{
                      width: "100%", padding: "10px 10px", borderRadius: 8,
                      background: isActive ? COLORS.goldHighlight : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      color: isActive ? COLORS.gold : COLORS.text, fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                      border: `1px solid ${isActive ? COLORS.gold : COLORS.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: isActive ? COLORS.gold : COLORS.textSecondary,
                    }}>
                      {t.short || (typePopover.setIdx + 1)}
                    </span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ── Variant chip popover ── */}
      {variantMenuFor && (() => {
        const ex = exercises.find((e) => e.uid === variantMenuFor);
        if (!ex) return null;
        const libEx = EXERCISE_LIBRARY.find((l) => l.id === ex.exerciseId);
        if (!libEx) return null;
        const activeKey = variantKey(ex.variant);
        return (
          <>
            <div onClick={() => setVariantMenuFor(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 25 }} />
            <div style={{
              position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
              zIndex: 26, background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 6, minWidth: 240, maxWidth: 300,
              boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            }}>
              <div style={{ padding: "8px 12px 4px", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Switch Variant</div>
              {libEx.variants.map((v, i) => {
                const isActive = variantKey(v) === activeKey;
                return (
                  <button
                    key={i}
                    onClick={() => setVariant(ex.uid, v)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      background: isActive ? COLORS.goldHighlight : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      color: isActive ? COLORS.gold : COLORS.text, fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span>{v.label}</span>
                    {isActive && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ── Add Exercise picker (full-screen overlay) ── */}
      {pickerOpen && (
        <AddExerciseSheet
          userEquipment={userEquipment}
          customExercises={customExercises}
          workoutHistory={workoutHistory}
          onClose={() => { setPickerOpen(false); setPickerSwapTargetUid(null); }}
          onAdd={addExercise}
        />
      )}

      {/* ── Alternatives sheet (D-019) ── */}
      {alternativesFor && (() => {
        const activeEntry = exercises.find((e) => e.uid === alternativesFor);
        if (!activeEntry) return null;
        // Resolve to the library/custom record so the sheet has access to
        // pattern, variants, primary, etc. Customs route through findExerciseById
        // and arrive with pattern: undefined → empty-state per getAlternatives.
        const libEntry = findExerciseById(activeEntry.exerciseId, customExercises);
        if (!libEntry) return null;
        return (
          <AlternativesSheet
            exercise={libEntry}
            userEquipment={userEquipment}
            customExercises={customExercises}
            workoutHistory={workoutHistory}
            onClose={() => setAlternativesFor(null)}
            onPick={(libEx, variant) => {
              swapExercise(alternativesFor, libEx, variant);
              setAlternativesFor(null);
            }}
            onAskCoach={() => {
              setAlternativesFor(null);
              if (onTabChange) onTabChange("coach");
            }}
            onBrowseAll={() => {
              // Hand off to the existing AddExerciseSheet in swap-mode.
              setPickerSwapTargetUid(alternativesFor);
              setAlternativesFor(null);
              setPickerOpen(true);
            }}
          />
        );
      })()}
    </div>
  );
}

/* ── Exercise Card ────────────────────────────────────────────────
   One card per exercise in the active logger. Handles its own swipe-left
   reveal of Remove + Alternative actions, set rows, inline rest timer,
   collapse-on-complete behavior, and add-set button.
*/
function ExerciseCard({
  exercise, exIdx, isLast, restTimerMode, restCountdownTarget, restTimer, activeField, caretPos, setCaretPos,
  workoutHistory = [], customExercises = [],
  reorderDrag, onReorderStart, onReorderMove, onReorderEnd,
  onUpdateSet, onToggleSetDone, onAddSet, onRemoveSet, onClearRestTimer,
  onRemove, onOpenAlternatives, onToggleCollapsed,
  onOpenSetTypePopover, onOpenVariantMenu,
  onFocusField, registerSetRef,
}) {
  // Header pointer handler: a single point of entry that disambiguates
  // between three gestures from rest:
  //   • Hold still ≥300ms  → long-press → reorder begins (card lifts)
  //   • Move horizontal ≥6px first → swipe-to-reveal Remove/Alternative
  //   • Move vertical ≥6px first → release the gesture so the list scrolls
  // Quick tap-and-release before any motion is a no-op (header has no
  // primary tap action; the buttons inside it stop-propagation themselves).
  const REVEAL_WIDTH = 140;
  const HOLD_MS = 300;
  const SLOP = 6;
  const [drag, setDrag] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const cardElRef = useRef(null);
  const headerGestureRef = useRef({
    mode: "idle",     // "idle" | "pending" | "swipe" | "reorder" | "vscroll"
    startX: 0,
    startY: 0,
    holdTimer: null,
  });

  const cancelHoldTimer = () => {
    if (headerGestureRef.current.holdTimer) {
      clearTimeout(headerGestureRef.current.holdTimer);
      headerGestureRef.current.holdTimer = null;
    }
  };

  const onPointerDown = (e) => {
    // If the card is already swiped open (Remove/Alternative actions
    // visible), enter a "closing" gesture mode: any pointerup will
    // snap the card closed. No long-press, no reorder, no further swipe.
    if (revealed) {
      headerGestureRef.current.startX = e.clientX;
      headerGestureRef.current.startY = e.clientY;
      headerGestureRef.current.mode = "closing";
      return;
    }
    // Capture the pointer to this element so subsequent move/up events
    // continue to fire here even if the visible card translates out from
    // under the finger during reorder. Without capture, the move events
    // would route to whatever's under the actual cursor position, which
    // for a card translated 100px down means the next card down.
    if (e.currentTarget && e.currentTarget.setPointerCapture) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    }
    headerGestureRef.current.startX = e.clientX;
    headerGestureRef.current.startY = e.clientY;
    headerGestureRef.current.mode = "pending";
    // Arm the long-press timer — fires only if no SLOP-exceeding motion
    // and pointer hasn't released by then.
    headerGestureRef.current.holdTimer = setTimeout(() => {
      headerGestureRef.current.holdTimer = null;
      // Confirm we're still pending (didn't transition to swipe/vscroll
      // or pointerUp) before firing reorder.
      if (headerGestureRef.current.mode !== "pending") return;
      headerGestureRef.current.mode = "reorder";
      onReorderStart(exercise.uid, exIdx, headerGestureRef.current.startY, cardElRef.current);
    }, HOLD_MS);
  };

  const onPointerMove = (e) => {
    const g = headerGestureRef.current;
    if (g.mode === "idle") return;

    if (g.mode === "pending") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) >= SLOP && Math.abs(dx) > Math.abs(dy)) {
        // Horizontal-first → commit to swipe-to-reveal.
        cancelHoldTimer();
        g.mode = "swipe";
      } else if (Math.abs(dy) >= SLOP) {
        // Vertical-first before hold fires → release the gesture so the
        // list scrolls naturally. Reorder requires the user to hold still.
        cancelHoldTimer();
        g.mode = "vscroll";
        return;
      } else {
        return; // still inside slop
      }
    }

    if (g.mode === "swipe") {
      const dx = e.clientX - g.startX;
      let next = revealed ? -REVEAL_WIDTH + dx : dx;
      if (next > 0) next = 0;
      if (next < -REVEAL_WIDTH) next = -REVEAL_WIDTH;
      setDrag(next);
      return;
    }

    if (g.mode === "reorder") {
      onReorderMove(e.clientY);
      return;
    }
    // vscroll: nothing to do — let the browser handle scroll
  };

  const onPointerUp = () => {
    const g = headerGestureRef.current;
    cancelHoldTimer();
    if (g.mode === "closing") {
      closeSwipe();
    } else if (g.mode === "swipe") {
      const open = drag < -REVEAL_WIDTH / 2;
      setRevealed(open);
      setDrag(open ? -REVEAL_WIDTH : 0);
    } else if (g.mode === "reorder") {
      onReorderEnd();
    }
    g.mode = "idle";
  };
  const closeSwipe = () => { setRevealed(false); setDrag(0); };

  // Shake state for invalid-checkbox-tap feedback. Keyed by `${setIdx}:${field}`.
  // A truthy value in the map means that field is currently shaking; it's
  // cleared after the animation duration. Used to flag empty weight/reps
  // when the user tries to check a set off without entering values.
  const [shakeFields, setShakeFields] = useState({});
  const triggerShake = (setIdx, fields) => {
    const additions = {};
    for (const f of fields) additions[`${setIdx}:${f}`] = true;
    setShakeFields((prev) => ({ ...prev, ...additions }));
    setTimeout(() => {
      setShakeFields((prev) => {
        const next = { ...prev };
        for (const f of fields) delete next[`${setIdx}:${f}`];
        return next;
      });
    }, 500);
  };

  // Look up the library entry to know whether the variant chip should show
  const libEx = EXERCISE_LIBRARY.find((l) => l.id === exercise.exerciseId);
  const hasMultipleVariants = libEx && libEx.variants.length > 1;

  // Last-session reference for the overload cue + Prev column. This re-derives
  // when the variant changes (since variantKey changes) — so the prev column
  // automatically refreshes after a mid-workout variant switch.
  // Last-session reference for the Prev column. Re-derives when the
  // variant changes so the column automatically refreshes after a
  // mid-workout variant switch.
  const variantHist = getVariantHistory(exercise.exerciseId, variantKey(exercise.variant), workoutHistory, customExercises);
  const lastSession = variantHist[variantHist.length - 1];

  const setNumberDisplay = (set, workingIndexCounter) => {
    const t = SET_TYPES.find((x) => x.id === set.type);
    if (t && t.short) return t.short;
    return workingIndexCounter;
  };

  const fieldIsActive = (setIdx, field) =>
    activeField &&
    activeField.exerciseUid === exercise.uid &&
    activeField.setIdx === setIdx &&
    activeField.field === field;

  const isCollapsed = exercise.collapsed;

  // Per-set swipe state. Each set row is a separate swipeable. The drag
  // tracks the current x-offset; on release, if past the delete threshold
  // the set is removed entirely (no Delete button — it's a binary swipe-off
  // gesture). Otherwise the row snaps back to 0.
  const SET_DELETE_THRESHOLD = 200; // px past which release triggers delete (~60% of row)
  const SET_MAX_DRAG = 280;         // hard cap so the row doesn't fly off
  const [setDrags, setSetDrags] = useState({}); // { [setIdx]: number }
  const setDragRefs = useRef({}); // { [setIdx]: { startX, dragging } }
  const onSetPointerDown = (setIdx) => (e) => {
    e.stopPropagation();
    setDragRefs.current[setIdx] = {
      startX: e.clientX,
      dragging: true,
    };
  };
  const onSetPointerMove = (setIdx) => (e) => {
    const ref = setDragRefs.current[setIdx];
    if (!ref || !ref.dragging) return;
    e.stopPropagation();
    const dx = e.clientX - ref.startX;
    let next = dx;
    if (next > 0) next = 0;
    if (next < -SET_MAX_DRAG) next = -SET_MAX_DRAG;
    setSetDrags((prev) => ({ ...prev, [setIdx]: next }));
  };
  const onSetPointerUp = (setIdx) => () => {
    const ref = setDragRefs.current[setIdx];
    if (!ref || !ref.dragging) return;
    ref.dragging = false;
    const cur = setDrags[setIdx] || 0;
    if (cur <= -SET_DELETE_THRESHOLD) {
      // Past threshold → delete on release. Reset drag state first so a
      // residual offset doesn't linger if React re-renders before unmount.
      setSetDrags((prev) => ({ ...prev, [setIdx]: 0 }));
      onRemoveSet(setIdx);
    } else {
      // Snap back
      setSetDrags((prev) => ({ ...prev, [setIdx]: 0 }));
    }
  };

  // ── Drag-to-position-caret on focused field ──
  // When the user holds and drags within an active field, compute a caret
  // position from finger X relative to the field's bounding box. The
  // value is a string of N chars; we map finger X to one of N+1 positions.
  const onFieldPointerMove = (setIdx, field, valueStr) => (e) => {
    if (!fieldIsActive(setIdx, field)) return;
    if (e.buttons !== 1 && e.pointerType === "mouse") return; // mouse must be pressed
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const N = valueStr.length;
    if (N === 0) return;
    // Each character occupies (rect.width / N) of horizontal space.
    // Caret positions are at boundaries: 0, 1, 2, ..., N.
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const pos = Math.round(ratio * N);
    setCaretPos(pos);
  };

  // Reorder visual state for THIS card. Three possibilities:
  //   • This card is being dragged → translateY tracks pointer; isDragged=true
  //   • A sibling is being dragged and would displace this card → translateY
  //     equals ±cardHeight depending on whether displaced sibling moves
  //     above or below this card's original slot
  //   • No drag active → translateY=0
  // Computed every render; cheap (one find + a couple of comparisons).
  const reorderVisual = (() => {
    if (!reorderDrag) return { translateY: 0, isDragged: false };
    if (reorderDrag.uid === exercise.uid) {
      return {
        translateY: reorderDrag.pointerY - reorderDrag.startY,
        isDragged: true,
      };
    }
    const sibling = reorderDrag.siblingRects.find((s) => s.uid === exercise.uid);
    if (!sibling) return { translateY: 0, isDragged: false };
    const draggedCenterY = reorderDrag.cardRect.top
      + (reorderDrag.pointerY - reorderDrag.startY)
      + reorderDrag.cardHeight / 2;
    const siblingMidY = sibling.top + sibling.height / 2;
    if (sibling.idx > reorderDrag.originIdx) {
      if (draggedCenterY > siblingMidY) {
        return { translateY: -reorderDrag.cardHeight, isDragged: false };
      }
    } else {
      if (draggedCenterY < siblingMidY) {
        return { translateY: reorderDrag.cardHeight, isDragged: false };
      }
    }
    return { translateY: 0, isDragged: false };
  })();

  return (
    <div
      ref={cardElRef}
      data-exercise-card={exercise.uid}
      style={{
        position: "relative",
        paddingBottom: 18,
        marginBottom: 18,
        borderBottom: isLast ? "none" : `1px solid #1F1F1F`,
        // Reorder visual: dragged card lifts and follows pointer; siblings
        // shift to make space. Only the dragged card uses zIndex+shadow;
        // siblings get translate-only.
        transform: `translateY(${reorderVisual.translateY}px)${reorderVisual.isDragged ? " scale(1.02)" : ""}`,
        transition: reorderDrag ? (reorderVisual.isDragged ? "none" : "transform 0.18s ease") : "none",
        zIndex: reorderVisual.isDragged ? 50 : "auto",
        boxShadow: reorderVisual.isDragged ? "0 12px 32px rgba(0,0,0,0.6)" : "none",
        opacity: reorderVisual.isDragged ? 0.96 : 1,
      }}
    >
      {/* Underlying action layer (revealed by swiping the entire exercise) */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 18,
        width: REVEAL_WIDTH, display: "flex",
        borderRadius: 10, overflow: "hidden",
      }}>
        <button
          onClick={() => { closeSwipe(); onOpenAlternatives(); }}
          style={{
            flex: 1, background: "#1F1F14", border: "none", cursor: "pointer",
            color: COLORS.gold, fontSize: 11, fontWeight: 600,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
          Alternative
        </button>
        <button
          onClick={() => { closeSwipe(); onRemove(); }}
          style={{
            flex: 1, background: "#1F1414", border: "none", cursor: "pointer",
            color: "#FF6B6B", fontSize: 11, fontWeight: 600,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          Remove
        </button>
      </div>

      {/* Exercise content */}
      <div
        style={{
          background: COLORS.bg,
          transform: `translateX(${drag}px)`,
          transition: headerGestureRef.current.mode === "swipe" ? "none" : "transform 0.22s ease",
          touchAction: "pan-y", userSelect: "none",
        }}
      >
        {/* Header — name + collapse caret + variant + cue. The header
            area is grabbable for the swipe-left exercise gesture. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ marginBottom: isCollapsed ? 0 : 10, cursor: "grab" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{
              color: COLORS.text, fontSize: 17, fontWeight: 600,
              lineHeight: 1.2, flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {exercise.name}
            </div>
            {/* Collapse / expand caret — top-right, parallel to the name */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                background: "none", border: "none", padding: "2px 4px",
                cursor: "pointer", color: COLORS.textSecondary,
                display: "flex", alignItems: "center",
                marginTop: 1, flexShrink: 0,
              }}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          {!isCollapsed && hasMultipleVariants && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenVariantMenu(); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                background: "none", border: "none", padding: "3px 0 0",
                cursor: "pointer", color: COLORS.textSecondary,
                fontSize: 12, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span>{exercise.variant.label}</span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {/* Collapsed summary line */}
          {isCollapsed && (
            <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>
              {exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"} · {exercise.sets.filter((s) => s.done).length} done
            </div>
          )}
        </div>

        {!isCollapsed && (
          <>
            {/* Column headers */}
            <div style={{
              display: "flex", alignItems: "center", padding: "0 4px 6px",
              color: COLORS.textSecondary, fontSize: 10,
              textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500,
            }}>
              <span style={{ width: 30, textAlign: "center" }}>Set</span>
              <span style={{ flex: 1, textAlign: "center" }}>Prev</span>
              <span style={{ flex: 1, textAlign: "center" }}>lbs</span>
              <span style={{ flex: 1, textAlign: "center" }}>Reps</span>
              <span style={{ width: 32, display: "flex", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>

            {/* Set rows */}
            {(() => {
              let workingCount = 0;
              return exercise.sets.map((set, idx) => {
                if (set.type !== "warmup") workingCount += 1;
                const setLabel = setNumberDisplay(set, workingCount);
                const prevSet = lastSession ? lastSession.sets[Math.min(idx, lastSession.sets.length - 1)] : null;
                const weightActive = fieldIsActive(idx, "weight");
                const repsActive = fieldIsActive(idx, "reps");

                // Display values: per-field placeholder logic. If the
                // field has a real value, show it. Otherwise if the field
                // is a placeholder, show the placeholder value in gray.
                // If neither (no history, nothing typed), show an em-dash
                // so the field has content and doesn't collapse visually.
                const displayWeight =
                  set.weight !== "" && set.weight != null ? String(set.weight) :
                  set.weightIsPlaceholder && set.placeholderWeight !== "" && set.placeholderWeight != null ? String(set.placeholderWeight) :
                  "—";
                const displayReps =
                  set.reps !== "" && set.reps != null ? String(set.reps) :
                  set.repsIsPlaceholder && set.placeholderReps !== "" && set.placeholderReps != null ? String(set.placeholderReps) :
                  "—";

                const weightIsRealValue = set.weight !== "" && set.weight != null;
                const repsIsRealValue = set.reps !== "" && set.reps != null;

                const setDragOffset = setDrags[idx] || 0;

                return (
                  <div key={idx} ref={(node) => registerSetRef(idx, node)}>
                    {/* Clipped wrapper — contains the swipeable row + its
                        action layer ONLY. overflow:hidden ensures the
                        delete layer is invisible until the row is
                        actually dragged left. */}
                    <div style={{
                      position: "relative",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}>
                      {/* Full-swipe action layer — red surface that fades
                          in proportional to drag distance. No button: the
                          gesture itself triggers the delete on release if
                          the drag passes the threshold. */}
                      {(() => {
                        const dragAbs = Math.abs(setDragOffset);
                        // Fade red in over the first 60% of the threshold,
                        // hit full intensity at the threshold itself.
                        const intensity = Math.min(1, dragAbs / SET_DELETE_THRESHOLD);
                        return (
                          <div style={{
                            position: "absolute", inset: 0,
                            background: `rgba(160, 30, 30, ${0.15 + intensity * 0.55})`,
                            opacity: dragAbs > 0 ? 1 : 0,
                            display: "flex", alignItems: "center", justifyContent: "flex-end",
                            paddingRight: 22, gap: 8,
                            color: intensity >= 1 ? "#FFFFFF" : "#FF8888",
                            fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
                            transition: dragAbs === 0 ? "opacity 0.2s" : "none",
                          }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                            </svg>
                            Delete
                          </div>
                        );
                      })()}

                      <div
                        onPointerDown={onSetPointerDown(idx)}
                        onPointerMove={onSetPointerMove(idx)}
                        onPointerUp={onSetPointerUp(idx)}
                        onPointerCancel={onSetPointerUp(idx)}
                        style={{
                          position: "relative",
                          display: "flex", alignItems: "center",
                          padding: "8px 4px",
                          paddingLeft: 4,
                          background: COLORS.bg,
                          transform: `translateX(${setDragOffset}px)`,
                          transition: setDragRefs.current[idx]?.dragging ? "none" : "transform 0.22s ease",
                          borderLeft: `2.5px solid ${set.done ? COLORS.gold : "transparent"}`,
                        }}
                      >
                      {/* Set number / type indicator */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenSetTypePopover(idx); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{
                          width: 30, height: 30, background: "none", border: "none",
                          cursor: "pointer",
                          color: set.type === "warmup" ? COLORS.textSecondary : COLORS.text,
                          fontSize: 14, fontWeight: 600, padding: 0,
                        }}
                      >
                        {setLabel}
                      </button>

                      {/* Previous reference. Bodyweight variants show reps
                          only — weight is meaningless or zero on most prev
                          rows and clutters the column. If the user logged
                          added weight on the prev set, fall back to the
                          weighted format so the signal isn't lost. */}
                      <span style={{
                        flex: 1, color: COLORS.textSecondary,
                        fontSize: 12, textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {(() => {
                          if (!prevSet) return "—";
                          const isBw = isBodyweightVariant(exercise.variant);
                          const hasWeight = prevSet.weight !== "" && prevSet.weight != null && prevSet.weight !== 0;
                          if (isBw && !hasWeight) return `${prevSet.reps}`;
                          return `${prevSet.weight}×${prevSet.reps}`;
                        })()}
                      </span>

                      {/* Weight tap-target */}
                      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Tap-twice on desktop: if already focused and value
                            // exists, the second tap positions caret based on
                            // click X within the button.
                            if (fieldIsActive(idx, "weight") && caretPos === -1) {
                              const valueStr = String(set.weight ?? "");
                              if (valueStr.length > 0) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const ratio = Math.max(0, Math.min(1, x / rect.width));
                                const pos = Math.round(ratio * valueStr.length);
                                setCaretPos(pos);
                                return;
                              }
                            }
                            onFocusField(idx, "weight");
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerMove={onFieldPointerMove(idx, "weight", String(set.weight ?? ""))}
                          style={{
                            width: 56, minHeight: 28, padding: "6px 0", textAlign: "center",
                            background: weightActive
                              ? (caretPos === -1 ? COLORS.gold : "#1A1A1A")
                              : (set.done ? "transparent" : "#1A1A1A"),
                            border: `1.5px solid ${
                              shakeFields[`${idx}:weight`]
                                ? "#B0302E"
                                : weightActive
                                  ? COLORS.gold
                                  : (set.done ? "transparent" : "#252525")
                            }`,
                            borderRadius: 7, cursor: "pointer",
                            color: weightActive && caretPos === -1
                              ? COLORS.bg
                              : (set.weightIsPlaceholder || !weightIsRealValue ? COLORS.inactive : COLORS.text),
                            fontSize: 14, fontWeight: 500,
                            fontVariantNumeric: "tabular-nums",
                            position: "relative", touchAction: "none",
                            animation: shakeFields[`${idx}:weight`] ? "shakeField 0.5s" : "none",
                          }}
                        >
                          {displayWeight}
                          {weightActive && caretPos !== -1 && (() => {
                            // Pixel-based caret positioning. The button is
                            // 56px wide. Text uses tabular-nums at 14px,
                            // so each digit is ~9px wide. Text is centered.
                            // Caret at position p sits at:
                            //   leftPad + p * charWidth
                            // where leftPad = (buttonWidth - textWidth) / 2.
                            const charWidth = 9;
                            const buttonWidth = 56;
                            const textWidth = displayWeight.length * charWidth;
                            const leftPad = (buttonWidth - textWidth) / 2;
                            const caretX = leftPad + caretPos * charWidth;
                            return (
                              <span style={{
                                position: "absolute", top: "50%",
                                left: `${caretX}px`,
                                transform: "translateY(-50%)",
                                width: 1.5, height: 16, background: COLORS.gold,
                                animation: "blink 1s step-end infinite",
                              }} />
                            );
                          })()}
                          {weightActive && caretPos === -1 && !weightIsRealValue && !set.weightIsPlaceholder && (
                            <span style={{
                              position: "absolute", top: "50%", left: "50%",
                              transform: "translate(-50%,-50%)",
                              width: 1.5, height: 16, background: COLORS.bg,
                              animation: "blink 1s step-end infinite",
                            }} />
                          )}
                        </button>
                      </div>

                      {/* Reps tap-target */}
                      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (fieldIsActive(idx, "reps") && caretPos === -1) {
                              const valueStr = String(set.reps ?? "");
                              if (valueStr.length > 0) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const ratio = Math.max(0, Math.min(1, x / rect.width));
                                const pos = Math.round(ratio * valueStr.length);
                                setCaretPos(pos);
                                return;
                              }
                            }
                            onFocusField(idx, "reps");
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerMove={onFieldPointerMove(idx, "reps", String(set.reps ?? ""))}
                          style={{
                            width: 56, minHeight: 28, padding: "6px 0", textAlign: "center",
                            background: repsActive
                              ? (caretPos === -1 ? COLORS.gold : "#1A1A1A")
                              : (set.done ? "transparent" : "#1A1A1A"),
                            border: `1.5px solid ${
                              shakeFields[`${idx}:reps`]
                                ? "#B0302E"
                                : repsActive
                                  ? COLORS.gold
                                  : (set.done ? "transparent" : "#252525")
                            }`,
                            borderRadius: 7, cursor: "pointer",
                            color: repsActive && caretPos === -1
                              ? COLORS.bg
                              : (set.repsIsPlaceholder || !repsIsRealValue ? COLORS.inactive : COLORS.text),
                            fontSize: 14, fontWeight: 500,
                            fontVariantNumeric: "tabular-nums",
                            position: "relative", touchAction: "none",
                            animation: shakeFields[`${idx}:reps`] ? "shakeField 0.5s" : "none",
                          }}
                        >
                          {displayReps}
                          {repsActive && caretPos !== -1 && (() => {
                            const charWidth = 9;
                            const buttonWidth = 56;
                            const textWidth = displayReps.length * charWidth;
                            const leftPad = (buttonWidth - textWidth) / 2;
                            const caretX = leftPad + caretPos * charWidth;
                            return (
                              <span style={{
                                position: "absolute", top: "50%",
                                left: `${caretX}px`,
                                transform: "translateY(-50%)",
                                width: 1.5, height: 16, background: COLORS.gold,
                                animation: "blink 1s step-end infinite",
                              }} />
                            );
                          })()}
                          {repsActive && caretPos === -1 && !repsIsRealValue && !set.repsIsPlaceholder && (
                            <span style={{
                              position: "absolute", top: "50%", left: "50%",
                              transform: "translate(-50%,-50%)",
                              width: 1.5, height: 16, background: COLORS.bg,
                              animation: "blink 1s step-end infinite",
                            }} />
                          )}
                        </button>
                      </div>

                      {/* Done checkbox. Gated: tapping with empty reps (or
                          weight, on non-bodyweight variants) shakes the empty
                          field(s) instead of toggling. A field counts as empty
                          if it has neither a real value nor a placeholder. For
                          bodyweight variants the lbs field is optional — the
                          user can leave it blank and the set still completes. */}
                      <div style={{ width: 32, display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Allow un-checking a set regardless of field state
                            if (set.done) { onToggleSetDone(idx); return; }
                            const isBw = isBodyweightVariant(exercise.variant);
                            const weightReady =
                              isBw ||
                              (set.weight !== "" && set.weight != null) ||
                              (set.weightIsPlaceholder && set.placeholderWeight !== "" && set.placeholderWeight != null);
                            const repsReady =
                              (set.reps !== "" && set.reps != null) ||
                              (set.repsIsPlaceholder && set.placeholderReps !== "" && set.placeholderReps != null);
                            if (!weightReady || !repsReady) {
                              const empties = [];
                              if (!weightReady) empties.push("weight");
                              if (!repsReady) empties.push("reps");
                              triggerShake(idx, empties);
                              return;
                            }
                            onToggleSetDone(idx);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          style={{
                            width: 26, height: 26, borderRadius: 6,
                            border: `1.5px solid ${set.done ? COLORS.gold : "#333"}`,
                            background: set.done ? COLORS.gold : "transparent",
                            cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          <svg
                            width="14" height="14" viewBox="0 0 24 24"
                            fill="none"
                            stroke={set.done ? COLORS.bg : COLORS.inactive}
                            strokeWidth={set.done ? "3" : "2.2"}
                            style={{ opacity: set.done ? 1 : 0.35 }}
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </div>
                      </div>
                    </div>

                    {/* RIR — small inline tag, right-aligned. Only RIR
                        lives here now; rested has its own divider format
                        below. */}
                    {set.rir != null && (
                      <div style={{
                        display: "flex", justifyContent: "flex-end", alignItems: "center",
                        padding: "1px 6px 1px",
                        color: COLORS.gold, fontSize: 9,
                        fontWeight: 500, letterSpacing: 0.3,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        RIR {set.rir}
                      </div>
                    )}

                    {/* Live rest timer — only one across the whole logger.
                        Mounts only when this exact set is the rest anchor. */}
                    {restTimer && restTimer.exerciseUid === exercise.uid &&
                     restTimer.setIdx === idx && (
                      <InlineRestTimer
                        startTs={restTimer.startTs}
                        mode={restTimerMode}
                        countdownTarget={restCountdownTarget}
                        onDismiss={onClearRestTimer}
                      />
                    )}

                    {/* Saved rest divider — replaces the live timer once
                        a subsequent set is checked. Format: ── 1:24 ──
                        (gray lines flanking a centered gold time). Skinny
                        and unobtrusive, sits between consecutive set rows.
                        Swipeable to delete (clears restAfterSec on this set). */}
                    {set.restAfterSec != null &&
                     !(restTimer && restTimer.exerciseUid === exercise.uid && restTimer.setIdx === idx) && (
                      <SwipeableRestDivider
                        seconds={set.restAfterSec}
                        onDelete={() => onUpdateSet(idx, { restAfterSec: undefined })}
                      />
                    )}
                  </div>
                );
              });
            })()}

            {/* Add set button — skinny, full-width, matches rest divider density */}
            <button
              onClick={onAddSet}
              style={{
                width: "100%", marginTop: 6, padding: "3px 0",
                background: "transparent", border: `1px dashed #2A2A2A`,
                borderRadius: 5, color: COLORS.textSecondary, fontSize: 10,
                fontWeight: 500, cursor: "pointer", letterSpacing: 0.3,
              }}
            >
              + Add Set
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Swipeable Rest Divider ──────────────────────────────────────
   The skinny ── 1:24 ── divider that sits between completed sets
   showing how long the user rested. Swipe left past threshold to
   delete (clears the set's restAfterSec). */
function SwipeableRestDivider({ seconds, onDelete }) {
  const DELETE_THRESHOLD = 200;
  const MAX_DRAG = 280;
  const [drag, setDrag] = useState(0);
  const dragRef = useRef({ startX: 0, dragging: false });
  const onPointerDown = (e) => {
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, dragging: true };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    let next = dx;
    if (next > 0) next = 0;
    if (next < -MAX_DRAG) next = -MAX_DRAG;
    setDrag(next);
  };
  const onPointerUp = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (drag <= -DELETE_THRESHOLD) {
      setDrag(0);
      onDelete && onDelete();
    } else {
      setDrag(0);
    }
  };

  const dragAbs = Math.abs(drag);
  const intensity = Math.min(1, dragAbs / DELETE_THRESHOLD);

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      marginTop: -1, marginBottom: -1,
    }}>
      {/* Red fade action layer */}
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(160, 30, 30, ${0.15 + intensity * 0.55})`,
        opacity: dragAbs > 0 ? 1 : 0,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        paddingRight: 22, gap: 6,
        color: intensity >= 1 ? "#FFFFFF" : "#FF8888",
        fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
        transition: dragAbs === 0 ? "opacity 0.2s" : "none",
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        </svg>
        Delete
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: "flex", alignItems: "center",
          padding: "0px 6px",
          gap: 8,
          background: COLORS.bg,
          transform: `translateX(${drag}px)`,
          transition: dragRef.current.dragging ? "none" : "transform 0.22s ease",
          touchAction: "pan-y", userSelect: "none",
          position: "relative",
          cursor: "grab",
        }}
      >
        <div style={{ flex: 1, height: 1, background: "#2A2A2A" }} />
        <span style={{
          color: COLORS.gold, fontSize: 10, fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0.3,
        }}>
          {formatDuration(seconds)}
        </span>
        <div style={{ flex: 1, height: 1, background: "#2A2A2A" }} />
      </div>
    </div>
  );
}

/* ── Inline Rest Timer ────────────────────────────────────────────
   Singleton — only one instance ever mounts (anchored to whichever set
   was most recently checked). Counts based on a startTs prop so the
   elapsed value survives re-renders without resetting. Swipeable left
   to dismiss. */
function InlineRestTimer({ startTs, mode, countdownTarget, onDismiss }) {
  // countdownTarget comes in as seconds (App-level pref). Default 90 if
  // somehow undefined, but the prop should always be supplied by the parent.
  const COUNTDOWN_TARGET = typeof countdownTarget === "number" && countdownTarget > 0 ? countdownTarget : 90;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Same full-swipe-to-delete pattern as set rows: drag freely, release
  // past threshold deletes the timer; otherwise snaps back. Red fade
  // builds proportional to drag distance.
  const DELETE_THRESHOLD = 200;
  const MAX_DRAG = 280;
  const [drag, setDrag] = useState(0);
  const dragRef = useRef({ startX: 0, dragging: false });
  const onPointerDown = (e) => {
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, dragging: true };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    let next = dx;
    if (next > 0) next = 0;
    if (next < -MAX_DRAG) next = -MAX_DRAG;
    setDrag(next);
  };
  const onPointerUp = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (drag <= -DELETE_THRESHOLD) {
      setDrag(0);
      onDismiss && onDismiss();
    } else {
      setDrag(0);
    }
  };

  const sec = Math.max(0, Math.floor((now - startTs) / 1000));
  let display, color;
  if (mode === "countup") {
    display = formatDuration(sec);
    color = COLORS.gold;
  } else {
    const remaining = COUNTDOWN_TARGET - sec;
    if (remaining <= 0) {
      display = "Time!";
      color = COLORS.gold;
    } else {
      display = formatDuration(remaining);
      color = COLORS.gold;
    }
  }

  const dragAbs = Math.abs(drag);
  const intensity = Math.min(1, dragAbs / DELETE_THRESHOLD);

  return (
    <div style={{
      position: "relative", margin: "2px 4px 4px",
      borderRadius: 6, overflow: "hidden",
    }}>
      {/* Red fade action layer */}
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(160, 30, 30, ${0.15 + intensity * 0.55})`,
        opacity: dragAbs > 0 ? 1 : 0,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        paddingRight: 22, gap: 8,
        color: intensity >= 1 ? "#FFFFFF" : "#FF8888",
        fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
        transition: dragAbs === 0 ? "opacity 0.2s" : "none",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        </svg>
        Delete
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "6px 0",
          background: COLORS.bg,
          color, fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          transform: `translateX(${drag}px)`,
          transition: dragRef.current.dragging ? "none" : "transform 0.22s ease",
          touchAction: "pan-y", userSelect: "none",
          position: "relative",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="13" r="8" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="13" x2="15" y2="15" />
        </svg>
        Rest · {display}
      </div>
    </div>
  );
}

/* ── Custom Duration Modal ────────────────────────────────────────
   Lightweight modal for entering a custom countdown duration (mm:ss).
   Two tappable fields and a self-contained mini-keypad. Self-contained
   rather than reusing NumericKeypad because that component is tightly
   coupled to set-row weight/reps state. Validates: total seconds must
   be > 0 and < 600 (9:59 max). Digit entry appends to the focused field
   (capped at 2 digits per field; seconds capped at 59). */
function CustomDurationModal({ initialSeconds, onCancel, onConfirm }) {
  const initMin = Math.floor(initialSeconds / 60);
  const initSec = initialSeconds % 60;
  const [minStr, setMinStr] = useState(String(initMin));
  const [secStr, setSecStr] = useState(String(initSec).padStart(2, "0"));
  const [focused, setFocused] = useState("min"); // "min" | "sec"

  const totalSeconds = (parseInt(minStr || "0", 10) || 0) * 60 + (parseInt(secStr || "0", 10) || 0);
  const isValid = totalSeconds > 0 && totalSeconds < 600;

  // Tapping a digit appends to the focused field. Min caps at 9 (single digit;
  // 10+ minutes is the long-rest case but we cap at 9:59 = 599s). Sec caps at
  // 59. When a field reaches its cap, focus auto-advances to the next field.
  const handleDigit = (d) => {
    if (focused === "min") {
      // Replace if currently "0", else append. Cap at one digit (0-9).
      const next = minStr === "0" ? String(d) : (minStr.length >= 1 ? String(d) : minStr + String(d));
      setMinStr(next);
      // Auto-advance to seconds after typing the minutes digit
      setFocused("sec");
      // When advancing, clear the seconds so the user can type fresh
      setSecStr("");
    } else {
      // Append to seconds. Cap at 2 digits; reject if would push > 59.
      const candidate = secStr.length >= 2 ? String(d) : (secStr === "0" || secStr === "00" ? String(d) : secStr + String(d));
      if (parseInt(candidate, 10) > 59) {
        // Replace with just the digit instead of appending
        setSecStr(String(d));
      } else {
        setSecStr(candidate);
      }
    }
  };

  const handleBackspace = () => {
    if (focused === "min") {
      setMinStr("0");
    } else {
      if (secStr.length > 1) {
        setSecStr(secStr.slice(0, -1));
      } else {
        setSecStr("0");
        // Move focus back to minutes
        setFocused("min");
      }
    }
  };

  const handleSave = () => {
    if (!isValid) return;
    onConfirm(totalSeconds);
  };

  // Field display: minutes shows as-is; seconds left-pads to 2 digits when not focused
  // so "1:30" reads naturally. While focused on seconds, show what user typed (e.g. "3"
  // before they finish typing "30").
  const minDisplay = minStr || "0";
  const secDisplay = focused === "sec" ? (secStr || "0") : String(parseInt(secStr || "0", 10)).padStart(2, "0");

  const fieldStyle = (isFocused) => ({
    flex: 1, padding: "16px 0", borderRadius: 8,
    background: isFocused ? COLORS.goldHighlight : COLORS.bg,
    border: `1.5px solid ${isFocused ? COLORS.gold : COLORS.border}`,
    cursor: "pointer",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 36, fontWeight: 700,
    color: isFocused ? COLORS.gold : COLORS.text,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    transition: "all 0.15s ease",
  });

  const digitBtnStyle = {
    padding: "14px 0", borderRadius: 8,
    background: "#2A2A2A", border: "none",
    color: COLORS.text, fontSize: 20, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <>
      {/* Scrim — taps outside cancel */}
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
      {/* Modal card */}
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        zIndex: 101,
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
        padding: 18, width: 280, maxWidth: "calc(100vw - 32px)",
      }}>
        <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 4 }}>
          Custom Duration
        </div>
        <div style={{ color: COLORS.textSecondary, fontSize: 11, textAlign: "center", marginBottom: 14 }}>
          Up to 9:59
        </div>

        {/* Fields */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <button onClick={() => setFocused("min")} style={fieldStyle(focused === "min")}>{minDisplay}</button>
          <div style={{ fontSize: 32, color: COLORS.textSecondary, fontWeight: 700, lineHeight: 1 }}>:</div>
          <button onClick={() => setFocused("sec")} style={fieldStyle(focused === "sec")}>{secDisplay}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, textAlign: "center", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>min</div>
          <div style={{ width: 12 }} />
          <div style={{ flex: 1, textAlign: "center", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>sec</div>
        </div>

        {/* Mini keypad — 3x4 grid: 1-9, then 0 and backspace in the bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => handleDigit(d)} style={digitBtnStyle}>{d}</button>
          ))}
          <div /> {/* spacer for 7-8-9 → 0-bksp layout */}
          <button onClick={() => handleDigit(0)} style={digitBtnStyle}>0</button>
          <button onClick={handleBackspace} style={{ ...digitBtnStyle, fontSize: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle" }}>
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 8,
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.text, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 8,
              background: isValid ? COLORS.gold : COLORS.border,
              border: "none",
              color: isValid ? "#000" : COLORS.textSecondary,
              fontSize: 14, fontWeight: 700,
              cursor: isValid ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              opacity: isValid ? 1 : 0.6,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Numeric Keypad ───────────────────────────────────────────────
   Custom in-app numeric pad that replaces the native keyboard for
   weight/reps editing. Mounts at the bottom of the workout tab when a
   field is focused, pushes content up via paddingBottom on the scroll
   container. Includes:
   - 1-9 / 0 digit pad
   - backspace, +/- step (rapid-tick on hold)
   - RIR button → opens a small RIR popover
   - Next button → advances focus per the parent's nextField logic
   - Done link → dismisses the keypad
*/
function NumericKeypad({
  field, value, rir, stepSize,
  onDigit, onBackspace, onStep, onRir, onNext, onOpenRirHelp,
}) {
  const [rirOpen, setRirOpen] = useState(false);

  // Rapid-tick on +/- hold
  const tickRef = useRef({ timeout: null, interval: null });
  const startStep = (delta) => {
    onStep(delta);
    tickRef.current.timeout = setTimeout(() => {
      tickRef.current.interval = setInterval(() => onStep(delta), 80);
    }, 380);
  };
  const stopStep = () => {
    if (tickRef.current.timeout) clearTimeout(tickRef.current.timeout);
    if (tickRef.current.interval) clearInterval(tickRef.current.interval);
    tickRef.current.timeout = null;
    tickRef.current.interval = null;
  };
  useEffect(() => () => stopStep(), []);

  // Per-button press state for visual tap feedback. Without this the keypad
  // is silent on tap — no haptic on web, no pseudo-class :active on most
  // mobile browsers reliably. We track pressed locally and flash the bg.
  // Real haptic feedback ships with the React Native port via expo-haptics.
  const Btn = ({ children, onClick, style: s = {}, onPointerDown: pd, onPointerUp: pu }) => {
    const [pressed, setPressed] = useState(false);
    const baseBg = s.background || "#1A1A1A";
    const baseBorder = s.border || `1px solid #252525`;
    // Pressed visuals: lift bg one notch toward gold-tinted, brighten border.
    // Stays subtle on the gold "Next" button (already bright) and gold RIR
    // (already accented) — for those we just dim slightly instead.
    const isAccent = baseBg === COLORS.gold || baseBg === "#1A1A0A";
    const pressedBg = isAccent ? baseBg : "#2A2A2A";
    const pressedBorder = isAccent ? baseBorder : `1px solid ${COLORS.gold}`;
    return (
      <button
        onClick={onClick}
        onPointerDown={(e) => { setPressed(true); if (pd) pd(e); }}
        onPointerUp={(e) => { setPressed(false); if (pu) pu(e); }}
        onPointerLeave={(e) => { setPressed(false); if (pu) pu(e); }}
        onPointerCancel={(e) => { setPressed(false); if (pu) pu(e); }}
        style={{
          height: 46, background: "#1A1A1A", border: `1px solid #252525`,
          borderRadius: 10, color: COLORS.text, fontSize: 18, fontWeight: 500,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.08s ease, border-color 0.08s ease, transform 0.08s ease",
          WebkitTapHighlightColor: "transparent",
          ...s,
          // Pressed overrides go after spread so they win against incoming style.
          ...(pressed ? {
            background: pressedBg,
            border: pressedBorder,
            transform: "scale(0.96)",
          } : {}),
        }}
      >
        {children}
      </button>
    );
  };

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40,
      background: "#0E0E0E", borderTop: `1px solid ${COLORS.border}`,
      padding: "8px 12px 12px",
      boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
    }}>
      {/* 4×4 grid: digits left 3 cols, actions right col */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 6,
      }}>
        <Btn onClick={() => onDigit("1")}>1</Btn>
        <Btn onClick={() => onDigit("2")}>2</Btn>
        <Btn onClick={() => onDigit("3")}>3</Btn>
        <Btn onClick={onBackspace}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.text} strokeWidth="2">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </Btn>

        <Btn onClick={() => onDigit("4")}>4</Btn>
        <Btn onClick={() => onDigit("5")}>5</Btn>
        <Btn onClick={() => onDigit("6")}>6</Btn>
        <Btn
          onPointerDown={() => startStep(stepSize)}
          onPointerUp={stopStep}
          onClick={() => {}}
        >+</Btn>

        <Btn onClick={() => onDigit("7")}>7</Btn>
        <Btn onClick={() => onDigit("8")}>8</Btn>
        <Btn onClick={() => onDigit("9")}>9</Btn>
        <Btn
          onPointerDown={() => startStep(-stepSize)}
          onPointerUp={stopStep}
          onClick={() => {}}
        >−</Btn>

        {/* Bottom row: RIR (small), 0, Next (gold) */}
        <Btn
          onClick={() => setRirOpen(true)}
          style={{
            fontSize: 12, fontWeight: 600,
            color: rir != null ? COLORS.gold : COLORS.textSecondary,
            background: rir != null ? "#1A1A0A" : "#1A1A1A",
            border: `1px solid ${rir != null ? COLORS.gold : "#252525"}`,
          }}
        >
          RIR{rir != null ? ` ${rir}` : ""}
        </Btn>
        <Btn onClick={() => onDigit("0")} style={{ gridColumn: "span 2" }}>0</Btn>
        <Btn
          onClick={onNext}
          style={{ background: COLORS.gold, color: COLORS.bg, fontWeight: 700, border: "none" }}
        >
          Next
        </Btn>
      </div>

      {/* RIR picker popover (anchored above the keypad) */}
      {rirOpen && (
        <>
          <div onClick={() => setRirOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <div style={{
            position: "absolute", left: 12, right: 12, bottom: "100%",
            marginBottom: 8, zIndex: 42,
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: 10,
            boxShadow: "0 -8px 24px rgba(0,0,0,0.6)",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "2px 4px 8px",
            }}>
              <span style={{ color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>
                Reps in Reserve
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenRirHelp(); }}
                style={{
                  background: "none", border: `1px solid ${COLORS.gold}`,
                  borderRadius: 10, width: 18, height: 18,
                  color: COLORS.gold, fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0, fontWeight: 600,
                }}
              >?</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[0, 1, 2, 3, "4+"].map((opt) => {
                const val = opt === "4+" ? 4 : opt;
                const isActive = rir === val || (opt === "4+" && rir === 4);
                return (
                  <button
                    key={opt}
                    onClick={() => { onRir(val); setRirOpen(false); }}
                    style={{
                      padding: "10px 0", borderRadius: 8,
                      background: isActive ? COLORS.goldHighlight : "#1A1A1A",
                      border: `1px solid ${isActive ? COLORS.gold : "#252525"}`,
                      color: isActive ? COLORS.gold : COLORS.text,
                      fontSize: 14, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Session Bar ──────────────────────────────────────────────────
   Slim persistent bar that lives above the TabBar whenever an active
   workout exists AND (the user is not on the workout tab OR the workout
   is minimized). Tap → un-minimize and switch to the workout tab. */
function SessionBar({ workout, restTimerMode, restCountdownTarget, onTap }) {
  const [elapsed, setElapsed] = useState(0);
  const [restElapsed, setRestElapsed] = useState(0);
  useEffect(() => {
    if (!workout) return;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - workout.startTime.getTime()) / 1000));
      if (workout.restTimer) {
        setRestElapsed(Math.floor((Date.now() - workout.restTimer.startTs) / 1000));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout]);

  if (!workout) return null;

  // Compute rest timer display if active. mode + target are now App-level
  // prefs threaded through from App.
  let restPill = null;
  if (workout.restTimer) {
    const target = typeof restCountdownTarget === "number" && restCountdownTarget > 0 ? restCountdownTarget : 90;
    let display, isCountdown = restTimerMode === "countdown";
    if (isCountdown) {
      const remaining = target - restElapsed;
      display = remaining <= 0 ? "Time!" : formatDuration(remaining);
    } else {
      display = formatDuration(restElapsed);
    }
    restPill = display;
  }

  return (
    <button
      onClick={onTap}
      style={{
        flexShrink: 0, width: "100%", padding: "10px 18px",
        height: 52, boxSizing: "border-box",
        background: "#161616", border: "none", borderTop: `1px solid ${COLORS.gold}`,
        cursor: "pointer", display: "flex", alignItems: "center",
        gap: 12, textAlign: "left",
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: 4, background: COLORS.gold,
        boxShadow: "0 0 8px rgba(255,215,0,0.6)", flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: COLORS.text, fontSize: 13, fontWeight: 600,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {workout.workoutName || "Active Workout"}
        </div>
        <div style={{
          color: COLORS.gold, fontSize: 11, fontWeight: 500,
          fontVariantNumeric: "tabular-nums", marginTop: 1,
        }}>
          {formatDuration(elapsed)} · {workout.exercises.length} {workout.exercises.length === 1 ? "exercise" : "exercises"}
        </div>
      </div>
      {/* Rest timer pill — only shows when a rest timer is active */}
      {restPill && (
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 12,
          background: "#1A1A0A", border: `1px solid ${COLORS.gold}`,
          color: COLORS.gold, fontSize: 11, fontWeight: 600,
          fontVariantNumeric: "tabular-nums", flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="13" r="8" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="13" x2="15" y2="15" />
          </svg>
          {restPill}
        </div>
      )}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

/* ── Add Exercise Sheet ───────────────────────────────────────────
   Full-screen picker overlay summoned from the active logger's
   "+ Add Exercise" button. Two stages: list (search + filter + my-equipment)
   and variant confirm. Mirrors the patterns from ExercisesTab and
   ExerciseDetailSheet so it feels familiar, but ends in addExercise(). */
function AddExerciseSheet({ userEquipment, customExercises = [], workoutHistory = [], onClose, onAdd }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Stage 2: variant confirm
  const [pendingExId, setPendingExId] = useState(null);
  const pendingEx = pendingExId ? findExerciseById(pendingExId, customExercises) : null;
  const [pendingVariant, setPendingVariant] = useState(null);
  useEffect(() => {
    if (pendingEx) setPendingVariant(pickDefaultVariant(pendingEx, userEquipment, workoutHistory, customExercises));
  }, [pendingExId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio"];

  const base = getExercisesForFilter(filter, customExercises);
  const filtered = base.filter((e) => {
    if (search && !exerciseMatchesSearch(e, search)) return false;
    if (onlyMine && !exerciseHasAnyAvailableVariant(e, userEquipment)) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop dim */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 30 }} />

      {/* Sheet — covers ~92% of the tab */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "92%",
        zIndex: 31, background: COLORS.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${COLORS.border}`, borderBottom: "none",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.7)",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>

        {pendingEx ? (
          /* ── Stage 2: Variant confirm ── */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 20px 20px" }}>
            <button
              onClick={() => setPendingExId(null)}
              style={{
                background: "none", border: "none", padding: "4px 0",
                color: COLORS.textSecondary, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              Back to library
            </button>
            <h3 style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 22, color: COLORS.text, margin: "16px 0 6px",
              fontWeight: 400, textAlign: "center",
            }}>{pendingEx.name}</h3>
            <div style={{ color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 20 }}>
              {pendingEx.primary} · {pendingEx.type}
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 500 }}>
              Choose Variant
            </div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
              {pendingEx.variants.map((v, i) => {
                const isActive = pendingVariant && variantKey(pendingVariant) === variantKey(v);
                return (
                  <button
                    key={i}
                    onClick={() => setPendingVariant(v)}
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 10,
                      background: isActive ? COLORS.goldHighlight : COLORS.card,
                      border: `1px solid ${isActive ? COLORS.gold : COLORS.border}`,
                      cursor: "pointer", textAlign: "left", marginBottom: 8,
                      color: isActive ? COLORS.gold : COLORS.text, fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span>{v.label}</span>
                    {isActive && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                );
              })}
            </div>
            <GoldButton
              onClick={() => { if (pendingVariant) onAdd(pendingEx, pendingVariant); }}
              style={{ padding: "14px 24px" }}
            >
              Add to Workout
            </GoldButton>
          </div>
        ) : (
          /* ── Stage 1: Library list ── */
          <>
            <div style={{ padding: "4px 20px 0", flexShrink: 0 }}>
              <h3 style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 20, color: COLORS.text, margin: "0 0 12px",
                fontWeight: 400, textAlign: "center",
              }}>Add Exercise</h3>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises..."
                style={{
                  width: "100%", padding: "9px 14px",
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.text, fontSize: 14, outline: "none",
                  boxSizing: "border-box", marginBottom: 10,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
                <button
                  onClick={() => setMenuOpen(true)}
                  style={{
                    padding: "7px 12px", borderRadius: 20,
                    border: `1px solid ${filter === "All" ? COLORS.border : COLORS.gold}`,
                    background: filter === "All" ? "transparent" : COLORS.goldHighlight,
                    color: filter === "All" ? COLORS.textSecondary : COLORS.gold,
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>{filter === "All" ? "Any Body Part" : filter}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button
                  onClick={() => setOnlyMine(!onlyMine)}
                  style={{
                    padding: "7px 12px", borderRadius: 20,
                    border: `1px solid ${onlyMine ? COLORS.gold : COLORS.border}`,
                    background: onlyMine ? COLORS.goldHighlight : "transparent",
                    color: onlyMine ? COLORS.gold : COLORS.textSecondary,
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: onlyMine ? COLORS.gold : COLORS.inactive }} />
                  {onlyMine ? "My Equipment" : "All Exercises"}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, padding: "4px 20px 16px", overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", color: COLORS.textSecondary, fontSize: 13, padding: "32px 20px" }}>
                  No exercises found.
                </div>
              )}
              {filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setPendingExId(e.id)}
                  style={{
                    width: "100%", padding: "14px 0",
                    display: "flex", alignItems: "center", gap: 14,
                    background: "none", border: "none",
                    borderBottom: `1px solid ${COLORS.border}`,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <ExerciseThumbnail size={52} monogram={e.isCustom ? e.name.charAt(0) : undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                    <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>{e.primary}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              ))}
            </div>

            {/* Body part filter dropdown */}
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
                <div style={{
                  position: "absolute", top: 130, left: 20, zIndex: 41,
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                  minWidth: 180, padding: 6,
                }}>
                  {groups.map((g) => {
                    const label = g === "All" ? "Any Body Part" : g;
                    const isActive = g === filter;
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setFilter(isActive && g !== "All" ? "All" : g);
                          setMenuOpen(false);
                        }}
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: 8,
                          background: isActive ? COLORS.goldHighlight : "transparent",
                          border: "none", cursor: "pointer", textAlign: "left",
                          color: isActive ? COLORS.gold : COLORS.text,
                          fontSize: 13, fontWeight: isActive ? 600 : 400,
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}
                      >
                        <span>{label}</span>
                        {isActive && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── History Recap Sheet ──────────────────────────────────────────
   Bottom sheet shown when tapping a history card. Shows full session
   detail: every exercise, every set with weight/reps and type marker.
   "Repeat This Workout" CTA is reserved for a future phase. */
function HistoryRecapSheet({ session, onClose, onRepeat }) {
  if (!session) return null;
  const volume = totalVolumeFromExercises(session.exercises);
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 20 }} />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "85%",
        zIndex: 21, background: COLORS.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${COLORS.border}`, borderBottom: "none",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>
        <div style={{ padding: "6px 20px 14px", flexShrink: 0, textAlign: "center" }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 22, color: COLORS.text, margin: "0 0 4px", fontWeight: 400,
          }}>{session.name}</h2>
          <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>
            {formatShortDate(session.date)} · {Math.round(session.durationSec / 60)} min · {volume.toLocaleString()} lbs
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "0 20px 16px" }}>
          {session.exercises.map((ex, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{ex.name}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 8 }}>{ex.variantLabel}</div>
              {ex.sets.map((s, j) => {
                const t = SET_TYPES.find((x) => x.id === s.type);
                const marker = t && t.short ? t.short : (j + 1);
                return (
                  <div key={j} style={{
                    display: "flex", alignItems: "center", padding: "5px 0",
                    borderBottom: j < ex.sets.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 12,
                      border: `1px solid ${COLORS.border}`, color: s.type === "warmup" ? COLORS.textSecondary : COLORS.text,
                      fontSize: 11, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12,
                    }}>{marker}</span>
                    <span style={{ flex: 1, color: COLORS.text, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                      {hasMeaningfulWeight(s) ? `${s.weight} lbs × ${s.reps}` : `${s.reps} reps`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {/* Repeat This Workout — spawns a new active workout from this
              session's exercises with placeholders pulled from the user's
              most-recent log of each variant. If a workout is already
              active, App-level requestRepeatWorkout opens the conflict
              modal first. */}
          <button
            disabled={!onRepeat}
            onClick={() => { if (onRepeat) onRepeat(session); }}
            style={{
              width: "100%", padding: 14, marginTop: 8,
              background: COLORS.gold,
              border: `1.5px solid ${COLORS.gold}`,
              borderRadius: 10,
              color: "#000",
              fontSize: 14,
              fontWeight: 600,
              cursor: onRepeat ? "pointer" : "not-allowed",
            }}
          >
            Repeat This Workout
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Finish Summary Screen ────────────────────────────────────────
   STUB per Bible §6.2 — flagged for a dedicated design session. The real
   version should feel like a payoff: PRs broken, XP earned, streak update,
   total volume celebrated. For now this is an honest confirmation showing
   what got logged so the data committal is at least visible. */
function FinishSummaryScreen({ session, onDone, onDiscard }) {
  const volume = totalVolumeFromExercises(session.exercises);
  const totalSets = session.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const empty = session.exercises.length === 0;

  return (
    <div style={{ flex: 1, padding: "24px 24px 20px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32, background: COLORS.goldHighlight,
          border: `1.5px solid ${COLORS.gold}`, display: "flex", alignItems: "center",
          justifyContent: "center", margin: "20px auto 16px",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 24, color: COLORS.text, margin: "0 0 6px", fontWeight: 400,
        }}>{empty ? "Session Ended" : "Workout Complete"}</h2>
        <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>
          {empty ? "Nothing was logged this session." : session.name}
        </div>
      </div>

      {!empty && (
        <>
          {/* Stat row — duration, volume, sets */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[
              { label: "Duration", value: formatDuration(session.durationSec) },
              { label: "Volume",   value: `${volume.toLocaleString()} lbs` },
              { label: "Sets",     value: String(totalSets) },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "12px 8px", textAlign: "center",
              }}>
                <div style={{ color: COLORS.gold, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Per-exercise summary */}
          <div style={{ color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 500, marginBottom: 8 }}>
            Logged
          </div>
          <div style={{ flex: 1, marginBottom: 16 }}>
            {session.exercises.map((ex, i) => {
              const top = sessionTopSet(ex.sets);
              return (
                <div key={i} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "10px 14px", marginBottom: 6,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.name}</div>
                    <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>{ex.variantLabel}</div>
                  </div>
                  <div style={{ color: COLORS.textSecondary, fontSize: 11, marginLeft: 8, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {ex.sets.length} sets · Max: {formatSetSummary(top)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Note: this screen is a stub per Bible §6.2. Full design pass coming. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        <GoldButton onClick={onDone}>Done</GoldButton>
        {empty && (
          <button
            onClick={onDiscard}
            style={{
              width: "100%", padding: "12px 24px", background: "transparent",
              border: "none", color: COLORS.textSecondary, fontSize: 13,
              cursor: "pointer",
            }}
          >
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

// Derive a human-readable default name for a chat from its createdAt
// timestamp. Format: "Apr 19 · 3:42 PM". Used when customName is not set.
function formatChatDefaultName(ts) {
  const d = new Date(ts);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${month} ${day} · ${time}`;
}

// Resolve the display name for a chat: customName if set, else derived.
function getChatDisplayName(chat) {
  if (!chat) return "";
  if (chat.customName && chat.customName.length > 0) return chat.customName;
  return formatChatDefaultName(chat.createdAt);
}

function CoachTab({ userName, chat, chats, isOnline, inputFocused, onSetInputFocused, onAppendMessage, onNewChat, onSwitchChat, onDeleteChat, onRenameChat }) {
  // Bible §4.7: hard cap on user message length. Keeps one chat message
  // within a single API call's budget and prevents runaway prompts. The
  // counter only appears in the last 100 chars so it doesn't distract
  // during normal use.
  const MAX_MESSAGE_CHARS = 1000;
  const COUNTER_SHOW_AT_REMAINING = 100;

  const [input, setInput] = useState("");
  // Bible §4.4 — "Coach is thinking..." indicator. Text-based, gold accent,
  // no spinner. Fires when a user message is sent and clears when the
  // simulated Coach reply arrives. In the real build this will be driven
  // by the streaming API response (shown until the first token streams).
  const [isThinking, setIsThinking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Per-row 3-dot menu: id of the chat whose menu is open, or null.
  const [openMenuId, setOpenMenuId] = useState(null);
  // Rename target: { id, draft } or null.
  const [renameTarget, setRenameTarget] = useState(null);
  // Delete confirm target: chat object or null.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const bottomRef = useRef(null);
  // Textarea ref for auto-grow. We measure scrollHeight on every input
  // change and resize up to a max. Past the max it scrolls internally.
  const textareaRef = useRef(null);
  // Textarea auto-grow bounds.
  //  - MIN_ROWS_HEIGHT: 40px matches the single-line input size we had
  //    before, so the idle state looks identical.
  //  - MAX_TEXTAREA_HEIGHT: ~5 lines at our font size/line-height. Past
  //    this, the textarea stops growing and starts scrolling inside.
  const MIN_TEXTAREA_HEIGHT = 40;
  const MAX_TEXTAREA_HEIGHT = 140;

  // Auto-grow: reset height to auto so scrollHeight re-measures from
  // scratch, then clamp to the max. Runs whenever the input value
  // changes (including programmatic clears after send).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(MAX_TEXTAREA_HEIGHT, Math.max(MIN_TEXTAREA_HEIGHT, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [input]);

  // Cold-start message is derived at render time if the current chat
  // has no messages yet. Bible §4.5 — real copy is deferred.
  const coldStart = `Hey ${userName}! I'm your Coach. I see you're focused on building muscle with 3 days per week at a full gym. Want me to build you a workout for today, or do you have a question?`;
  const messages = chat && chat.messages.length > 0
    ? chat.messages
    : [{ role: "coach", text: coldStart }];

  const currentIsEmpty = !chat || chat.messages.length === 0;
  const canSend = isOnline && input.trim().length > 0 && input.length <= MAX_MESSAGE_CHARS;
  const remaining = MAX_MESSAGE_CHARS - input.length;
  const showCounter = remaining <= COUNTER_SHOW_AT_REMAINING;

  const send = () => {
    if (!canSend) return;
    const u = input.trim();
    setInput("");
    // Seed the cold-start on first user message so the persisted chat
    // history reads coherently when reopened.
    if (chat.messages.length === 0) {
      onAppendMessage({ role: "coach", text: coldStart });
    }
    onAppendMessage({ role: "user", text: u });
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      onAppendMessage({ role: "coach", text: "Here's what I'd suggest for today — a Push day focused on chest and shoulders. Want me to build it out with sets and reps?" });
    }, 800);
  };

  // Auto-scroll to the latest message. We scroll the messages container
  // directly (via its scrollTop) rather than calling scrollIntoView() on
  // bottomRef. scrollIntoView walks all scrollable ancestors and scrolls
  // each one, including the document body when the App wrapper exceeds
  // viewport height — which pushes the Coach header out the top and the
  // TabBar out the bottom. Scoping to the parent container's scrollTop
  // keeps the scroll contained inside the messages area.
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const container = el.parentElement;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, isThinking]);

  const chatRelative = (c) => formatRelativeDate(new Date(c.createdAt).toISOString().slice(0, 10));

  // Close any open per-row menu when the drawer closes
  useEffect(() => { if (!historyOpen) setOpenMenuId(null); }, [historyOpen]);

  // Clear stale thinking indicator on chat switch — otherwise if the user
  // sends a message, switches chats before the fake reply lands, the new
  // chat would show a "Coach is thinking..." that isn't really theirs.
  useEffect(() => { setIsThinking(false); }, [chat?.id]);

  // Safety: on unmount, make sure the App-level focus flag is cleared so
  // the TabBar can't be "stuck hidden" if we ever get torn down while
  // focused. In normal use onBlur covers this, but this guards against
  // edge cases (e.g. navigating away via a non-input-blurring path).
  useEffect(() => {
    return () => {
      if (onSetInputFocused) onSetInputFocused(false);
    };
  }, [onSetInputFocused]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Header — hidden while composing a message, so the chat area feels
          full-height and the focus is entirely on the conversation. Matches
          the pattern in Claude / iMessage / every major chat app. Restores
          on blur. */}
      {!inputFocused && (
      <div style={{ padding: "12px 16px 12px 24px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: "transparent", border: `2px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: COLORS.gold, fontSize: 16, fontWeight: 700, fontStyle: "italic" }}>C</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600 }}>Coach</div>
            {/* Real connectivity indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
              <div style={{
                width: 7, height: 7, borderRadius: 4,
                background: isOnline ? COLORS.gold : COLORS.inactive,
              }} />
              <div style={{ color: isOnline ? COLORS.gold : COLORS.textSecondary, fontSize: 11 }}>
                {isOnline ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {/* History button */}
          <button
            onClick={() => setHistoryOpen(true)}
            title="Chat history"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 15" />
            </svg>
          </button>
          {/* New chat button — gold plus-in-circle. Dimmed when
              current chat is empty (spam prevention visual). */}
          <button
            onClick={onNewChat}
            disabled={currentIsEmpty}
            title={currentIsEmpty ? "You're already in a new chat" : "New chat"}
            style={{
              background: "transparent", border: "none",
              cursor: currentIsEmpty ? "default" : "pointer",
              padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8,
              opacity: currentIsEmpty ? 0.35 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, padding: "16px 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "12px 16px", borderRadius: 16,
              background: m.role === "user" ? COLORS.gold : COLORS.card,
              color: m.role === "user" ? COLORS.bg : COLORS.text,
              fontSize: 14, lineHeight: 1.5,
              borderBottomRightRadius: m.role === "user" ? 4 : 16,
              borderBottomLeftRadius: m.role === "coach" ? 4 : 16,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {/* Thinking indicator — Bible §4.4. Text-based (no spinner), gold
            accent, slides in where the next Coach message will appear. The
            three dots animate in sequence. Removed the moment a real Coach
            message is appended. */}
        {isThinking && (
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "10px 14px",
              color: COLORS.gold,
              fontSize: 13,
              fontStyle: "italic",
              fontFamily: "Georgia, 'Times New Roman', serif",
              display: "flex", alignItems: "center", gap: 2,
            }}>
              Coach is thinking
              <span style={{ display: "inline-flex", gap: 2, marginLeft: 4 }}>
                <span style={{ animation: "coachDot 1.4s infinite", animationDelay: "0s" }}>.</span>
                <span style={{ animation: "coachDot 1.4s infinite", animationDelay: "0.2s" }}>.</span>
                <span style={{ animation: "coachDot 1.4s infinite", animationDelay: "0.4s" }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Offline banner — sits directly above the input. Subtle,
          not intrusive. Only renders when offline. */}
      {!isOnline && (
        <div style={{
          padding: "8px 24px",
          background: "rgba(255,255,255,0.02)",
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.textSecondary, fontSize: 12,
          textAlign: "center", fontStyle: "italic",
          flexShrink: 0,
        }}>
          Coach is offline. Reconnect to chat — past chats remain readable.
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        {/* Char counter — only appears in the final stretch (last 100 chars).
            Fades red once the user actually hits the cap. Tiny, right-aligned,
            above the input so it doesn't steal layout when absent. */}
        {showCounter && (
          <div style={{
            textAlign: "right",
            fontSize: 11,
            color: remaining <= 0 ? "#D14343" : COLORS.textSecondary,
            fontVariantNumeric: "tabular-nums",
            marginBottom: 4,
            fontStyle: "italic",
          }}>
            {remaining} {remaining === 1 ? "character" : "characters"} left
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              // Hard cap — never let state exceed MAX_MESSAGE_CHARS.
              // The browser's maxLength attribute also enforces this on
              // typing, but we belt-and-suspender it here so programmatic
              // setInput calls can't bypass the cap either.
              const next = e.target.value;
              if (next.length > MAX_MESSAGE_CHARS) {
                setInput(next.slice(0, MAX_MESSAGE_CHARS));
              } else {
                setInput(next);
              }
            }}
            maxLength={MAX_MESSAGE_CHARS}
            onFocus={() => onSetInputFocused && onSetInputFocused(true)}
            onBlur={() => onSetInputFocused && onSetInputFocused(false)}
            onKeyDown={(e) => {
              // Desktop convention: Enter sends, Shift+Enter inserts newline.
              // On mobile there's no "Enter" affordance on the soft keyboard —
              // the Return key inserts a newline (default textarea behavior)
              // and the send button is the only way to send. Matches Slack,
              // Discord, Claude web, every modern chat app.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!isOnline}
            rows={1}
            placeholder={isOnline ? "Ask your Coach..." : "Coach is offline"}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 20,
              color: isOnline ? COLORS.text : COLORS.textSecondary,
              fontSize: 14,
              lineHeight: 1.4,
              outline: "none",
              opacity: isOnline ? 1 : 0.6,
              resize: "none",
              fontFamily: "inherit",
              minHeight: MIN_TEXTAREA_HEIGHT,
              maxHeight: MAX_TEXTAREA_HEIGHT,
              overflowY: "auto",
              // Without this, iOS Safari applies a subtle inset shadow
              // that reads as a bug next to the other dark surfaces.
              WebkitAppearance: "none",
            }}
          />
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              width: 40, height: 40, borderRadius: 20,
              background: canSend ? COLORS.gold : COLORS.card,
              border: canSend ? "none" : `1px solid ${COLORS.border}`,
              cursor: canSend ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              opacity: canSend ? 1 : 0.5,
              transition: "opacity 0.15s ease",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={canSend ? COLORS.bg : COLORS.textSecondary} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div
          onClick={() => setHistoryOpen(false)}
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex", justifyContent: "flex-end",
            zIndex: 5,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "82%", maxWidth: 320, height: "100%",
              background: COLORS.bg, borderLeft: `1px solid ${COLORS.border}`,
              display: "flex", flexDirection: "column",
              position: "relative",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600 }}>Chat History</div>
              <button onClick={() => setHistoryOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }} onClick={() => setOpenMenuId(null)}>
              {chats.length === 0 ? (
                <div style={{ padding: 20, color: COLORS.textSecondary, fontSize: 13, textAlign: "center" }}>No past chats.</div>
              ) : (
                chats.map((c) => {
                  const isActive = c.id === chat?.id;
                  const menuOpen = openMenuId === c.id;
                  return (
                    <div
                      key={c.id}
                      style={{
                        position: "relative",
                        background: isActive ? "rgba(255,215,0,0.05)" : "transparent",
                        borderLeft: isActive ? `2.5px solid ${COLORS.gold}` : `2.5px solid transparent`,
                        borderBottom: `1px solid ${COLORS.border}`,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpen) { setOpenMenuId(null); return; }
                          onSwitchChat(c.id);
                          setHistoryOpen(false);
                        }}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: "12px 8px 12px 18px",
                          textAlign: "left",
                          background: "transparent", border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{
                          color: isActive ? COLORS.gold : COLORS.text,
                          fontSize: 13, fontWeight: 500, marginBottom: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {getChatDisplayName(c)}
                        </div>
                        <div style={{ color: COLORS.textSecondary, fontSize: 11 }}>
                          {chatRelative(c)} · {c.messages.length} {c.messages.length === 1 ? "message" : "messages"}
                        </div>
                      </button>
                      {/* 3-dot menu trigger */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(menuOpen ? null : c.id);
                        }}
                        style={{
                          background: "transparent", border: "none",
                          cursor: "pointer", padding: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={COLORS.textSecondary}>
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                      {/* Popup menu */}
                      {menuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            top: "100%", right: 10,
                            marginTop: -4,
                            background: COLORS.card,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                            zIndex: 10,
                            minWidth: 140,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            onClick={() => {
                              setRenameTarget({ id: c.id, draft: getChatDisplayName(c) });
                              setOpenMenuId(null);
                            }}
                            style={{
                              width: "100%", padding: "10px 14px", textAlign: "left",
                              background: "transparent", border: "none",
                              color: COLORS.text, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 10,
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z" />
                            </svg>
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(c);
                              setOpenMenuId(null);
                            }}
                            style={{
                              width: "100%", padding: "10px 14px", textAlign: "left",
                              background: "transparent", border: "none",
                              color: "#ff6b6b", fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 10,
                              borderTop: `1px solid ${COLORS.border}`,
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: COLORS.card, borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            padding: 20, width: "100%", maxWidth: 320,
          }}>
            <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Rename chat</div>
            <input
              autoFocus
              value={renameTarget.draft}
              onChange={(e) => setRenameTarget({ ...renameTarget, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameChat(renameTarget.id, renameTarget.draft);
                  setRenameTarget(null);
                } else if (e.key === "Escape") {
                  setRenameTarget(null);
                }
              }}
              style={{
                width: "100%", padding: "10px 12px",
                background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, color: COLORS.text, fontSize: 14,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button
                onClick={() => setRenameTarget(null)}
                style={{
                  padding: "8px 14px",
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.textSecondary,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRenameChat(renameTarget.id, renameTarget.draft);
                  setRenameTarget(null);
                }}
                style={{
                  padding: "8px 14px",
                  background: COLORS.gold, border: "none",
                  borderRadius: 8, color: COLORS.bg,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: COLORS.card, borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            padding: 20, width: "100%", maxWidth: 320,
          }}>
            <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Delete this chat?</div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
              &ldquo;{getChatDisplayName(deleteTarget)}&rdquo; will be removed. This can&rsquo;t be undone.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "8px 14px",
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.textSecondary,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteChat(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                style={{
                  padding: "8px 14px",
                  background: "#ff6b6b", border: "none",
                  borderRadius: 8, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Exercises Tab ───────────────────────────────────────────────
   List view: search + body part filter chips + "My Equipment" toggle pill.
   Each row is Strong-style: thumbnail, name, body part, last max on the right.
   Tapping a row opens ExerciseDetailScreen (in-tab sub-screen, no route change).
*/

function ExerciseThumbnail({ size = 56, monogram }) {
  // Default placeholder uses the MYG wordmark — swap for real exercise
  // illustrations later. Custom exercises pass a `monogram` prop, which
  // is typically the first letter of the exercise name. This distinguishes
  // user-created exercises visually without introducing a noisy "Custom"
  // chip. See Bible §3.4 (custom exercises) and §18.
  const isCustom = !!monogram;
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, background: COLORS.card,
      border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700,
        color: COLORS.gold,
        fontSize: isCustom ? size * 0.5 : size * 0.32,
        letterSpacing: isCustom ? 0 : 0.5,
        textTransform: "uppercase",
      }}>{isCustom ? monogram : "MYG"}</span>
    </div>
  );
}

function ExercisesTab({
  userEquipment,
  onOpenEquipmentEditor,
  customExercises = [],
  exerciseSort,
  onChangeSort,
  workoutHistory = [],
  onAddCustom,
  onUpdateCustom,
  onDeleteCustom,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Sort popover state — mounted in top right.
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Custom-exercise creation form open state. When non-null, also optionally
  // holds the id of a custom exercise we're editing (null = new exercise).
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState(null);
  // After creating a custom exercise, we highlight its row in gold and
  // scroll it into view. The highlight auto-clears on a 3s timer, when
  // the user taps any row, when they create another one (replacing this
  // one), or when the tab unmounts.
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  // Map of exercise id → DOM node for the row. Populated by refs on each
  // row button so we can scroll a specific row into view after creation.
  const rowRefs = useRef({});
  // Timer ref so we can clear it if the highlight is dismissed early.
  const highlightTimerRef = useRef(null);

  // Body-part filter options — ordered top-down by anatomical region, with
  // Full Body and Cardio last. Cleaner than the old order which had Cardio
  // mid-list between Core and Full Body.
  const groups = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio"];

  // ── Frequency / recency stats derived from workout history ──
  // Built once per render (cheap since history is small). Keyed by
  // exercise NAME because sessions in history only store exercise names,
  // not ids. Each entry holds { count, latestDate }. Used for both the
  // sort modes and the row right-side "N sessions" display when Most
  // Used is active.
  const freqByName = {};
  for (const session of workoutHistory) {
    for (const ex of (session.exercises || [])) {
      const entry = freqByName[ex.name] || { count: 0, latestDate: null };
      entry.count += 1;
      if (!entry.latestDate || session.date > entry.latestDate) {
        entry.latestDate = session.date;
      }
      freqByName[ex.name] = entry;
    }
  }

  // Base list: library + customs, filtered by body part and search/equip.
  const base = getExercisesForFilter(filter, customExercises);
  const filtered = base.filter((e) => {
    if (search && !exerciseMatchesSearch(e, search)) return false;
    if (onlyMine && !exerciseHasAnyAvailableVariant(e, userEquipment)) return false;
    return true;
  });

  // ── Sort pipeline ──
  // Three modes. Default is alphabetical ascending. For recency/frequency,
  // exercises with no history drop to the bottom and alphabetize among
  // themselves (per locked design — otherwise every user would see a wall
  // of "—" rows at the top the moment they changed sort).
  const { mode: sortMode, dir: sortDir } = exerciseSort || { mode: "alpha", dir: "asc" };
  const isDefaultSort = sortMode === "alpha" && sortDir === "asc";

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "alpha") {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    }
    // recent + frequency share the "no history → bottom" rule. We compute
    // a numeric score where 0 means "no history." For recency score =
    // timestamp; for frequency score = session count.
    const aStat = freqByName[a.name];
    const bStat = freqByName[b.name];
    const aScore = !aStat ? 0 : (sortMode === "recent" ? Date.parse(aStat.latestDate) || 0 : aStat.count);
    const bScore = !bStat ? 0 : (sortMode === "recent" ? Date.parse(bStat.latestDate) || 0 : bStat.count);
    // Zero-score items go to bottom regardless of direction, alphabetized
    // among themselves.
    if (aScore === 0 && bScore === 0) return a.name.localeCompare(b.name);
    if (aScore === 0) return 1;
    if (bScore === 0) return -1;
    const cmp = bScore - aScore; // default "desc" for numeric (most first / newest first)
    return sortDir === "asc" ? -cmp : cmp;
  });

  // Body Part button shows "Any Body Part" for default, current selection otherwise.
  const bodyPartLabel = filter === "All" ? "Any Body Part" : filter;

  // Sort button reads grey for the default, gold for any non-default state.
  const sortActive = !isDefaultSort;
  const sortLabels = {
    alpha: sortDir === "asc" ? "A → Z" : "Z → A",
    recent: sortDir === "asc" ? "Oldest First" : "Most Recent",
    frequency: sortDir === "asc" ? "Least Used" : "Most Used",
  };

  // Tap the same sort mode again → flip direction. Tap a new mode →
  // set that mode with its sensible default direction. Defaults:
  // alpha=asc (A→Z), recent=desc (newest first), frequency=desc (most first).
  const handleSortTap = (mode) => {
    if (mode === sortMode) {
      onChangeSort({ mode, dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      onChangeSort({ mode, dir: mode === "alpha" ? "asc" : "desc" });
    }
    setSortMenuOpen(false);
  };

  const openCreateCustom = () => {
    setEditingCustomId(null);
    setCreateOpen(true);
  };
  const openEditCustom = (id) => {
    setEditingCustomId(id);
    setCreateOpen(true);
    setDetailId(null); // Close the detail sheet so the form has the stage
  };
  const closeCreateCustom = () => {
    setCreateOpen(false);
    setEditingCustomId(null);
  };

  // CustomExerciseForm is now a bottom sheet (not a full-screen replacement),
  // so we don't early-return. It's rendered alongside the detail sheet below.
  const editingCustom = editingCustomId ? customExercises.find((x) => x.id === editingCustomId) : null;

  // When a custom exercise is newly added, scroll its row into view and
  // arm a 3s timer to clear the gold highlight. We run this in an effect
  // so the row is guaranteed to be in the DOM by the time we look it up —
  // the state flow is: save → setRecentlyAddedId → re-render with new row →
  // effect fires → scrollIntoView on the fresh node.
  useEffect(() => {
    if (!recentlyAddedId) return;
    // Defer one frame so the row for the new exercise is mounted and
    // measured before we try to scroll to it.
    const raf = requestAnimationFrame(() => {
      const node = rowRefs.current[recentlyAddedId];
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    // 3-second auto-fade
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setRecentlyAddedId(null);
      highlightTimerRef.current = null;
    }, 3000);
    return () => {
      cancelAnimationFrame(raf);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [recentlyAddedId]);

  // Clear highlight on unmount (e.g. switching tabs)
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      <div style={{ padding: "8px 24px 0", flexShrink: 0 }}>
        {/* Title row — "Exercises" on the left, sort + add buttons on the right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: 0, fontWeight: 400 }}>Exercises</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Add custom exercise button — left of sort, grey by default.
                Smaller icon than v1 so it recedes visually; the important
                affordance in this tab is search, not creation. */}
            <button
              onClick={openCreateCustom}
              title="Create custom exercise"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.inactive} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
            {/* Sort button — far top-right. Grey when idle (default alpha asc),
                gold when any other sort state is active. */}
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              title="Sort"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={sortActive ? COLORS.gold : COLORS.inactive}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="16" y2="12" />
                <line x1="4" y1="18" x2="11" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar — shorter and tighter */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          style={{ width: "100%", padding: "7px 12px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.text, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
        />

        {/* Filter row: Body Part dropdown (left) + Equipment toggle pill (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, position: "relative" }}>
          {/* Body Part dropdown trigger */}
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              padding: "7px 12px", borderRadius: 20,
              border: `1px solid ${filter === "All" ? COLORS.border : COLORS.gold}`,
              background: filter === "All" ? "transparent" : COLORS.goldHighlight,
              color: filter === "All" ? COLORS.textSecondary : COLORS.gold,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span>{bodyPartLabel}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Equipment toggle pill */}
          <button
            onClick={() => setOnlyMine(!onlyMine)}
            style={{
              padding: "7px 12px", borderRadius: 20,
              border: `1px solid ${onlyMine ? COLORS.gold : COLORS.border}`,
              background: onlyMine ? COLORS.goldHighlight : "transparent",
              color: onlyMine ? COLORS.gold : COLORS.textSecondary,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: onlyMine ? COLORS.gold : COLORS.inactive,
            }} />
            {onlyMine ? "My Equipment" : "All Exercises"}
          </button>
        </div>

        {/* Contextual "Update Equipment" link — shown only when My Equipment is active */}
        {onlyMine && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6, marginBottom: 8 }}>
            <button
              onClick={onOpenEquipmentEditor}
              style={{
                background: "none", border: "none", color: COLORS.gold,
                fontSize: 11, cursor: "pointer", padding: "2px 4px",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              Update Equipment
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Exercise list */}
      <div style={{ flex: 1, padding: "4px 24px 20px", overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", color: COLORS.textSecondary, fontSize: 13, padding: "40px 20px" }}>
            {onlyMine
              ? "No exercises match your equipment. Try turning off the My Equipment filter."
              : "No exercises found."}
          </div>
        )}
        {sorted.map((e) => {
          const lastMax = getRowLastMax(e.id, e, workoutHistory, customExercises);
          // When "Most Used" sort is active, the right side of the row
          // swaps from (lastMax + relative date) to (session count).
          // Frequency is derived from the user's actual workout history
          // keyed by exercise name (not id).
          const showFrequency = sortMode === "frequency";
          const stat = freqByName[e.name];
          const isHighlighted = e.id === recentlyAddedId;
          return (
            <button
              key={e.id}
              ref={(node) => {
                // Store refs for newly-added custom rows so the effect
                // above can scroll them into view. We only need refs for
                // custom exercises since library rows never get highlighted,
                // but storing all keeps the code simple.
                if (node) rowRefs.current[e.id] = node;
                else delete rowRefs.current[e.id];
              }}
              onClick={() => {
                // Tapping the highlighted row dismisses the highlight
                // immediately, in addition to opening its detail sheet.
                if (isHighlighted) setRecentlyAddedId(null);
                setDetailId(e.id);
              }}
              style={{
                width: "100%", padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 12,
                background: isHighlighted ? COLORS.goldHighlight : "none",
                border: "none",
                borderBottom: `1px solid ${COLORS.border}`,
                borderLeft: isHighlighted ? `3px solid ${COLORS.gold}` : "3px solid transparent",
                cursor: "pointer", textAlign: "left",
                transition: "background 0.4s ease, border-left-color 0.4s ease",
              }}
            >
              <ExerciseThumbnail size={44} monogram={e.isCustom ? e.name.charAt(0) : undefined} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 1 }}>{e.primary}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                {showFrequency ? (
                  stat ? (
                    <div style={{ color: COLORS.gold, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {stat.count} {stat.count === 1 ? "session" : "sessions"}
                    </div>
                  ) : (
                    <div style={{ color: COLORS.inactive, fontSize: 14 }}>—</div>
                  )
                ) : lastMax ? (
                  <>
                    <div style={{ color: COLORS.gold, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{lastMax.value}</div>
                    <div style={{ color: COLORS.textSecondary, fontSize: 9, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                      {formatRelativeDate(lastMax.date)}
                      {lastMax.variantLabel && ` · ${lastMax.variantLabel}`}
                    </div>
                  </>
                ) : (
                  <div style={{ color: COLORS.inactive, fontSize: 14 }}>—</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating dropdown menu + dim backdrop. Backdrop overlays the whole tab
          (not the tab bar) and dismisses the menu on click. */}
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.35)", zIndex: 10,
            }}
          />
          <div style={{
            position: "absolute", top: 150, left: 24, zIndex: 11,
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            minWidth: 180, padding: 6,
          }}>
            {groups.map((g) => {
              const label = g === "All" ? "Any Body Part" : g;
              const isActive = g === filter;
              return (
                <button
                  key={g}
                  onClick={() => {
                    // Tapping the currently-active filter deselects it back
                    // to "All". This prevents the dead-end where the user
                    // has to open the dropdown, find "All", and tap it.
                    setFilter(isActive && g !== "All" ? "All" : g);
                    setMenuOpen(false);
                  }}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    background: isActive ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: isActive ? COLORS.gold : COLORS.text,
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span>{label}</span>
                  {isActive && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Sort menu — anchored under the sort button in the top right.
          Three options. The active one shows a checkmark + its current
          direction as subtext. Tapping the active one flips direction. */}
      {sortMenuOpen && (
        <>
          <div
            onClick={() => setSortMenuOpen(false)}
            style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.35)", zIndex: 10,
            }}
          />
          <div style={{
            position: "absolute", top: 44, right: 24, zIndex: 11,
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            minWidth: 200, padding: 6,
          }}>
            {[
              { id: "alpha", label: "Alphabetical" },
              { id: "recent", label: "Most Recent" },
              { id: "frequency", label: "Most Used" },
            ].map((opt) => {
              const isActive = opt.id === sortMode;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSortTap(opt.id)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    background: isActive ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: isActive ? COLORS.gold : COLORS.text,
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span>{opt.label}</span>
                  {isActive && (
                    <span style={{
                      color: COLORS.gold, fontSize: 11, fontVariantNumeric: "tabular-nums",
                      fontStyle: "italic",
                    }}>
                      {sortLabels[opt.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Exercise detail bottom sheet — overlays the tab content. Backdrop
          click-to-dismiss above the sheet; sheet covers the lower ~85%. */}
      {detailId && (
        <ExerciseDetailSheet
          exercise={findExerciseById(detailId, customExercises)}
          userEquipment={userEquipment}
          workoutHistory={workoutHistory}
          customExercises={customExercises}
          onClose={() => setDetailId(null)}
          onEditCustom={() => openEditCustom(detailId)}
          onDeleteCustom={() => {
            onDeleteCustom && onDeleteCustom(detailId);
            setDetailId(null);
          }}
        />
      )}

      {/* Custom exercise creation / edit sheet — matches the detail sheet
          pattern (backdrop + 85% height sheet). Rendered alongside so the
          user can open it over the exercises list. */}
      {createOpen && (
        <CustomExerciseForm
          existing={editingCustom}
          existingNames={[...EXERCISE_LIBRARY, ...customExercises]
            .filter((x) => !editingCustom || x.id !== editingCustom.id)
            .map((x) => x.name.toLowerCase())}
          onSave={(payload) => {
            if (editingCustom) {
              onUpdateCustom && onUpdateCustom(editingCustom.id, payload);
            } else {
              onAddCustom && onAddCustom(payload);
              // Flag this row for scroll-into-view + gold highlight. The
              // effect keyed on recentlyAddedId handles the rest.
              setRecentlyAddedId(payload.id);
            }
            closeCreateCustom();
          }}
          onCancel={closeCreateCustom}
        />
      )}
    </div>
  );
}

/* ── Exercise Detail Bottom Sheet ────────────────────────────────
   Tabbed bottom-sheet overlay for an exercise. Covers ~85% of the phone
   height, anchored to the bottom with rounded top corners. Backdrop dim
   above the sheet dismisses on tap, matching the body-part dropdown pattern.
   Three tabs: About | History | Records. Sticky CTA pinned to the bottom
   of the sheet so it's always reachable regardless of active tab.
*/

/* ── Custom Exercise Creation / Edit Form ─────────────────────────
   Full-screen form for creating a user-defined exercise (Bible §3.4, §18).
   Kept deliberately minimal: name, primary muscle, single equipment. No
   variants, no secondary muscles, no type picker — defaulted to Compound
   since Coach never programs custom exercises anyway (they're invisible
   to the workout generator).

   Validation:
   - Name required, trimmed, unique per user (case-insensitive). Uniqueness
     check receives a list of existing lower-cased names from the parent,
     which handles the "editing my own exercise" exclusion correctly.
   - Primary muscle required.
   - Equipment required (with "Bodyweight / None" as a valid choice).

   On save, builds a library-shaped object:
     {
       id: "custom_<timestamp>" (or kept if editing),
       name, primary, secondary: [], type: "Compound",
       variants: [{ label, equipment: [equipId | ...] }],
       isCustom: true,
       createdAt: Date.now(),
     }

   The variant label is generated from the equipment pick so it reads
   naturally if the user ever has multiple custom exercises with the same
   name + different equipment (e.g. "Dumbbells"). Custom exercises are
   single-variant for v1.
*/
function CustomExerciseForm({ existing, existingNames = [], onSave, onCancel }) {
  const [name, setName] = useState(existing ? existing.name : "");
  const [primary, setPrimary] = useState(existing ? existing.primary : "");
  // Equipment — single select from the master catalog, or the "none"
  // token for bodyweight. Pre-fill from existing variant on edit.
  const [equipmentId, setEquipmentId] = useState(() => {
    if (!existing) return "";
    const v = existing.variants && existing.variants[0];
    if (!v) return "";
    return v.equipment && v.equipment.length > 0 ? v.equipment[0] : "__none__";
  });
  const [showError, setShowError] = useState(null);

  const PRIMARY_OPTIONS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio"];

  const trimmedName = name.trim();
  const lowerName = trimmedName.toLowerCase();
  const nameTaken = trimmedName.length > 0 && existingNames.includes(lowerName);
  const canSave = trimmedName.length > 0 && primary && equipmentId && !nameTaken;

  const handleSave = () => {
    if (!canSave) {
      if (nameTaken) setShowError("That name is already used by another exercise.");
      else if (!trimmedName) setShowError("Name is required.");
      else if (!primary) setShowError("Pick a primary muscle group.");
      else if (!equipmentId) setShowError("Pick equipment.");
      return;
    }
    const equipIds = equipmentId === "__none__" ? [] : [equipmentId];
    // Build a readable variant label from the equipment pick
    let variantLabel = "Bodyweight";
    if (equipmentId !== "__none__") {
      for (const cat of EQUIPMENT_CATEGORIES) {
        const item = cat.items.find((i) => i.id === equipmentId);
        if (item) { variantLabel = item.label; break; }
      }
    }
    const payload = {
      id: existing ? existing.id : `custom_${Date.now()}`,
      name: trimmedName,
      primary,
      // Explicitly null so the D-019 alternatives helper short-circuits
      // to the empty-state (Ask Coach / Browse). Customs intentionally
      // route through Coach rather than the algorithmic match — Session 31
      // framing: "free-tier conversion moment, not a feature gap."
      pattern: null,
      secondary: [],
      type: "Compound",
      variants: [{ label: variantLabel, equipment: equipIds }],
      isCustom: true,
      createdAt: existing ? existing.createdAt : Date.now(),
    };
    onSave(payload);
  };

  return (
    <>
      {/* Backdrop — covers entire tab, click dismisses */}
      <div
        onClick={onCancel}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 20,
        }}
      />
      {/* Bottom sheet card — matches HistoryRecap / ExerciseDetail pattern */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: "85%", zIndex: 21,
        background: COLORS.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${COLORS.border}`,
        borderBottom: "none",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>

        {/* Top bar: Cancel on left, title center, Save on right */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 20px 10px", borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", color: COLORS.textSecondary, fontSize: 14, cursor: "pointer", padding: 4 }}
          >Cancel</button>
          <div style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: COLORS.text, fontSize: 16, fontWeight: 500,
          }}>{existing ? "Edit Exercise" : "New Exercise"}</div>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: "none", border: "none",
              color: canSave ? COLORS.gold : COLORS.inactive,
              fontSize: 14, fontWeight: 600,
              cursor: canSave ? "pointer" : "default",
              padding: 4,
            }}
          >Save</button>
        </div>

        <div style={{ flex: 1, padding: "18px 24px 20px", overflowY: "auto", overscrollBehavior: "contain" }}>
          {/* Name */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Name</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setShowError(null); }}
              placeholder="e.g. Billy's Shoulder Thing"
              maxLength={50}
              style={{
                width: "100%", padding: "10px 12px",
                background: COLORS.card,
                border: `1px solid ${nameTaken ? "#D14343" : COLORS.border}`,
                borderRadius: 8, color: COLORS.text,
                fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
            />
            {nameTaken && (
              <div style={{ color: "#D14343", fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
                That name is already used by another exercise.
              </div>
            )}
          </div>

          {/* Primary muscle */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Primary Muscle</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRIMARY_OPTIONS.map((p) => {
                const active = p === primary;
                return (
                  <button
                    key={p}
                    onClick={() => { setPrimary(p); setShowError(null); }}
                    style={{
                      padding: "7px 12px", borderRadius: 18,
                      border: `1px solid ${active ? COLORS.gold : COLORS.border}`,
                      background: active ? COLORS.goldHighlight : "transparent",
                      color: active ? COLORS.gold : COLORS.text,
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >{p}</button>
                );
              })}
            </div>
          </div>

          {/* Equipment — flat, category-grouped list. Single-select. */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", color: COLORS.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Equipment</label>
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 6,
            }}>
              {/* Bodyweight / other — covers the "no equipment" and "some
                  equipment not in our catalog" cases. */}
              <button
                onClick={() => { setEquipmentId("__none__"); setShowError(null); }}
                style={{
                  width: "100%", padding: "9px 10px", borderRadius: 6,
                  background: equipmentId === "__none__" ? COLORS.goldHighlight : "transparent",
                  border: "none", textAlign: "left", cursor: "pointer",
                  color: equipmentId === "__none__" ? COLORS.gold : COLORS.text,
                  fontSize: 13, fontWeight: equipmentId === "__none__" ? 600 : 400,
                }}
              >Bodyweight / Other</button>
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <div key={cat.id} style={{ marginTop: 8 }}>
                  <div style={{
                    color: COLORS.textSecondary, fontSize: 10,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    padding: "4px 10px",
                  }}>{cat.label}</div>
                  {cat.items.map((item) => {
                    const active = equipmentId === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setEquipmentId(item.id); setShowError(null); }}
                        style={{
                          width: "100%", padding: "9px 10px", borderRadius: 6,
                          background: active ? COLORS.goldHighlight : "transparent",
                          border: "none", textAlign: "left", cursor: "pointer",
                          color: active ? COLORS.gold : COLORS.text,
                          fontSize: 13, fontWeight: active ? 600 : 400,
                        }}
                      >{item.label}</button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {showError && (
            <div style={{ color: "#D14343", fontSize: 12, marginTop: 4, textAlign: "center" }}>
              {showError}
            </div>
          )}

          <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 20, lineHeight: 1.5, fontStyle: "italic", textAlign: "center" }}>
            {existing
              ? "Changes only affect future workouts. Past sessions keep the name and equipment they were logged with."
              : "Custom exercises are yours to track, but Coach won't include them in programmed workouts."}
          </div>
        </div>
      </div>
    </>
  );
}

/* AlternativesSheet — D-019. Bottom sheet that opens when a swiped exercise's
   "Alternative" action is tapped in the active logger. Strict same-primary +
   same-pattern peers, with a same-primary fallback divider when peers are
   sparse (1-2). Empty case → Ask Coach (primary CTA) + Browse Exercises
   (secondary). Style mirrors ExerciseDetailSheet at 70% height — picker, not
   detail viewer, so no need for the full 85%.

   Picking an alternative replaces the swiped exercise in-place via onPick.
   The picker only shows the exercise's name + primary; variant defaulting
   happens in the parent via pickDefaultVariant when the swap commits, the
   same way AddExerciseSheet's stage-2 confirm screen does for the add path.
   For the alternatives flow we skip that confirm step — the user already
   saw a smart default elsewhere and a swap mid-workout should be one tap. */
function AlternativesSheet({
  exercise, userEquipment, customExercises = [], workoutHistory = [],
  onClose, onPick, onAskCoach, onBrowseAll,
}) {
  const { peers, fallback, bucket } = getAlternatives(exercise, userEquipment, customExercises);

  // Pick-and-commit: choose a smart default variant for the new exercise
  // using the same logic as the detail sheet, then hand it to the parent.
  const handlePick = (libEx) => {
    const variant = pickDefaultVariant(libEx, userEquipment, workoutHistory, customExercises);
    onPick(libEx, variant);
  };

  const renderRow = (e) => {
    // Dim + subline-swap for rows the user can't currently do. Tap still
    // works — pickDefaultVariant falls through to first-variant-in-list, so
    // the swap commits with a sensible variant the user can re-pick via the
    // variant chip. Bodyweight-only exercises (Push-Up, Plank, etc.) always
    // come back null here and render bright.
    const missingLabel = getMissingEquipmentLabel(e, userEquipment);
    const isAvailable = missingLabel === null;
    return (
      <button
        key={e.id}
        onClick={() => handlePick(e)}
        style={{
          width: "100%", padding: "14px 0",
          display: "flex", alignItems: "center", gap: 14,
          background: "none", border: "none",
          borderBottom: `1px solid ${COLORS.border}`,
          cursor: "pointer", textAlign: "left",
          opacity: isAvailable ? 1 : 0.5,
        }}
      >
        <ExerciseThumbnail size={52} monogram={e.isCustom ? e.name.charAt(0) : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isAvailable ? e.primary : missingLabel}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 32,
        }}
      />

      {/* Sheet — sits ABOVE AddExerciseSheet's z-index (31) so it stacks
          correctly if the user opens Browse from the empty-state. */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: "70%", zIndex: 33,
        background: COLORS.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${COLORS.border}`,
        borderBottom: "none",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: "6px 20px 14px", flexShrink: 0, textAlign: "center" }}>
          <div style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Alternatives to
          </div>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 20, color: COLORS.text,
            margin: 0, fontWeight: 400, lineHeight: 1.2,
          }}>{exercise.name}</h2>
        </div>

        {/* Body — three render cases driven by `bucket`. */}
        <div style={{ flex: 1, padding: "0 20px 20px", overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
          {bucket === "primary" && (
            <>{peers.map(renderRow)}</>
          )}

          {bucket === "fallback" && (
            <>
              {peers.map(renderRow)}
              <div style={{
                color: COLORS.textSecondary, fontSize: 11, fontWeight: 500,
                letterSpacing: 0.5, textTransform: "uppercase",
                margin: "20px 0 6px", paddingTop: 12,
                borderTop: `1px solid ${COLORS.border}`,
              }}>
                Other {exercise.primary.toLowerCase()} exercises
              </div>
              {fallback.map(renderRow)}
            </>
          )}

          {bucket === "empty" && (
            <div style={{
              padding: "24px 16px", marginTop: 8,
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}>
              <div style={{
                color: COLORS.text, fontSize: 14, lineHeight: 1.5,
                textAlign: "center", maxWidth: 280,
              }}>
                No direct swaps for {exercise.name}. Coach can suggest something based on what you have.
              </div>
              <button
                onClick={onAskCoach}
                style={{
                  width: "100%", padding: "12px 16px",
                  background: COLORS.gold, color: "#000",
                  border: "none", borderRadius: 10,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Ask Coach
              </button>
              <button
                onClick={onBrowseAll}
                style={{
                  width: "100%", padding: "10px 16px",
                  background: "transparent", color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.border}`, borderRadius: 10,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Browse Exercises
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ExerciseDetailSheet({ exercise, userEquipment, workoutHistory = [], customExercises = [], onClose, onEditCustom, onDeleteCustom }) {
  const [activeTab, setActiveTab] = useState("about");
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  // Overflow (3-dot) menu for custom-exercise Edit / Delete. Only rendered
  // when exercise.isCustom is true.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Smart-default variant: most recently logged, else first available by
  // equipment, else first in the list. User can switch via the chip.
  const [activeVariant, setActiveVariant] = useState(() => pickDefaultVariant(exercise, userEquipment, workoutHistory, customExercises));

  const hasMultipleVariants = exercise.variants.length > 1;
  const activeVariantKey = variantKey(activeVariant);
  const variantHistory = getVariantHistory(exercise.id, activeVariantKey, workoutHistory, customExercises);
  const hasHistory = variantHistory.length > 0;
  const isCustom = !!exercise.isCustom;

  const tabs = [
    { id: "about", label: "About" },
    { id: "history", label: "History" },
    { id: "records", label: "Records" },
  ];

  return (
    <>
      {/* Backdrop — covers entire tab, click dismisses */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 20,
        }}
      />

      {/* Bottom sheet card */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: "85%", zIndex: 21,
        background: COLORS.bg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${COLORS.border}`,
        borderBottom: "none",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.6)",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: COLORS.border }} />
        </div>

        {/* Header: centered name with compact CTA floating top-right.
            For custom exercises, a 3-dot overflow menu (Edit / Delete)
            sits in the top-LEFT so it doesn't crowd the Add CTA. */}
        <div style={{ padding: "6px 16px 10px", flexShrink: 0, position: "relative" }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 20, color: COLORS.text,
            margin: 0, padding: "0 72px", // leave room for buttons on both sides
            fontWeight: 400, lineHeight: 1.2,
            textAlign: "center",
          }}>{exercise.name}</h2>

          {/* 3-dot overflow — top-left, custom exercises only */}
          {isCustom && (
            <button
              onClick={(e) => { e.stopPropagation(); setOverflowOpen((v) => !v); }}
              title="Edit or delete"
              style={{
                position: "absolute", left: 16, top: 2,
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8, color: COLORS.textSecondary,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          )}

          {/* Add-to-Workout CTA — top-right */}
          <button style={{
            position: "absolute", right: 16, top: 2,
            padding: "6px 11px", background: "transparent",
            border: `1px solid ${COLORS.gold}`, color: COLORS.gold,
            borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
          </button>

          {/* Overflow menu for custom exercises — Edit / Delete. Anchored
              to the left now that the 3-dot lives in the top-left. */}
          {isCustom && overflowOpen && (
            <>
              <div
                onClick={() => setOverflowOpen(false)}
                style={{ position: "absolute", inset: 0, zIndex: 22 }}
              />
              <div style={{
                position: "absolute", left: 16, top: 32, zIndex: 23,
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                minWidth: 140, padding: 4,
              }}>
                <button
                  onClick={() => { setOverflowOpen(false); onEditCustom && onEditCustom(); }}
                  style={{
                    width: "100%", padding: "9px 11px", borderRadius: 6,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", color: COLORS.text, fontSize: 13,
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => { setOverflowOpen(false); setConfirmDelete(true); }}
                  style={{
                    width: "100%", padding: "9px 11px", borderRadius: 6,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", color: "#D14343", fontSize: 13,
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}

          {/* Variant chip — centered under the name. Hidden for single-variant
              exercises (nothing to switch to). */}
          {hasMultipleVariants && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
              <button
                onClick={() => setVariantMenuOpen(true)}
                style={{
                  padding: "6px 13px", borderRadius: 16,
                  border: `1px solid ${COLORS.gold}`,
                  background: COLORS.goldHighlight, color: COLORS.gold,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span>{activeVariant.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", borderBottom: `1px solid ${COLORS.border}`,
          padding: "0 22px", flexShrink: 0,
        }}>
          {tabs.map((t) => {
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "10px 0", marginRight: 22,
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  color: isActive ? COLORS.gold : COLORS.textSecondary,
                  borderBottom: isActive ? `2px solid ${COLORS.gold}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable tab content. About is per-variant; History/Records pull
            from the variant-specific history. Empty state fires per-variant. */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
          {activeTab === "about" && (
            <AboutTabContent exercise={exercise} variant={activeVariant} userEquipment={userEquipment} />
          )}
          {activeTab === "history" && (hasHistory
            ? <HistoryTabContent history={variantHistory} />
            : <EmptyTabState message={`No history yet for ${activeVariant.label}. Log it in a workout to track progress here.`} />)}
          {activeTab === "records" && (hasHistory
            ? <RecordsTabContent history={variantHistory} />
            : <EmptyTabState message={`No records yet for ${activeVariant.label}. Complete a session to start tracking PRs.`} />)}
        </div>

        {/* Variant dropdown menu — overlays the sheet when the chip is tapped.
            Each row shows the variant label and a preview line with session
            count and last logged set. Click anywhere outside to close. */}
        {variantMenuOpen && (
          <>
            <div
              onClick={() => setVariantMenuOpen(false)}
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.45)", zIndex: 30,
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
              }}
            />
            <div style={{
              position: "absolute", top: 84, left: "50%",
              transform: "translateX(-50%)", zIndex: 31,
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              minWidth: 240, maxWidth: 300, padding: 6,
            }}>
              {exercise.variants.map((v, i) => {
                const vk = variantKey(v);
                const hist = getVariantHistory(exercise.id, vk, workoutHistory, customExercises);
                const isActive = vk === activeVariantKey;
                let preview;
                if (hist.length > 0) {
                  const lastSession = hist[hist.length - 1];
                  const top = sessionTopSet(lastSession.sets);
                  preview = `${hist.length} ${hist.length === 1 ? "session" : "sessions"} · last ${formatSetSummary(top)}`;
                } else {
                  preview = "No history";
                }
                return (
                  <button
                    key={i}
                    onClick={() => { setActiveVariant(v); setVariantMenuOpen(false); }}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      background: isActive ? COLORS.goldHighlight : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 10,
                      marginBottom: i < exercise.variants.length - 1 ? 2 : 0,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: isActive ? COLORS.gold : COLORS.text,
                        fontSize: 13, fontWeight: isActive ? 600 : 500,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>{v.label}</div>
                      <div style={{
                        color: hist.length > 0 ? COLORS.textSecondary : COLORS.inactive,
                        fontSize: 10, marginTop: 2, fontVariantNumeric: "tabular-nums",
                      }}>{preview}</div>
                    </div>
                    {isActive && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal for custom exercises — fixed to phone
          frame so the backdrop dims everything including the tab bar,
          matching the Cancel Workout / chat delete modal pattern. */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 320,
            background: COLORS.card, borderRadius: 14,
            border: `1px solid ${COLORS.border}`,
            padding: 20, textAlign: "center",
          }}>
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              color: COLORS.text, fontSize: 17, marginBottom: 6,
            }}>Delete "{exercise.name}"?</div>
            <div style={{ color: COLORS.textSecondary, fontSize: 12, marginBottom: 16, lineHeight: 1.4 }}>
              Past workouts that logged this exercise will still show it, but
              it will no longer appear in your library.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: "10px 12px",
                  background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, color: COLORS.text,
                  fontSize: 13, cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={() => { setConfirmDelete(false); onDeleteCustom && onDeleteCustom(); }}
                style={{
                  flex: 1, padding: "10px 12px",
                  background: "#D14343",
                  border: "none",
                  borderRadius: 10, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── About Tab Content ─────────────────────────────────────────── */
function AboutTabContent({ exercise, variant, userEquipment }) {
  const available = variantAvailable(variant, userEquipment);

  return (
    <div style={{ padding: "14px 22px 20px" }}>
      {/* Video / diagram placeholder — per variant. Real demo video will be
          stored per (exerciseId, variantKey) pair. */}
      <div style={{
        width: "100%", aspectRatio: "16 / 10", borderRadius: 12,
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 16, position: "relative",
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "rgba(255,215,0,0.1)",
          border: `1.5px solid ${COLORS.gold}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.gold} stroke="none">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        </div>
        <span style={{
          position: "absolute", bottom: 10, right: 12,
          color: COLORS.textSecondary, fontSize: 10, letterSpacing: 0.3,
        }}>DEMO VIDEO</span>
      </div>

      {/* Equipment callout for the active variant — compact single-row bar
          replacing the old multi-row "Equipment Variants" list. */}
      <div style={{
        padding: "10px 14px", borderRadius: 10, marginBottom: 16,
        background: COLORS.card,
        border: `1px solid ${available ? COLORS.border : "#2a2a2a"}`,
        display: "flex", alignItems: "center", gap: 10,
        opacity: available ? 1 : 0.55,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: available ? COLORS.gold : COLORS.inactive, flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: COLORS.textSecondary, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Equipment</div>
          <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 500 }}>{variant.label}</div>
        </div>
        {!available && (
          <span style={{ color: COLORS.inactive, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>Unavailable</span>
        )}
      </div>

      {/* Form cues — placeholder content. In production these will be stored
          per (exerciseId, variantKey) since cues legitimately differ between
          e.g. Barbell Bench Press and Dumbbell Bench Press. */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Form Cues</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {[
            "Brace your core before unracking the weight.",
            "Drive through your heels and keep your chest up.",
            "Control the descent — don't let gravity do the work.",
            "Last 2-3 reps should feel genuinely hard.",
          ].map((cue, i) => (
            <li key={i} style={{
              color: COLORS.text, fontSize: 13, lineHeight: 1.55,
              paddingLeft: 16, position: "relative", marginBottom: 8,
            }}>
              <span style={{
                position: "absolute", left: 0, top: 8,
                width: 4, height: 4, borderRadius: "50%", background: COLORS.gold,
              }} />
              {cue}
            </li>
          ))}
        </ul>
      </div>

      {/* Secondary muscles — movement-level, same across all variants */}
      {exercise.secondary && exercise.secondary.length > 0 && (
        <div>
          <div style={{ color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Secondary Muscles</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {exercise.secondary.map((m) => (
              <span key={m} style={{
                padding: "5px 11px", borderRadius: 14, background: COLORS.card,
                border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 12,
              }}>{m}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── History Tab Content ─────────────────────────────────────────
   Chart at top with metric toggle, session list below. Chart is an inline
   SVG line chart — no external library. The Epley e1RM is the default
   metric since raw weight alone misrepresents stronger rep sets.
*/
function HistoryTabContent({ history }) {
  const [metric, setMetric] = useState("e1rm"); // e1rm | volume | weight

  // Build the chart data series based on selected metric.
  const series = history.map((s) => {
    let value;
    if (metric === "e1rm") value = sessionBestE1rm(s.sets);
    else if (metric === "volume") value = sessionVolume(s.sets);
    else /* weight */ value = sessionTopSet(s.sets).weight;
    return { date: s.date, value };
  });

  return (
    <div style={{ padding: "16px 22px 20px" }}>
      {/* Metric toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[
          { id: "e1rm", label: "Est. 1RM" },
          { id: "volume", label: "Volume" },
          { id: "weight", label: "Top Set" },
        ].map((m) => {
          const isActive = metric === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              style={{
                padding: "6px 12px", borderRadius: 16,
                border: `1px solid ${isActive ? COLORS.gold : COLORS.border}`,
                background: isActive ? COLORS.goldHighlight : "transparent",
                color: isActive ? COLORS.gold : COLORS.textSecondary,
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
            >{m.label}</button>
          );
        })}
      </div>

      {/* Inline SVG line chart */}
      <LineChart series={series} metric={metric} />

      {/* Session list */}
      <div style={{ marginTop: 18 }}>
        <div style={{ color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
          All Sessions ({history.length})
        </div>
        {[...history].reverse().map((s, i) => {
          const best = sessionBestE1rm(s.sets);
          const top = sessionTopSet(s.sets);
          return (
            <div key={i} style={{
              padding: "12px 0", borderBottom: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 500 }}>{formatShortDate(s.date)}</div>
                <div style={{ color: COLORS.gold, fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  e1RM {Math.round(best)} lb
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {s.sets.map((set, j) => {
                  const isTop = set.weight === top.weight && set.reps === top.reps;
                  return (
                    <span key={j} style={{
                      padding: "3px 8px", borderRadius: 6,
                      background: isTop ? COLORS.goldHighlight : COLORS.card,
                      border: `1px solid ${isTop ? COLORS.gold : COLORS.border}`,
                      color: isTop ? COLORS.gold : COLORS.textSecondary,
                      fontSize: 11, fontVariantNumeric: "tabular-nums",
                      fontWeight: isTop ? 600 : 400,
                    }}>{formatSetSummary(set, " × ")}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Inline SVG line chart. Width is responsive via viewBox. Shows a single
   gold line with small dots at each session and a subtle Y-axis scale.
*/
function LineChart({ series, metric }) {
  if (series.length === 0) return null;

  const W = 320;
  const H = 140;
  const PAD_L = 36;
  const PAD_R = 10;
  const PAD_T = 12;
  const PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const values = series.map((s) => s.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  // Pad the y range by 5% on each side so the line doesn't hug the edges.
  const range = Math.max(maxV - minV, 1);
  const yMin = minV - range * 0.1;
  const yMax = maxV + range * 0.1;

  const xForIdx = (i) => PAD_L + (i / Math.max(series.length - 1, 1)) * plotW;
  const yForVal = (v) => PAD_T + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const path = series.map((s, i) => `${i === 0 ? "M" : "L"} ${xForIdx(i).toFixed(1)} ${yForVal(s.value).toFixed(1)}`).join(" ");
  // Area under the curve for subtle gold fill
  const areaPath = `${path} L ${xForIdx(series.length - 1).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} L ${xForIdx(0).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z`;

  // Y-axis ticks: just min, mid, max
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 12, padding: "10px 6px 4px",
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* Horizontal gridlines + y tick labels */}
        {ticks.map((t, i) => {
          const y = yForVal(t);
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={COLORS.border} strokeWidth="1" strokeDasharray={i === 1 ? "2 3" : "0"} />
              <text x={PAD_L - 6} y={y + 3} fontSize="9" fill={COLORS.textSecondary} textAnchor="end">
                {Math.round(t)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="rgba(255,215,0,0.08)" />

        {/* Line */}
        <path d={path} fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots — last dot is emphasized */}
        {series.map((s, i) => {
          const isLast = i === series.length - 1;
          return (
            <circle
              key={i}
              cx={xForIdx(i)} cy={yForVal(s.value)}
              r={isLast ? 3.5 : 2}
              fill={COLORS.gold}
              stroke={isLast ? COLORS.bg : "none"}
              strokeWidth={isLast ? 1.5 : 0}
            />
          );
        })}

        {/* X-axis labels: first and last date only (prevents crowding) */}
        <text x={xForIdx(0)} y={H - 6} fontSize="9" fill={COLORS.textSecondary} textAnchor="start">
          {formatShortDate(series[0].date)}
        </text>
        <text x={xForIdx(series.length - 1)} y={H - 6} fontSize="9" fill={COLORS.textSecondary} textAnchor="end">
          {formatShortDate(series[series.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}

/* ── Records Tab Content ─────────────────────────────────────────
   2x2 grid of PR cards computed from the full session history.
*/
function RecordsTabContent({ history }) {
  // Heaviest single set across all history (weight, ties broken by reps)
  let heaviest = null;
  let bestE1rm = { value: 0, weight: 0, reps: 0, date: "" };
  let bestVolume = { value: 0, date: "" };
  let totalVolume = 0;
  let totalSessions = history.length;

  for (const sess of history) {
    for (const set of sess.sets) {
      if (!heaviest || set.weight > heaviest.weight || (set.weight === heaviest.weight && set.reps > heaviest.reps)) {
        heaviest = { ...set, date: sess.date };
      }
      const er = e1rm(set.weight, set.reps);
      if (er > bestE1rm.value) bestE1rm = { value: er, weight: set.weight, reps: set.reps, date: sess.date };
      totalVolume += set.weight * set.reps;
    }
    const sv = sessionVolume(sess.sets);
    if (sv > bestVolume.value) bestVolume = { value: sv, date: sess.date };
  }

  const cards = [
    {
      label: "Heaviest Set",
      value: `${heaviest.weight}`,
      unit: "lb",
      sub: `× ${heaviest.reps} reps · ${formatShortDate(heaviest.date)}`,
    },
    {
      label: "Best Est. 1RM",
      value: `${Math.round(bestE1rm.value)}`,
      unit: "lb",
      sub: `${formatSetSummary({ weight: bestE1rm.weight, reps: bestE1rm.reps })} · ${formatShortDate(bestE1rm.date)}`,
    },
    {
      label: "Best Set Volume",
      value: `${bestVolume.value.toLocaleString()}`,
      unit: "lb",
      sub: formatShortDate(bestVolume.date),
    },
    {
      label: "Total Volume",
      value: `${(totalVolume / 1000).toFixed(1)}k`,
      unit: "lb",
      sub: `${totalSessions} sessions`,
    },
  ];

  return (
    <div style={{ padding: "16px 22px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ color: COLORS.textSecondary, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>
              {c.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
              <span style={{ color: COLORS.gold, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {c.value}
              </span>
              <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 500 }}>{c.unit}</span>
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Gamification placeholder — leaves room for badges/milestones later */}
      <div style={{
        marginTop: 14, padding: "14px 16px",
        background: COLORS.card, border: `1px dashed ${COLORS.border}`,
        borderRadius: 12, textAlign: "center",
      }}>
        <div style={{ color: COLORS.textSecondary, fontSize: 11, letterSpacing: 0.3 }}>
          Badges and milestones coming soon
        </div>
      </div>
    </div>
  );
}

/* ── Empty tab state ─────────────────────────────────────────── */
function EmptyTabState({ message }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 32px", textAlign: "center",
      minHeight: 200,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 24,
        background: COLORS.card, border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="1.8">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-5" />
        </svg>
      </div>
      <div style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.5, maxWidth: 240 }}>
        {message}
      </div>
    </div>
  );
}

/* ── Profile Tab — Coach's File (Bible §6.5, v26) ─────────────────
   The Profile tab is reframed as Coach's File — the page Coach keeps
   on you. Third-person notation in Coach's voice. Five fixed sections
   on the landing (PLAN, EQUIPMENT, RULES, PROGRESS, OBSERVATIONS) plus
   a vitals strip and a signed footer. Administrative settings (Email,
   Membership, Body Stats, Units, Workout Preferences, Notifications,
   Leaderboard, Logout) are displaced to a Settings sub-screen reached
   via gear icon top-right.

   Typography deliberately departs from the rest of the app: Georgia
   13px body, sans-serif 9px metadata, italic Georgia subtitles + page
   titles. Profile is a display surface, not a navigation surface.
   See Bible §6.5 "Typography conventions (Profile-specific)" table.

   Truncation rules:
   - Rules: first 3, then "+ N more →" link.
   - Progress: first 3 most recent, then "View all N →".
   - Observations: first 3 most recent, then "View all N →".

   Affordance vocabulary on section headers:
   - ✎ pencil → user-configured (Plan, Equipment). Tap to edit.
   - 💬 chat glyph → user-authored-via-Coach (Rules). Created in chat.
   - (no glyph) → Coach-tracked / Coach-authored (Progress, Observations).
*/

// Display label helpers shared by landing and Plan sub-screen. Kept
// at module scope so the Plan sub-screen (built in a later turn) can
// reuse them without re-declaring.
const PLAN_GOAL_LABELS = {
  build_muscle: "Build Muscle",
  lose_weight: "Lose Weight",
  gain_strength: "Gain Strength",
  get_lean: "Get Lean",
};
const PLAN_LEVEL_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const PLAN_TIME_AWAY_LABELS = {
  current: "Currently training",
  lt1yr: "Less than a year",
  "1to3yr": "1–3 years",
  gt3yr: "More than 3 years",
};

// "Updated 2d ago" / "12D" formatters. Bible §6.5 calls for inline
// timestamps in sans-serif 9px spaced caps next to rule/observation
// rows (e.g. "12D"), and a longer signed-footer line ("updated 2d ago").
function formatDaysAgoCap(epochMs) {
  // Returns "12D" style. 0 → "TODAY". Caller wraps in spaced-caps styling.
  if (!epochMs) return "";
  const days = Math.max(0, Math.floor((Date.now() - epochMs) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "TODAY";
  return `${days}D`;
}

function formatUpdatedAgo(epochMs) {
  // Returns "2d ago" / "today" / etc for the signed-footer line.
  if (!epochMs) return "today";
  const days = Math.floor((Date.now() - epochMs) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function formatShortDateCap(epochMs) {
  // Returns "APR 8" style — short month + day, all caps. Used on PR
  // rows in Progress where the timestamp is a historical event (the
  // day the PR was hit) rather than a recency tag. Different from
  // formatDaysAgoCap which is used on Rules/Observations where "12D"
  // emphasizes "how long this has been on file".
  if (!epochMs) return "";
  const d = new Date(epochMs);
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${month} ${d.getDate()}`;
}

// Coach monogram — gold C in a gold-bordered circle. Used in the
// header bar (22px), the signed footer (18px), and inside the future
// CoachCTACard (24px). Single source so the visual identity is one
// piece of code.
function CoachMonogram({ size = 22, dark = true }) {
  const borderW = size >= 22 ? 1.5 : 1;
  return (
    <span style={{
      width: size, height: size, borderRadius: size / 2,
      border: `${borderW}px solid ${COLORS.gold}`,
      background: dark ? COLORS.goldHighlight : COLORS.bg,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontStyle: "italic", fontWeight: 700,
      color: COLORS.gold,
      fontSize: size >= 22 ? 12 : Math.max(9, Math.round(size * 0.55)),
      lineHeight: 1, flexShrink: 0,
    }}>C</span>
  );
}

function ProfileTab({
  userName,
  // Plan section data
  planGoal, fitnessLevel, timeAway, planDaysPerWeek,
  // Equipment
  equipmentCount,
  // Other section data
  coachRules, progressPRs, coachObservations,
  // Vitals
  sessionsCount, streakDays, mostTrainedMuscle,
  // Metadata
  coachFileOpenedAt, coachFileLastUpdatedAt,
  // Navigation handlers — sub-screens are built in later turns.
  // For now these set the appSubScreen state; the App routes the
  // open ones to real screens and silently no-ops the not-yet-built
  // ones (a TODO comment in App marks which are stubbed).
  onOpenSettings, onOpenPlan, onOpenEquipment, onOpenRules,
  onOpenProgress, onOpenObservations,
}) {
  // Empty-state detection. Bible §6.5: first-launch shows vitals in
  // muted gray, "New file" subtitle, one-liner italic placeholders per
  // section, and a "file opened today" signed footer.
  const isFirstLaunch = (sessionsCount || 0) === 0
    && (!coachRules || coachRules.length === 0)
    && (!progressPRs || progressPRs.length === 0)
    && (!coachObservations || coachObservations.length === 0);

  // Truncation helpers. Each section shows first 3 rows + a link
  // when there are more. Sort by recency for Rules/Observations,
  // by achievedAt for Progress (most recent first).
  //
  // Progress filters to PR-only and NEW-only rows. Plain gray rows
  // ("recent working set, not a PR") were dropped per session 36
  // feedback: if Progress is "numerical wins Coach has logged,"
  // every row should earn its place. A non-PR Bench Press session
  // belongs in workout history, not on a clipboard.
  const sortedRules = [...(coachRules || [])].sort((a, b) => b.createdAt - a.createdAt);
  const sortedObs = [...(coachObservations || [])].sort((a, b) => b.createdAt - a.createdAt);
  const sortedPRs = [...(progressPRs || [])]
    .filter((p) => p.isPR || p.isNew)
    .sort((a, b) => b.achievedAt - a.achievedAt);
  const visibleRules = sortedRules.slice(0, 3);
  const visibleObs = sortedObs.slice(0, 3);
  const visiblePRs = sortedPRs.slice(0, 3);
  const moreRules = sortedRules.length - visibleRules.length;
  const morePRs = sortedPRs.length - visiblePRs.length;
  const moreObs = sortedObs.length - visibleObs.length;

  // Identity name only — the subtitle ("Intermediate · Level 2 · Grinder")
  // was removed per session 36 feedback: gamification metadata (Level/badge)
  // is decorative noise on a Coach's File header. Name is the identity.
  // Level still surfaces inside the PLAN section row, where it actually
  // affects what Coach does with the file.
  const levelLabel = fitnessLevel ? PLAN_LEVEL_LABELS[fitnessLevel] : "Intermediate";

  // ── Shared styles ──
  // Section header treatment (session 36 lock — "option C"): sans-serif
  // 10px gold spaced caps over a thin dark-gold underline rule. Gives
  // each section a stamped magazine-column look that holds together
  // with the gold Coach monogram up top, without the airy thinness of
  // the original Georgia spaced-caps spec. The header is rendered as
  // a two-line block (label + hr) inside the section, not in the
  // sectionHeadRow flex row — see the JSX below.
  //
  // Divider strategy (session 36 lock):
  // - Section dividers (#2a2a2a hairline at section bottom) carry the
  //   visual structure. Sections are the real units of the file.
  // - No row dividers inside sections. Spacing + baseline rhythm carry
  //   the list. The clipboard / paper-artifact metaphor reads better
  //   with rows held together by typography than by grid lines.
  // - Signed footer keeps its dashed line — end-of-document signal.
  //
  // Edit affordance: removed entirely. The whole section header is
  // tappable; if the contents look configurable the user will tap.
  const TYPE = {
    body: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#e8e8e8", lineHeight: 1.5 },
    meta: { fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9, color: "#555", letterSpacing: 1.5 },
    sectionHead: { fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13, color: COLORS.gold, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
    sectionRule: { border: "none", height: 1, background: "#3a2e00", margin: 0, width: "100%" },
    rowVal: { fontSize: 11, color: "#aaa", whiteSpace: "nowrap" },
    rowValUp: { fontSize: 11, color: COLORS.gold, whiteSpace: "nowrap" },
    sigFooter: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#666", fontSize: 10 },
    tagInline: { color: COLORS.gold, fontSize: 9, letterSpacing: 1, marginLeft: 4, fontFamily: "-apple-system, system-ui, sans-serif" },
    viewAll: { padding: "10px 0 4px", fontSize: 10, color: "#666", textAlign: "right", letterSpacing: 0.5, fontFamily: "-apple-system, system-ui, sans-serif", background: "transparent", border: "none", width: "100%", cursor: "pointer" },
    emptyNote: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#666", fontSize: 12, lineHeight: 1.6, padding: "14px 0" },
  };

  // Row line — used by every section's content rows. No inline divider
  // anymore; sections own their own bottom hairline below.
  const rowLineStyle = () => ({
    padding: "10px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 14,
  });

  // Section block — adds a bottom hairline divider to separate sections.
  // The last section before the signed footer drops the line (the
  // dashed-rule footer divider takes over).
  const sectionBlockStyle = (isLast) => ({
    marginTop: 22,
    paddingBottom: 6,
    borderBottom: isLast ? "none" : "1px solid #2a2a2a",
  });
  // Header row — vertical stack: title row + gold rule. The whole block
  // is a single tappable button to preserve the section-tap behavior.
  const sectionHeadBtnStyle = {
    display: "flex", flexDirection: "column", gap: 6,
    background: "transparent", border: "none", padding: 0,
    width: "100%", cursor: "pointer", marginBottom: 12,
    textAlign: "left",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>

      {/* Header bar — gold C monogram + italic Georgia "Coach's File" +
          gear icon. 22px header height per Bible §6.5. */}
      <div style={{
        padding: "8px 24px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <CoachMonogram size={22} />
          <span style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            color: COLORS.gold,
            fontSize: 13,
          }}>Coach&apos;s File</span>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          style={{
            background: "transparent", border: "none", padding: 8, margin: -8,
            cursor: "pointer", color: "#666", display: "flex", alignItems: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, padding: "0 24px 24px", overflowY: "auto", minHeight: 0 }}>

        {/* Identity block — name only. Subtitle ("Intermediate · Level 2 ·
            Grinder") and the SESSIONS/STREAK/MOST TRAINED vitals strip
            were removed per session 36 feedback: the landing was reading
            cluttered, and Level/badge/streak surfaces decoratively rather
            than telling Coach anything new about the user. Vitals will
            return in v2 on the Home tab where they earn their place. */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 28,
            lineHeight: 1,
            letterSpacing: -0.5,
            color: COLORS.text,
          }}>{userName}</div>
        </div>

        {/* ── Section: PLAN ── */}
        <div style={sectionBlockStyle(false)}>
          <button onClick={onOpenPlan} style={sectionHeadBtnStyle}>
            <span style={TYPE.sectionHead}>PLAN</span>
            <hr style={TYPE.sectionRule} />
          </button>
          {(() => {
            // Time Away row shown only when fitnessLevel ≠ beginner AND
            // the user has actually set a timeAway value. On first launch
            // timeAway is null → row hidden. The Bible §6.5 spec says
            // "visible only when Level ≠ Beginner"; the locked HTML
            // reference for first-launch shows Intermediate without
            // a Time Away row, so we treat null as "not yet set, hide".
            const showTimeAway = fitnessLevel !== "beginner" && timeAway != null;
            const rows = [
              { label: "Goal", value: PLAN_GOAL_LABELS[planGoal] || "Build Muscle" },
              { label: "Level", value: levelLabel },
              ...(showTimeAway ? [{ label: "Time away", value: PLAN_TIME_AWAY_LABELS[timeAway] }] : []),
              { label: "Days / week", value: String(planDaysPerWeek || 3) },
            ];
            return rows.map((r) => (
              <div key={r.label} style={rowLineStyle()}>
                <span style={{ ...TYPE.body, flex: 1 }}>{r.label}</span>
                <span style={TYPE.rowVal}>{r.value}</span>
              </div>
            ));
          })()}
        </div>

        {/* ── Section: EQUIPMENT ── */}
        <div style={sectionBlockStyle(false)}>
          <button onClick={onOpenEquipment} style={sectionHeadBtnStyle}>
            <span style={TYPE.sectionHead}>EQUIPMENT</span>
            <hr style={TYPE.sectionRule} />
          </button>
          <button
            onClick={onOpenEquipment}
            style={{ ...rowLineStyle(), background: "transparent", border: "none", padding: "10px 0", width: "100%", cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left" }}
          >
            <span style={{ ...TYPE.body, flex: 1 }}>{equipmentCount || 0} items configured</span>
          </button>
        </div>

        {/* ── Section: RULES ── */}
        <div style={sectionBlockStyle(false)}>
          <button onClick={onOpenRules} style={sectionHeadBtnStyle}>
            <span style={TYPE.sectionHead}>RULES</span>
            <hr style={TYPE.sectionRule} />
          </button>
          {visibleRules.length === 0 ? (
            <div style={TYPE.emptyNote}>No rules yet. Tell Coach what to follow.</div>
          ) : (
            <>
              {visibleRules.map((r) => (
                <div key={r.id} style={rowLineStyle()}>
                  <span style={{ ...TYPE.body, flex: 1 }}>{r.text}</span>
                  <span style={{ ...TYPE.meta, whiteSpace: "nowrap", letterSpacing: 1 }}>{formatDaysAgoCap(r.createdAt)}</span>
                </div>
              ))}
              {moreRules > 0 && (
                <button onClick={onOpenRules} style={TYPE.viewAll}>+ {moreRules} more →</button>
              )}
            </>
          )}
        </div>

        {/* ── Section: PROGRESS ── */}
        <div style={sectionBlockStyle(false)}>
          <button onClick={onOpenProgress} style={sectionHeadBtnStyle}>
            <span style={TYPE.sectionHead}>PROGRESS</span>
            <hr style={TYPE.sectionRule} />
          </button>
          {visiblePRs.length === 0 ? (
            <div style={TYPE.emptyNote}>Your PRs and new lifts will appear here.</div>
          ) : (
            <>
              {visiblePRs.map((p) => (
                <div key={p.id} style={rowLineStyle()}>
                  <span style={{ ...TYPE.body, flex: 1 }}>
                    {p.exerciseName}
                    {p.isPR && <span style={TYPE.tagInline}>PR</span>}
                    {p.isNew && !p.isPR && <span style={TYPE.tagInline}>NEW</span>}
                  </span>
                  <span style={p.isPR ? TYPE.rowValUp : TYPE.rowVal}>{p.value}</span>
                  <span style={{ ...TYPE.meta, whiteSpace: "nowrap", letterSpacing: 1 }}>{formatShortDateCap(p.achievedAt)}</span>
                </div>
              ))}
              {morePRs > 0 && (
                <button onClick={onOpenProgress} style={TYPE.viewAll}>View all {sortedPRs.length} →</button>
              )}
            </>
          )}
        </div>

        {/* ── Section: OBSERVATIONS ── */}
        <div style={sectionBlockStyle(true)}>
          <button onClick={onOpenObservations} style={sectionHeadBtnStyle}>
            <span style={TYPE.sectionHead}>OBSERVATIONS</span>
            <hr style={TYPE.sectionRule} />
          </button>
          {visibleObs.length === 0 ? (
            <div style={TYPE.emptyNote}>Coach hasn&apos;t noticed anything yet.</div>
          ) : (
            <>
              {visibleObs.map((o) => (
                <div key={o.id} style={rowLineStyle()}>
                  <span style={{ ...TYPE.body, flex: 1 }}>{o.text}</span>
                  <span style={{ ...TYPE.meta, whiteSpace: "nowrap", letterSpacing: 1 }}>{formatDaysAgoCap(o.createdAt)}</span>
                </div>
              ))}
              {moreObs > 0 && (
                <button onClick={onOpenObservations} style={TYPE.viewAll}>View all {sortedObs.length} →</button>
              )}
            </>
          )}
        </div>

        {/* ── Signed footer ── */}
        <div style={{
          marginTop: 22,
          padding: "10px 0",
          borderTop: "1px dashed #262626",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={TYPE.sigFooter}>
            — C, {isFirstLaunch ? "file opened today" : `updated ${formatUpdatedAgo(coachFileLastUpdatedAt)}`}
          </span>
          <CoachMonogram size={18} />
        </div>

      </div>
    </div>
  );
}

/* ── Settings Sub-screen (Bible §6.5, gear icon from Coach's File) ─
   F1 "quiet plumbing" treatment: deliberately demoted visually so it
   reads as plumbing, not the main event. No gold on section headers,
   sans-serif throughout, iOS-familiar pattern.

   Two sections:
   - ACCOUNT: Email & password, Membership, Body Stats
   - APP: Units (Pounds toggle), Workout preferences (rest timer mode
     + countdown — reuses CustomDurationModal from Session 34),
     Notifications (streak reminders toggle), Leaderboard (inline gold
     toggle, no chevron)

   At the bottom: full-width red-bordered Logout button + version
   footer ("MYG · v2.6").

   Several rows route to sub-sub-screens that aren't built yet
   (Email & password editor, Membership viewer, Body Stats editor).
   For now those rows are no-ops with a TODO. Logout, Units toggle,
   Rest timer mode picker, Custom duration modal, Streak reminders
   toggle, and Leaderboard toggle are all wired to real App state.
*/

function SettingsSubscreen({
  onBack,
  // Real props wired to App state
  unitsPref, onChangeUnits,
  restTimerMode, onChangeRestTimerMode,
  restCountdownTarget, onChangeRestCountdownTarget,
  streakRemindersOn, onChangeStreakReminders,
  leaderboardOn, onChangeLeaderboard,
  onLogout,
  bodyStats,
  // Read-only for now — Email/Membership/Body Stats sub-sub-screens
  // are deferred to a later turn.
  emailDisplay = "alex@email.com",
  membershipDisplay = "Active · Renews Apr 15",
  appVersion = "v2.6",
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Rest timer picker modal: "menu" (mode + duration submenu) or null.
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [timerPickerView, setTimerPickerView] = useState("main"); // "main" | "countdownDuration"
  const [customDurationOpen, setCustomDurationOpen] = useState(false);

  // Formatters
  const restTimerLabel = (() => {
    if (restTimerMode === "off") return "Off";
    if (restTimerMode === "countup") return "Count up";
    if (restTimerMode === "countdown") {
      const m = Math.floor(restCountdownTarget / 60);
      const s = restCountdownTarget % 60;
      return `Countdown · ${m}:${String(s).padStart(2, "0")}`;
    }
    return "—";
  })();
  const unitsLabel = unitsPref === "kg" ? "Kilograms (kg)" : "Pounds (lbs)";
  const bodyStatsLabel = bodyStats
    ? `${Math.floor(bodyStats.heightIn / 12)}'${bodyStats.heightIn % 12}" · ${bodyStats.weightLb} lb · ${bodyStats.ageYears} yr · ${bodyStats.gender}`
    : "Not set";

  // Shared styles. F1 register — no gold on section headers, sans-serif
  // throughout, generic settings vocabulary.
  const headStyle = {
    fontFamily: "-apple-system, system-ui, sans-serif",
    fontSize: 11, letterSpacing: 1.5, color: "#666",
    fontWeight: 500, margin: "22px 0 6px",
    textTransform: "uppercase",
  };
  const headStyleFirst = { ...headStyle, marginTop: 0 };
  const rowStyle = {
    padding: "12px 0", display: "flex", alignItems: "center",
    width: "100%", background: "transparent", border: "none",
    borderBottom: "1px solid #1a1a1a",
    cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left",
  };
  const labelStyle = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14, color: "#e8e8e8" };
  const descStyle = { fontSize: 11, color: "#888", marginTop: 3, fontFamily: "-apple-system, system-ui, sans-serif" };
  const chev = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  // Inline toggle pill — gold accented when on, gray when off. Used for
  // Units (Pounds default; tap to flip to kg), Streak reminders, and
  // Leaderboard. Stops event propagation so wrapper-row taps don't fight.
  const Toggle = ({ on, onChange, ariaLabel }) => (
    <button
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: on ? COLORS.goldHighlight : "#1a1a1a",
        border: `1px solid ${on ? COLORS.gold : "#333"}`,
        position: "relative", flexShrink: 0, cursor: "pointer", padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 1,
        left: on ? "auto" : 1, right: on ? 1 : "auto",
        width: 16, height: 16, borderRadius: 8,
        background: on ? COLORS.gold : "#555",
        transition: "all 120ms ease",
      }} />
    </button>
  );

  // Segmented pill — two-option chooser (e.g. LBS / KG). Sits in the
  // toggle-position slot of a row. Unlike Toggle (binary on/off), a
  // SegmentedPill labels both options explicitly so the user doesn't
  // have to guess what "on" means.
  const SegmentedPill = ({ value, options, onChange }) => (
    <div style={{
      display: "inline-flex", borderRadius: 8,
      background: "#1a1a1a", border: "1px solid #333",
      padding: 2, flexShrink: 0,
    }}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
            style={{
              padding: "5px 12px", borderRadius: 6,
              background: selected ? COLORS.goldHighlight : "transparent",
              color: selected ? COLORS.gold : "#888",
              border: selected ? `1px solid ${COLORS.gold}` : "1px solid transparent",
              fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
              cursor: "pointer", fontFamily: "-apple-system, system-ui, sans-serif",
              textTransform: "uppercase",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  // Row builder — keeps the JSX from getting unreadable.
  // type: "nav" | "toggle" | "segmented" | "value"
  const Row = ({ label, desc, type = "nav", onClick, toggleOn, onToggle, segmentedValue, segmentedOptions, onSegmentedChange }) => {
    const content = (
      <>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>{label}</div>
          {desc && <div style={descStyle}>{desc}</div>}
        </div>
        {type === "nav" && chev}
        {type === "toggle" && <Toggle on={!!toggleOn} onChange={onToggle} ariaLabel={label} />}
        {type === "segmented" && (
          <SegmentedPill value={segmentedValue} options={segmentedOptions} onChange={onSegmentedChange} />
        )}
      </>
    );
    if (type === "toggle" || type === "segmented") {
      // Toggle/segmented rows aren't tappable as a whole — only the
      // control flips state.
      return <div style={rowStyle}>{content}</div>;
    }
    return <button onClick={onClick} style={rowStyle}>{content}</button>;
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative", background: COLORS.bg }}>
      {/* Header — back chevron + Settings title in Georgia 14px white */}
      <div style={{ padding: "8px 24px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ background: "transparent", border: "none", padding: 8, margin: -8, cursor: "pointer", color: "#888", display: "flex", alignItems: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: "#fff", fontSize: 14 }}>Settings</span>
      </div>

      <div style={{ flex: 1, padding: "0 24px 24px", overflowY: "auto", minHeight: 0 }}>

        {/* ── ACCOUNT ── */}
        <div style={headStyleFirst}>ACCOUNT</div>
        <Row label="Email & password" desc={emailDisplay} onClick={() => { /* TODO: email & password sub-screen */ }} />
        <Row label="Membership" desc={membershipDisplay} onClick={() => { /* TODO: membership viewer */ }} />
        <Row label="Body Stats" desc={bodyStatsLabel} onClick={() => { /* TODO: body stats editor — built in BodyStatsSubscreen */ }} />

        {/* ── APP ── */}
        <div style={headStyle}>APP</div>
        <Row
          label="Units"
          desc={unitsLabel}
          type="segmented"
          segmentedValue={unitsPref}
          segmentedOptions={[{ value: "lbs", label: "Lbs" }, { value: "kg", label: "Kg" }]}
          onSegmentedChange={onChangeUnits}
        />
        <Row
          label="Workout preferences"
          desc={restTimerLabel}
          onClick={() => { setTimerPickerView("main"); setTimerPickerOpen(true); }}
        />
        <Row
          label="Notifications"
          desc={streakRemindersOn ? "Streak reminders on" : "Streak reminders off"}
          onClick={() => { /* TODO: notifications sub-screen (more toggles incoming) */ }}
        />
        <Row
          label="Leaderboard"
          type="toggle"
          toggleOn={leaderboardOn}
          onToggle={onChangeLeaderboard}
        />

        {/* Logout button — restores the path lost when Coach's File
            displaced settings to this sub-screen. Same red-border /
            red-text vocabulary as the existing Logout button. */}
        <button
          onClick={() => setConfirmLogout(true)}
          style={{
            width: "100%", padding: 13, background: "transparent",
            border: "1px solid #442222", borderRadius: 10,
            color: "#cc4444", fontSize: 14, cursor: "pointer",
            marginTop: 24, display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, fontFamily: "inherit",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>

        {/* Version footer */}
        <div style={{
          textAlign: "center", fontSize: 10, color: "#444",
          marginTop: 18, letterSpacing: 1,
          fontFamily: "-apple-system, system-ui, sans-serif",
        }}>
          MYG · {appVersion}
        </div>
      </div>

      {/* ── Rest timer picker modal ──
          Two-level: main view (Count up / Countdown / Off) and the
          countdown duration submenu (preset durations + custom).
          Mirrors the in-workout gear menu pattern from WorkoutTab so
          Tyler doesn't see two different vocabularies for the same
          preference. */}
      {timerPickerOpen && (
        <>
          <div
            onClick={() => { setTimerPickerOpen(false); setTimerPickerView("main"); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }}
          />
          <div style={{
            position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: 8, width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            {timerPickerView === "main" ? (
              <>
                <div style={{ fontSize: 11, color: "#888", padding: "8px 12px 4px", letterSpacing: 1, fontFamily: "-apple-system, system-ui, sans-serif" }}>REST TIMER</div>
                {[
                  { id: "countup", label: "Count up" },
                  { id: "countdown", label: "Countdown" },
                  { id: "off", label: "Off" },
                ].map((opt) => {
                  const isSelected = restTimerMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === "countdown") {
                          onChangeRestTimerMode("countdown");
                          setTimerPickerView("countdownDuration");
                        } else {
                          onChangeRestTimerMode(opt.id);
                          setTimerPickerOpen(false);
                          setTimerPickerView("main");
                        }
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        width: "100%", padding: "12px 12px",
                        background: isSelected ? COLORS.goldHighlight : "transparent",
                        border: "none", borderRadius: 8,
                        color: isSelected ? COLORS.gold : "#fff", fontSize: 13,
                        fontWeight: isSelected ? 600 : 400, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      {opt.label}
                      {isSelected && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <button
                  onClick={() => setTimerPickerView("main")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "transparent", border: "none",
                    color: "#888", fontSize: 12, padding: "8px 12px 4px",
                    cursor: "pointer", fontFamily: "-apple-system, system-ui, sans-serif",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Countdown duration
                </button>
                {[60, 90, 120, 180].map((sec) => {
                  const m = Math.floor(sec / 60);
                  const s = sec % 60;
                  const label = `${m}:${String(s).padStart(2, "0")}`;
                  const isSelected = restCountdownTarget === sec;
                  return (
                    <button
                      key={sec}
                      onClick={() => {
                        onChangeRestCountdownTarget(sec);
                        setTimerPickerOpen(false);
                        setTimerPickerView("main");
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        width: "100%", padding: "12px 12px",
                        background: isSelected ? COLORS.goldHighlight : "transparent",
                        border: "none", borderRadius: 8,
                        color: isSelected ? COLORS.gold : "#fff", fontSize: 13,
                        fontWeight: isSelected ? 600 : 400, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      {label}
                      {isSelected && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => { setCustomDurationOpen(true); }}
                  style={{
                    display: "flex", alignItems: "center",
                    width: "100%", padding: "12px 12px",
                    background: "transparent", border: "none", borderRadius: 8,
                    color: "#fff", fontSize: 13, cursor: "pointer",
                    fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  Custom…
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Reuses Session 34 component verbatim. */}
      {customDurationOpen && (
        <CustomDurationModal
          initialSeconds={restCountdownTarget || 90}
          onCancel={() => setCustomDurationOpen(false)}
          onConfirm={(sec) => {
            onChangeRestCountdownTarget(sec);
            setCustomDurationOpen(false);
            setTimerPickerOpen(false);
            setTimerPickerView("main");
          }}
        />
      )}

      {/* Logout confirm modal — same pattern as the old in-Profile flow. */}
      {confirmLogout && (
        <>
          <div onClick={() => setConfirmLogout(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "22px 22px 18px", width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
              Log out?
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center" }}>
              You&apos;ll be returned to the welcome screen.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmLogout(false)}
                style={{
                  flex: 1, padding: "11px", background: "transparent",
                  border: `1px solid ${COLORS.border}`, borderRadius: 8,
                  color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmLogout(false); onLogout && onLogout(); }}
                style={{
                  flex: 1, padding: "11px", background: "#3A1A1A",
                  border: "1px solid #5A2A2A", borderRadius: 8,
                  color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── CoachCTACard — reusable gold-bordered card (Bible §6.5) ───────
   Coach monogram + title + italic body + arrow. Used inside the Rules
   sub-screen (populated state: "Add a rule via Coach"; empty state:
   "Set your first rule") and intended for any future "deep-link to
   Coach chat" surfaces. Tapping fires onClick — App-level prop wires
   it to switch to the Coach tab.
*/
function CoachCTACard({ title, body, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        background: COLORS.goldHighlight,
        border: `1px solid ${COLORS.gold}`,
        borderRadius: 10, marginTop: 18,
        width: "100%", cursor: "pointer",
        fontFamily: "inherit", color: "inherit", textAlign: "left",
      }}
    >
      <CoachMonogram size={24} dark={false} />
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 12, color: COLORS.gold,
        }}>{title}</div>
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic", color: "#888",
          fontSize: 10, marginTop: 2,
        }}>{body}</div>
      </div>
      <span style={{ color: COLORS.gold, fontSize: 14 }}>→</span>
    </button>
  );
}

/* ── SubscreenShell — shared chrome for all Coach's File sub-screens ──
   Header: back chevron + italic Georgia gold page title.
   Subtitle: italic Georgia gray, single line.
   Children: scrollable body.

   Every sub-screen on Coach's File (Plan / Rules / Progress /
   Observations) wears this shell so back-navigation and the
   "this is part of Coach's File" feel stay consistent.
*/
function SubscreenShell({ title, subtitle, onBack, children, footer }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative", background: COLORS.bg }}>
      <div style={{ padding: "8px 24px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ background: "transparent", border: "none", padding: 8, margin: -8, cursor: "pointer", color: "#888", display: "flex", alignItems: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic", color: COLORS.gold, fontSize: 14,
        }}>{title}</span>
      </div>
      <div style={{ flex: 1, padding: "0 24px 24px", overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {subtitle && (
          <div style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic", color: "#888",
            fontSize: 11, lineHeight: 1.6, marginBottom: 18,
          }}>{subtitle}</div>
        )}
        <div style={{ flex: 1 }}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

/* ── PlanSubscreen — P1 tap-to-expand inline edit (Bible §6.5) ──────
   Each field shows as a read-only row by default (label left, value
   right, small pencil glyph on far right). Tap the row → row expands
   inline with #0f0f0f background lift, showing chip picker for that
   field. Only one field in edit mode at a time. Selecting a chip
   commits immediately (no global save). Days/week field uses
   slider+number display instead of chips. Time Away row is visible
   only when Level ≠ Beginner; toggles in/out smoothly when Level
   changes.

   This is the canonical inline-edit pattern; Equipment and Body Stats
   inherit it.
*/
function PlanSubscreen({
  planGoal, fitnessLevel, timeAway, planDaysPerWeek,
  onChangeGoal, onChangeLevel, onChangeTimeAway, onChangeDaysPerWeek,
  onBack,
}) {
  // editingField ∈ "goal" | "level" | "timeAway" | "days" | null
  const [editingField, setEditingField] = useState(null);

  const showTimeAway = fitnessLevel !== "beginner";
  // If the user switches Level → beginner while editing Time away,
  // collapse the open row so we don't leave editingField pointing at
  // a hidden field.
  useEffect(() => {
    if (!showTimeAway && editingField === "timeAway") setEditingField(null);
  }, [showTimeAway, editingField]);

  // Field definitions in display order. Each has its own picker
  // rendered inside the expanded row. Keeping them inline (rather than
  // extracting per-field components) makes the open/closed state easy
  // to read — every field is one entry.
  const TYPE = {
    body: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#e8e8e8", lineHeight: 1.5 },
    rowVal: { fontSize: 11, color: "#aaa", whiteSpace: "nowrap" },
    pencil: { color: "#555", fontSize: 12 },
    editingTag: { color: COLORS.gold, fontSize: 11, fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" },
  };

  const Chip = ({ label, selected, onClick }) => (
    <button
      onClick={onClick}
      style={{
        padding: "6px 11px", borderRadius: 14,
        background: selected ? COLORS.goldHighlight : "transparent",
        border: `1px solid ${selected ? COLORS.gold : "#2a2a2a"}`,
        color: selected ? COLORS.gold : "#aaa",
        fontSize: 11, cursor: "pointer",
        fontFamily: "-apple-system, system-ui, sans-serif",
      }}
    >
      {label}
    </button>
  );

  // Renders a read-only collapsed row OR an expanded edit row.
  const renderField = (fieldKey, label, displayValue, pickerNode) => {
    const isEditing = editingField === fieldKey;
    const toggle = () => setEditingField(isEditing ? null : fieldKey);
    if (isEditing) {
      return (
        <div
          key={fieldKey}
          style={{
            padding: "14px 20px",
            background: "#0f0f0f",
            margin: "0 -20px",
            borderBottom: "1px solid #1a1a1a",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button
              onClick={toggle}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", fontFamily: "inherit", textAlign: "left", ...TYPE.body }}
            >{label}</button>
            <span style={TYPE.editingTag}>editing</span>
          </div>
          {pickerNode}
        </div>
      );
    }
    return (
      <button
        key={fieldKey}
        onClick={toggle}
        style={{
          width: "100%", padding: "10px 0",
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          borderBottom: "1px solid #1a1a1a",
          gap: 14, background: "transparent", border: "none", borderBottom: "1px solid #1a1a1a",
          cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left",
        }}
      >
        <span style={{ ...TYPE.body, flex: 1 }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={TYPE.rowVal}>{displayValue}</span>
          <span style={TYPE.pencil}>✎</span>
        </span>
      </button>
    );
  };

  return (
    <SubscreenShell
      title="Plan"
      subtitle="What Coach uses to build your sessions."
      onBack={onBack}
    >
      {renderField(
        "goal",
        "Goal",
        PLAN_GOAL_LABELS[planGoal] || "Build Muscle",
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(PLAN_GOAL_LABELS).map(([key, label]) => (
            <Chip key={key} label={label} selected={planGoal === key} onClick={() => { onChangeGoal(key); setEditingField(null); }} />
          ))}
        </div>
      )}

      {renderField(
        "level",
        "Level",
        fitnessLevel ? PLAN_LEVEL_LABELS[fitnessLevel] : "Intermediate",
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(PLAN_LEVEL_LABELS).map(([key, label]) => (
            <Chip key={key} label={label} selected={fitnessLevel === key} onClick={() => { onChangeLevel(key); setEditingField(null); }} />
          ))}
        </div>
      )}

      {showTimeAway && renderField(
        "timeAway",
        "Time away",
        timeAway ? PLAN_TIME_AWAY_LABELS[timeAway] : "Currently training",
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(PLAN_TIME_AWAY_LABELS).map(([key, label]) => (
            <Chip key={key} label={label} selected={timeAway === key} onClick={() => { onChangeTimeAway(key); setEditingField(null); }} />
          ))}
        </div>
      )}

      {renderField(
        "days",
        "Days / week",
        String(planDaysPerWeek || 3),
        <div>
          {/* Slider + number readout. 1–7. Commit immediately on each
              change so backing out preserves the current value. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <input
              type="range" min={1} max={7} step={1}
              value={planDaysPerWeek || 3}
              onChange={(e) => onChangeDaysPerWeek(parseInt(e.target.value, 10))}
              style={{ flex: 1, accentColor: COLORS.gold }}
            />
            <span style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 18, color: COLORS.gold,
              minWidth: 22, textAlign: "right",
            }}>{planDaysPerWeek || 3}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9, color: "#555", letterSpacing: 1 }}>
            <span>1</span><span>7</span>
          </div>
        </div>
      )}
    </SubscreenShell>
  );
}

/* ── RulesSubscreen (Bible §6.5) ─────────────────────────────────────
   Sentence list, inline timestamps, ⋯ delete per row. Below the list:
   gold Coach-CTA card for adding via chat. Counter line at bottom
   ("4 of 15 rules"). Empty state: centered italic placeholder +
   "Set your first rule" CTA + EXAMPLES block.
*/
function RulesSubscreen({ coachRules, onDeleteRule, onOpenCoachChat, onBack }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const sorted = [...(coachRules || [])].sort((a, b) => b.createdAt - a.createdAt);
  const ruleCap = 15; // Bible §12.6

  const TYPE = {
    body: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#e8e8e8", lineHeight: 1.5 },
    meta: { fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9, color: "#555", letterSpacing: 1 },
    counter: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#555", fontSize: 10, textAlign: "center", marginTop: 16 },
  };

  if (sorted.length === 0) {
    return (
      <SubscreenShell
        title="Rules"
        subtitle="Standing orders Coach follows. Set them by chatting with Coach."
        onBack={onBack}
      >
        <div style={{ textAlign: "center", padding: "32px 16px 24px", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#888", fontSize: 13, lineHeight: 1.7 }}>
          You haven&apos;t set any rules.<br />Tell Coach what to follow and he&apos;ll write it down.
        </div>
        <CoachCTACard
          title="Set your first rule"
          body="Open Coach chat to get started."
          onClick={onOpenCoachChat}
        />
        <div style={{
          marginTop: 22, fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic", color: "#555", fontSize: 11,
          lineHeight: 1.6, padding: "0 14px",
        }}>
          <span style={{ color: COLORS.gold, fontStyle: "normal", fontSize: 10, letterSpacing: 1, fontFamily: "-apple-system, system-ui, sans-serif" }}>EXAMPLES</span>
          <br />
          <span>&quot;No deadlifts on Mondays&quot;<br />&quot;Keep sessions under 60 minutes&quot;<br />&quot;Always start with a compound lift&quot;</span>
        </div>
      </SubscreenShell>
    );
  }

  return (
    <SubscreenShell
      title="Rules"
      subtitle="Standing orders Coach follows. Set them by chatting with Coach."
      onBack={onBack}
    >
      {sorted.map((r) => (
        <div key={r.id} style={{
          padding: "10px 0", display: "flex",
          justifyContent: "space-between", alignItems: "baseline",
          borderBottom: "1px solid #1a1a1a", gap: 14,
        }}>
          <span style={{ ...TYPE.body, flex: 1 }}>{r.text}</span>
          <span style={{ ...TYPE.meta, whiteSpace: "nowrap" }}>{formatDaysAgoCap(r.createdAt)}</span>
          <button
            onClick={() => setConfirmDeleteId(r.id)}
            aria-label="Delete rule"
            style={{ background: "transparent", border: "none", padding: 4, margin: -4, cursor: "pointer", color: "#666", fontSize: 14, flexShrink: 0 }}
          >⋯</button>
        </div>
      ))}
      <CoachCTACard
        title="Add a rule via Coach"
        body="Tell Coach in chat, he'll write it down."
        onClick={onOpenCoachChat}
      />
      <div style={TYPE.counter}>{sorted.length} of {ruleCap} rules</div>

      {/* Per-row delete confirm */}
      {confirmDeleteId && (
        <>
          <div onClick={() => setConfirmDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "22px 22px 18px", width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
              Delete this rule?
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" }}>
              &ldquo;{sorted.find((r) => r.id === confirmDeleteId)?.text}&rdquo;
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, padding: 11, background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={() => { onDeleteRule(confirmDeleteId); setConfirmDeleteId(null); }}
                style={{ flex: 1, padding: 11, background: "#3A1A1A", border: "1px solid #5A2A2A", borderRadius: 8, color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >Delete</button>
            </div>
          </div>
        </>
      )}
    </SubscreenShell>
  );
}

/* ── ProgressSubscreen (Bible §6.5) ─────────────────────────────────
   Read-only. Rows grouped by time period with small spaced-cap section
   headers (THIS WEEK / EARLIER THIS MONTH / LAST MONTH / EARLIER).
   PR rows show gold value + gold "PR" tag, NEW rows show "NEW" tag.
   No ⋯ menu (Coach owns the data). Signed "— C" footer at bottom.

   Filter matches the landing: only PR-or-NEW rows shown — non-PR
   working sets belong in workout history, not on Coach's File
   (session 36 decision).
*/
function ProgressSubscreen({ progressPRs, onBack }) {
  const TYPE = {
    body: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#e8e8e8", lineHeight: 1.5 },
    meta: { fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9, color: "#555", letterSpacing: 1.5 },
    rowVal: { fontSize: 11, color: "#aaa", whiteSpace: "nowrap" },
    rowValUp: { fontSize: 11, color: COLORS.gold, whiteSpace: "nowrap" },
    tagInline: { color: COLORS.gold, fontSize: 9, letterSpacing: 1, marginLeft: 4, fontFamily: "-apple-system, system-ui, sans-serif" },
    sigFooter: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#666", fontSize: 10 },
  };

  // Time-period bucketing. Bible vocabulary:
  //   THIS WEEK (≤ 7 days), EARLIER THIS MONTH (8–30), LAST MONTH (31–60), EARLIER (>60).
  // Computed from achievedAt relative to now.
  const now = Date.now();
  const filtered = (progressPRs || []).filter((p) => p.isPR || p.isNew);
  const buckets = { "This week": [], "Earlier this month": [], "Last month": [], "Earlier": [] };
  for (const p of filtered) {
    const days = Math.floor((now - p.achievedAt) / (24 * 60 * 60 * 1000));
    if (days <= 7) buckets["This week"].push(p);
    else if (days <= 30) buckets["Earlier this month"].push(p);
    else if (days <= 60) buckets["Last month"].push(p);
    else buckets["Earlier"].push(p);
  }
  // Sort within each bucket: most recent first.
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => b.achievedAt - a.achievedAt);
  }

  const isEmpty = filtered.length === 0;
  const footer = (
    <div style={{
      marginTop: 22, paddingTop: 12,
      borderTop: "1px dashed #1a1a1a",
      textAlign: "right",
    }}>
      <span style={TYPE.sigFooter}>— C{isEmpty ? ", waiting on first session" : ""}</span>
    </div>
  );

  return (
    <SubscreenShell
      title="Progress"
      subtitle="Numerical wins Coach has logged from your sessions."
      onBack={onBack}
      footer={footer}
    >
      {isEmpty ? (
        <div style={{ textAlign: "center", padding: "48px 16px 32px", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#888", fontSize: 13, lineHeight: 1.7 }}>
          Nothing logged yet.<br />Your first PR will show up here.
        </div>
      ) : (
        Object.entries(buckets).map(([periodLabel, rows]) => {
          if (rows.length === 0) return null;
          return (
            <div key={periodLabel}>
              <div style={{ ...TYPE.meta, margin: "18px 0 8px", textTransform: "uppercase" }}>{periodLabel}</div>
              {rows.map((p) => (
                <div key={p.id} style={{
                  padding: "10px 0", display: "flex",
                  justifyContent: "space-between", alignItems: "baseline",
                  borderBottom: "1px solid #1a1a1a", gap: 14,
                }}>
                  <span style={{ ...TYPE.body, flex: 1 }}>
                    {p.exerciseName}
                    {p.isPR && <span style={TYPE.tagInline}>PR</span>}
                    {p.isNew && !p.isPR && <span style={TYPE.tagInline}>NEW</span>}
                  </span>
                  <span style={p.isPR ? TYPE.rowValUp : TYPE.rowVal}>{p.value}</span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </SubscreenShell>
  );
}

/* ── ObservationsSubscreen (Bible §6.5) ─────────────────────────────
   Same row grammar as Rules: sentence + inline timestamp + ⋯ delete.
   NO CoachCTACard (Coach writes these, user doesn't add). At the bottom:
   red-bordered "Reset all observations" destructive button. Empty state:
   placeholder + signed "— C" footer, no CTA.
*/
function ObservationsSubscreen({ coachObservations, onDeleteObservation, onResetAll, onBack }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const sorted = [...(coachObservations || [])].sort((a, b) => b.createdAt - a.createdAt);

  const TYPE = {
    body: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#e8e8e8", lineHeight: 1.5 },
    meta: { fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 9, color: "#555", letterSpacing: 1 },
    sigFooter: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#666", fontSize: 10 },
  };

  if (sorted.length === 0) {
    const footer = (
      <div style={{
        marginTop: 22, paddingTop: 12,
        borderTop: "1px dashed #1a1a1a",
        textAlign: "right",
      }}>
        <span style={TYPE.sigFooter}>— C</span>
      </div>
    );
    return (
      <SubscreenShell
        title="Observations"
        subtitle="Patterns Coach has noticed about how you train."
        onBack={onBack}
        footer={footer}
      >
        <div style={{ textAlign: "center", padding: "48px 16px 32px", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", color: "#888", fontSize: 13, lineHeight: 1.7 }}>
          Coach hasn&apos;t noticed anything yet.<br />A few sessions in, patterns will appear here.
        </div>
      </SubscreenShell>
    );
  }

  return (
    <SubscreenShell
      title="Observations"
      subtitle="Patterns Coach has noticed about how you train."
      onBack={onBack}
    >
      {sorted.map((o) => (
        <div key={o.id} style={{
          padding: "10px 0", display: "flex",
          justifyContent: "space-between", alignItems: "baseline",
          borderBottom: "1px solid #1a1a1a", gap: 14,
        }}>
          <span style={{ ...TYPE.body, flex: 1 }}>{o.text}</span>
          <span style={{ ...TYPE.meta, whiteSpace: "nowrap" }}>{formatDaysAgoCap(o.createdAt)}</span>
          <button
            onClick={() => setConfirmDeleteId(o.id)}
            aria-label="Delete observation"
            style={{ background: "transparent", border: "none", padding: 4, margin: -4, cursor: "pointer", color: "#666", fontSize: 14, flexShrink: 0 }}
          >⋯</button>
        </div>
      ))}

      {/* Reset all destructive button — red-bordered transparent bg,
          italic Georgia gray text. Matches the Logout button vocabulary
          but in the body of the screen rather than at the very bottom. */}
      <button
        onClick={() => setConfirmResetAll(true)}
        style={{
          width: "100%", padding: 12, marginTop: 24,
          background: "transparent",
          border: "1px solid #442222", borderRadius: 8,
          color: "#cc4444", fontSize: 12,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic", cursor: "pointer",
        }}
      >Reset all observations</button>

      {confirmDeleteId && (
        <>
          <div onClick={() => setConfirmDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "22px 22px 18px", width: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
              Delete this observation?
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" }}>
              &ldquo;{sorted.find((o) => o.id === confirmDeleteId)?.text}&rdquo;
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, padding: 11, background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={() => { onDeleteObservation(confirmDeleteId); setConfirmDeleteId(null); }}
                style={{ flex: 1, padding: 11, background: "#3A1A1A", border: "1px solid #5A2A2A", borderRadius: 8, color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >Delete</button>
            </div>
          </div>
        </>
      )}

      {confirmResetAll && (
        <>
          <div onClick={() => setConfirmResetAll(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "22px 22px 18px", width: 300,
            boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          }}>
            <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
              Reset all observations?
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center" }}>
              Coach will start over watching how you train. This can&apos;t be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmResetAll(false)}
                style={{ flex: 1, padding: 11, background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={() => { onResetAll(); setConfirmResetAll(false); }}
                style={{ flex: 1, padding: 11, background: "#3A1A1A", border: "1px solid #5A2A2A", borderRadius: 8, color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >Reset all</button>
            </div>
          </div>
        </>
      )}
    </SubscreenShell>
  );
}

/* ── Tab Bar ──────────────────────────────────────────────────── */

function TabBar({ active, onTab }) {
  const tabs = [
    { id: "home", label: "Home", icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg> },
    { id: "workout", label: "Workout", icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg> },
    { id: "coach", label: "Coach", icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg> },
    { id: "exercises", label: "Exercises", icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
    { id: "profile", label: "Profile", icon: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg> },
  ];
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-around",
      // Top padding 10px, sides 0, bottom: 2px PLUS the home indicator inset.
      // calc() with env(safe-area-inset-bottom) lets the bar's background fill
      // down to the screen's actual bottom edge while the icons sit clear of
      // the iOS home indicator. This is the exact pattern Apple uses in their
      // own apps' tab bars.
      padding: "10px 0 calc(2px + env(safe-area-inset-bottom)) 0",
      borderTop: `1px solid ${COLORS.border}`,
      background: COLORS.bg,
      flexShrink: 0,
    }}>
      {tabs.map((t) => { const a = active === t.id; const c = a ? COLORS.gold : COLORS.inactive; return <button key={t.id} onClick={() => onTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 8px" }}>{t.icon(c)}<span style={{ fontSize: 10, color: c, fontWeight: a ? 600 : 400 }}>{t.label}</span></button>; })}
    </div>
  );
}

/* ── MAIN APP ────────────────────────────────────────────────── */

export default function MYGFitness() {
  // ── Hydrate from localStorage once on mount ──
  // See the Session Persistence block at the top of this file for the
  // full pattern. If a valid snapshot with onboardingComplete=true exists,
  // every piece of state below is seeded from it. Otherwise each piece
  // falls back to its fresh-user default.
  //
  // We read the snapshot once and stash it in a ref so every useState
  // initializer sees the same hydration result. Ref (not state) because
  // we never re-read it — subsequent writes are driven by the save
  // effect below.
  const hydrated = useRef(null);
  if (hydrated.current === null) {
    hydrated.current = loadSnapshot() || {};
  }
  const h = hydrated.current;
  const hasCompletedOnboarding = !!h.onboardingComplete;

  const [screen, setScreen] = useState(hasCompletedOnboarding ? "app" : "welcome");
  const [onboardingComplete, setOnboardingComplete] = useState(hasCompletedOnboarding);
  const [activeTab, setActiveTab] = useState(h.activeTab || "home");
  const [equipPreset, setEquipPreset] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(() => h.selectedEquipment || new Set());

  // ── User name — single source of truth ──
  // Collected on the Name screen (Screen 8). Defaults to Tyler if the
  // user skips or leaves it blank. Threaded to Home, Profile, and Coach
  // so the name renders identically everywhere. See Bible §6.1.
  const [userName, setUserName] = useState(h.userName || "Tyler");

  // ── Fitness level + time-away ──
  // Collected on Screens 3 and 3b. fitnessLevel ∈ {beginner, intermediate, advanced, null}.
  // timeAway ∈ {current, lt1yr, 1to3yr, gt3yr, null} — only meaningful for
  // intermediate/advanced; beginners skip Screen 3b entirely. Both feed the
  // future Coach AI context packet (Bible §10 returning-lifter awareness)
  // and surface in the Plan section of Coach's File (Bible §6.5 v26).
  // Persisted as of Session 36 — see note in saveSnapshot above.
  const [fitnessLevel, setFitnessLevel] = useState(h.fitnessLevel || null);
  const [timeAway, setTimeAway] = useState(h.timeAway || null);

  const goTo = (s) => setScreen(s);

  // Progress bar steps. Beginner skips the timeaway screen (asking a beginner
  // about time away from training is incoherent), so the total step count
  // shrinks for that branch. Recomputed every render — if the user changes
  // their level on Screen 3 via Back, the bar recalculates correctly.
  const progressScreens = fitnessLevel === "beginner"
    ? ["goals", "level", "aboutyou", "days", "equipment", "account", "name"]
    : ["goals", "level", "timeaway", "aboutyou", "days", "equipment", "account", "name"];
  const pIdx = progressScreens.indexOf(screen);

  // In-app sub-screens that overlay the tab UI (e.g. equipment editor opened
  // from Profile or Exercises). null = normal tab view.
  const [appSubScreen, setAppSubScreen] = useState(null);
  const openEquipmentEditor = () => setAppSubScreen("equipment_editor");
  const closeEquipmentEditor = () => setAppSubScreen(null);

  // ── Online / Offline detector ──
  // Used to gracefully disable Coach input when the user is offline.
  // The rest of the app works fully offline (exercise library is
  // shipped in the bundle, workouts write locally). Only the Coach's
  // live chat needs the network. See Bible §21.13 (offline behavior).
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine !== false;
  });
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ── Coach input focus state ──
  // Lifted to App because the TabBar and Coach header visibility both
  // depend on it. When the user focuses the Coach input, the TabBar
  // collapses and the Coach header hides so the composing surface feels
  // the full phone height, matching the pattern in every major chat app
  // (Claude, iMessage, WhatsApp, Slack, etc.). Blurring restores both.
  const [coachInputFocused, setCoachInputFocused] = useState(false);

  // ── Coach chat state — lifted to App per Bible §4.1/§4.2 ──
  // Multiple chats stored as an array. `currentCoachChatId` selects
  // which one is visible. Chats never auto-reset; user starts a new
  // chat via the "New Chat" button in the Coach tab header. History
  // drawer lists all past chats and allows rename + delete.
  //
  // Chat shape:
  //   { id, createdAt, messages: [], customName?: string }
  // Default name is derived from createdAt ("Apr 19 · 3:42 PM").
  // customName is set only when the user renames a chat.
  //
  // Spam prevention (Bible §4.2): tapping New Chat when the current
  // chat has zero messages is a no-op — we stay on the current empty
  // chat. Similarly, switching AWAY from an empty chat auto-prunes
  // that chat (unless it's the only chat). This prevents the history
  // list from bloating with empties.
  //
  // 📝 In the real build, chats persist via AsyncStorage and only the
  // last 20 messages of the active chat are sent to the API per call.
  // In the prototype this is UI-only; no API is hit.
  // Seed chats + current id together so they stay in sync. If the
  // hydrated snapshot has chats, use them and the saved active id (with
  // a guard that the id still exists). Otherwise mint a fresh chat and
  // point at it.
  const initialChatState = (() => {
    if (h.coachChats && h.coachChats.length > 0) {
      const activeExists = h.currentCoachChatId && h.coachChats.some((c) => c.id === h.currentCoachChatId);
      return {
        chats: h.coachChats,
        activeId: activeExists ? h.currentCoachChatId : h.coachChats[0].id,
      };
    }
    const firstId = `c${Date.now()}`;
    return {
      chats: [{ id: firstId, createdAt: Date.now(), messages: [] }],
      activeId: firstId,
    };
  })();
  const [coachChats, setCoachChats] = useState(initialChatState.chats);
  const [currentCoachChatId, setCurrentCoachChatId] = useState(initialChatState.activeId);

  // ── Custom exercises (Bible §3.4, §18) ──
  // User-created exercises that mix into the library alphabetically but
  // are invisible to Coach AI. Shape matches library exercises (id, name,
  // primary, secondary, type, variants) plus isCustom: true and
  // createdAt. Single-variant by default — the creation form collects
  // one equipment id which becomes the sole variant. Stored in App state
  // and persisted alongside everything else in §21.7.
  const [customExercises, setCustomExercises] = useState(() => h.customExercises || []);

  // ── Exercise sort preference ──
  // Persisted user preference for the Exercises tab list order. Three
  // modes: alphabetical, recent (most-recently-logged first), frequency
  // (most-often-logged first). Each mode has a direction flag that the
  // sort button toggles on tap. Default is alphabetical ascending, which
  // is the natural "browse" order.
  const [exerciseSort, setExerciseSort] = useState(() => h.exerciseSort || { mode: "alpha", dir: "asc" });

  // ── Rest timer preferences ──
  // Lifted from per-workout state so the user's preferred mode and
  // countdown duration persist across workouts. Snapshot-persisted.
  // Cleared on logout (like other prefs). Profile tab redesign session
  // will add a Settings row that surfaces these for direct editing;
  // for now the only change UI is the in-workout gear menu.
  const [restTimerModePref, setRestTimerModePref] = useState(() => h.restTimerModePref || "countup");
  const [restCountdownTargetPref, setRestCountdownTargetPref] = useState(() => typeof h.restCountdownTargetPref === "number" ? h.restCountdownTargetPref : 90);

  const addCustomExercise = (ex) => {
    setCustomExercises((prev) => [...prev, ex]);
  };
  const updateCustomExercise = (id, patch) => {
    setCustomExercises((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
  };
  const deleteCustomExercise = (id) => {
    setCustomExercises((prev) => prev.filter((x) => x.id !== id));
  };

  const currentCoachChat = coachChats.find((c) => c.id === currentCoachChatId) || coachChats[0];

  const appendCoachMessage = (msg) => {
    setCoachChats((prev) => prev.map((c) =>
      c.id === currentCoachChatId ? { ...c, messages: [...c.messages, msg] } : c
    ));
  };

  const startNewCoachChat = () => {
    // Spam prevention: if current chat is already empty, stay on it.
    // The user already has an empty chat ready to type in.
    const current = coachChats.find((c) => c.id === currentCoachChatId);
    if (current && current.messages.length === 0) return;
    const newId = `c${Date.now()}`;
    setCoachChats((prev) => [{ id: newId, createdAt: Date.now(), messages: [] }, ...prev]);
    setCurrentCoachChatId(newId);
  };

  const switchCoachChat = (id) => {
    if (id === currentCoachChatId) return;
    setCoachChats((prev) => {
      // Auto-prune the chat we're LEAVING if it's empty (unless it's
      // the only chat). Keeps the history drawer from bloating.
      const leaving = prev.find((c) => c.id === currentCoachChatId);
      if (leaving && leaving.messages.length === 0 && prev.length > 1) {
        return prev.filter((c) => c.id !== currentCoachChatId);
      }
      return prev;
    });
    setCurrentCoachChatId(id);
  };

  const deleteCoachChat = (id) => {
    setCoachChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      // If we just deleted the active chat, switch to the next one
      // (or create a fresh empty chat if nothing remains).
      if (id === currentCoachChatId) {
        if (next.length === 0) {
          const newId = `c${Date.now()}`;
          const fresh = { id: newId, createdAt: Date.now(), messages: [] };
          setCurrentCoachChatId(newId);
          return [fresh];
        }
        setCurrentCoachChatId(next[0].id);
      }
      return next;
    });
  };

  const renameCoachChat = (id, newName) => {
    const trimmed = (newName || "").trim();
    setCoachChats((prev) => prev.map((c) =>
      c.id === id
        ? { ...c, customName: trimmed.length > 0 ? trimmed : undefined }
        : c
    ));
  };

  // ── Active workout lifted to App ──
  // The active workout object survives tab switches because it lives here,
  // not inside WorkoutTab. The SessionBar mounted above the TabBar lets
  // the user re-enter the logger from any tab.
  //
  // Hydrated from snapshot if present. hydrateActiveWorkout has already
  // turned startTime back into a real Date. The rest timer keeps its
  // startTs (a fixed numeric timestamp), so on reload the timer picks
  // up counting from the original moment it was started, not from
  // reload time.
  const [activeWorkout, setActiveWorkout] = useState(h.activeWorkout || null);
  const [workoutMinimized, setWorkoutMinimized] = useState(false);
  const [finishedSession, setFinishedSession] = useState(null);
  // workoutHistory: if we have a snapshot, use it (including empty array —
  // user has logged nothing yet). Only fall back to the mock when no
  // snapshot exists at all. That way logout (which clears the snapshot)
  // brings back the mock demo data, as discussed.
  const [workoutHistory, setWorkoutHistory] = useState(h.workoutHistory !== null && h.workoutHistory !== undefined ? h.workoutHistory : MOCK_WORKOUT_HISTORY);
  const [openHistoryId, setOpenHistoryId] = useState(null);

  // ── Coach's File state (Bible §6.5, v26) ──
  // Backs the redesigned Profile tab. Same hydration pattern as
  // workoutHistory above: if a snapshot exists with non-null arrays,
  // use them (including empty); otherwise seed with mock data so the
  // landing page demos correctly on first run.
  //
  // Mutations live in the App so the landing and each sub-screen share
  // a single source of truth. Truncation counts on the landing
  // ("+ 1 more →", "View all 7 →") are derived from .length.
  const [planGoal, setPlanGoal] = useState(h.planGoal || "build_muscle");
  const [planDaysPerWeek, setPlanDaysPerWeek] = useState(typeof h.planDaysPerWeek === "number" ? h.planDaysPerWeek : 3);
  const [coachRules, setCoachRules] = useState(h.coachRules !== null && h.coachRules !== undefined ? h.coachRules : MOCK_COACH_RULES);
  const [coachObservations, setCoachObservations] = useState(h.coachObservations !== null && h.coachObservations !== undefined ? h.coachObservations : MOCK_COACH_OBSERVATIONS);
  const [progressPRs, setProgressPRs] = useState(h.progressPRs !== null && h.progressPRs !== undefined ? h.progressPRs : MOCK_PROGRESS_PRS);
  const [bodyStats, setBodyStats] = useState(h.bodyStats || MOCK_BODY_STATS);
  // First-open / last-update timestamps for the signed footer. If we
  // have no snapshot the file is "opened today" — store now. Last update
  // is whichever of the section mutations was most recent.
  const [coachFileOpenedAt, setCoachFileOpenedAt] = useState(typeof h.coachFileOpenedAt === "number" ? h.coachFileOpenedAt : Date.now());
  const [coachFileLastUpdatedAt, setCoachFileLastUpdatedAt] = useState(typeof h.coachFileLastUpdatedAt === "number" ? h.coachFileLastUpdatedAt : NOW_FOR_SEED - 2 * DAY);
  // Settings prefs surfaced on the Settings sub-screen.
  const [unitsPref, setUnitsPref] = useState(h.unitsPref === "kg" ? "kg" : "lbs");
  const [streakRemindersOn, setStreakRemindersOn] = useState(typeof h.streakRemindersOn === "boolean" ? h.streakRemindersOn : true);
  const [leaderboardOn, setLeaderboardOn] = useState(typeof h.leaderboardOn === "boolean" ? h.leaderboardOn : false);

  // ── Save effect ──
  // Fires any time a persisted piece of state changes. saveSnapshot
  // handles the serialization (Dates → ISO strings, Set → Array) and
  // silently no-ops if localStorage isn't available (e.g. inside the
  // Claude artifact sandbox).
  //
  // Note: isOnline, appSubScreen, workoutMinimized, finishedSession,
  // openHistoryId, equipPreset are deliberately NOT in the dep array.
  // They're transient UI state; we always want them to start fresh on
  // reload.
  //
  // The rest timer ticks every second but its startTs is a fixed
  // number stored inside activeWorkout. Elapsed is computed from
  // Date.now() - startTs on each render. So this effect only fires
  // when activeWorkout itself changes (start, add set, check set,
  // etc) — not on every tick.
  useEffect(() => {
    saveSnapshot({
      onboardingComplete,
      userName,
      selectedEquipment,
      fitnessLevel,
      timeAway,
      activeTab,
      activeWorkout,
      coachChats,
      currentCoachChatId,
      workoutHistory,
      customExercises,
      exerciseSort,
      restTimerModePref,
      restCountdownTargetPref,
      planGoal,
      planDaysPerWeek,
      coachRules,
      coachObservations,
      progressPRs,
      bodyStats,
      coachFileOpenedAt,
      coachFileLastUpdatedAt,
      unitsPref,
      streakRemindersOn,
      leaderboardOn,
    });
  }, [
    onboardingComplete,
    userName,
    selectedEquipment,
    fitnessLevel,
    timeAway,
    activeTab,
    activeWorkout,
    coachChats,
    currentCoachChatId,
    workoutHistory,
    customExercises,
    exerciseSort,
    restTimerModePref,
    restCountdownTargetPref,
    planGoal,
    planDaysPerWeek,
    coachRules,
    coachObservations,
    progressPRs,
    bodyStats,
    coachFileOpenedAt,
    coachFileLastUpdatedAt,
    unitsPref,
    streakRemindersOn,
    leaderboardOn,
  ]);

  const startEmptyWorkout = () => {
    const now = new Date();
    setActiveWorkout({
      exercises: [],
      workoutName: deriveWorkoutName([], now),
      startTime: now,
      // restTimerMode and countdown target now live on App-level prefs
      // (restTimerModePref / restCountdownTargetPref) so they persist
      // across workouts. WorkoutTab and SessionBar receive them as props.
      restTimer: null,
      nameWasEdited: false,
    });
    setWorkoutMinimized(false);
  };

  // ── Repeat This Workout (Bible §14, shipped this session) ──
  // Spawns a fresh active workout from a past session. Each exercise comes
  // back with the same number of sets it had in the source session, but the
  // weight/reps fields are PLACEHOLDERS pulled from the user's most-recent
  // log of that variant — not from the source session itself. That matches
  // how the rest of the placeholder system works ("show me where I last
  // left off"), and keeps Repeat consistent with Add Exercise.
  //
  // Exercises whose names no longer resolve (deleted custom exercises,
  // hypothetical library renames) are silently skipped — by spec.
  //
  // Workout name auto-derives from the resolved exercise list, same as a
  // fresh workout. The user can rename freely after spawn.
  const repeatWorkoutFromSession = (session) => {
    if (!session) return;
    const now = new Date();
    const newExercises = [];
    for (const sessionEx of session.exercises) {
      const exDef = findExerciseByName(sessionEx.name, customExercises);
      if (!exDef) continue; // deleted custom or unresolved — skip
      const variant =
        exDef.variants.find((v) => v.label === sessionEx.variantLabel) ||
        exDef.variants[0];
      // Pull placeholder values from the most-recent log of this variant
      // (NOT from the source session being repeated).
      const hist = getVariantHistory(exDef.id, variantKey(variant), workoutHistory, customExercises);
      const lastSession = hist[hist.length - 1];
      const setCount = sessionEx.sets.length;
      const sets = [];
      for (let i = 0; i < setCount; i++) {
        const refSet = lastSession ? (lastSession.sets[i] || lastSession.sets[lastSession.sets.length - 1]) : null;
        const hasPrev = refSet != null;
        sets.push({
          weight: "", reps: "", done: false, type: "working", rir: null,
          weightIsPlaceholder: hasPrev,
          repsIsPlaceholder: hasPrev,
          placeholderWeight: hasPrev ? refSet.weight : "",
          placeholderReps: hasPrev ? refSet.reps : "",
        });
      }
      newExercises.push({
        uid: `e${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${newExercises.length}`,
        exerciseId: exDef.id,
        name: exDef.name,
        primary: exDef.primary,
        variant,
        sets,
        collapsed: false,
      });
    }
    setActiveWorkout({
      exercises: newExercises,
      workoutName: deriveWorkoutName(newExercises, now),
      startTime: now,
      restTimer: null,
      nameWasEdited: false,
    });
    setWorkoutMinimized(false);
    setOpenHistoryId(null); // dismiss the recap sheet
    setActiveTab("workout"); // surface the new workout
  };

  const updateActiveWorkout = (patch) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      // Auto-rename when exercises change, unless the user manually edited
      // the name. We do this here (in the lift) so it stays consistent
      // regardless of which subtree triggered the update.
      if (patch.exercises && !next.nameWasEdited) {
        next.workoutName = deriveWorkoutName(patch.exercises, prev.startTime);
      }
      return next;
    });
  };

  const minimizeWorkout = () => setWorkoutMinimized(true);

  // Tapping the SessionBar from anywhere → un-minimize and switch to workout tab
  const expandWorkoutFromBar = () => {
    setWorkoutMinimized(false);
    setActiveTab("workout");
  };

  const cancelActiveWorkout = () => {
    setActiveWorkout(null);
    setWorkoutMinimized(false);
  };

  // ── Start Empty / Repeat conflict modal (Bible §14, shipped this session) ──
  // When the user tries to start a new workout (either Start Empty or Repeat)
  // with an active workout already running, we surface a modal: save current
  // and proceed, discard and proceed, or cancel.
  //
  // The modal is generic over "what comes next" — it stores a pending action
  // (a function to run after save/discard resolves) so the same modal serves
  // both Start Empty (post-action: spawn fresh empty) and Repeat (post-action:
  // spawn from a specific source session).
  //
  // See Bible §15 trade-off note: "save current" bypasses the FinishSummaryScreen
  // today (the real Finish flow doesn't exist yet), so this path commits
  // directly to workoutHistory. When Finish flow ships, this should route
  // through it instead.
  const [pendingStartAction, setPendingStartAction] = useState(null);
  const showStartConflict = pendingStartAction !== null;

  // Builds a session object from the currently active workout in the same
  // shape finishActiveWorkout produces, then pushes it into history without
  // surfacing the FinishSummaryScreen. Returns true if a session was
  // actually committed (>0 done sets), false if there was nothing to save.
  const commitActiveWorkoutSilently = () => {
    if (!activeWorkout) return false;
    const endTime = new Date();
    const durationSec = Math.max(1, Math.floor((endTime - activeWorkout.startTime) / 1000));
    const session = {
      id: `s${Date.now()}`,
      name: activeWorkout.workoutName,
      date: endTime.toISOString().slice(0, 10),
      durationSec,
      exercises: activeWorkout.exercises.map((ex) => ({
        name: ex.name,
        variantLabel: ex.variant.label,
        sets: ex.sets
          .filter((s) => s.done)
          .map((s) => ({ weight: s.weight, reps: s.reps, type: s.type, rir: s.rir })),
      })).filter((ex) => ex.sets.length > 0),
    };
    if (session.exercises.length === 0) return false;
    setWorkoutHistory((h) => [session, ...h]);
    return true;
  };

  // Entry point for Start Empty button on the Workout tab idle area.
  // If a workout is already active, opens the conflict modal queued with
  // the empty-spawn post-action; otherwise spawns straight away.
  const requestStartEmptyWorkout = () => {
    if (activeWorkout) {
      setPendingStartAction({ type: "empty" });
    } else {
      startEmptyWorkout();
    }
  };

  // Entry point for Repeat This Workout from HistoryRecapSheet.
  // Same conflict-check pattern: if a workout is active, queue the repeat
  // post-action behind the modal; otherwise spawn from the session directly.
  const requestRepeatWorkout = (session) => {
    if (activeWorkout) {
      setPendingStartAction({ type: "repeat", session });
    } else {
      repeatWorkoutFromSession(session);
    }
  };

  // Resolves the pending action by running whatever post-action was queued
  // (empty spawn or repeat from session).
  const runPendingStartAction = () => {
    if (!pendingStartAction) return;
    if (pendingStartAction.type === "empty") {
      startEmptyWorkout();
    } else if (pendingStartAction.type === "repeat") {
      repeatWorkoutFromSession(pendingStartAction.session);
    }
  };

  const handleSaveAndStartNew = () => {
    commitActiveWorkoutSilently(); // silently no-ops if nothing to save
    setActiveWorkout(null);
    setWorkoutMinimized(false);
    runPendingStartAction();
    setPendingStartAction(null);
  };

  const handleDiscardAndStartNew = () => {
    setActiveWorkout(null);
    setWorkoutMinimized(false);
    runPendingStartAction();
    setPendingStartAction(null);
  };

  const finishActiveWorkout = () => {
    if (!activeWorkout) return;
    const endTime = new Date();
    const durationSec = Math.max(1, Math.floor((endTime - activeWorkout.startTime) / 1000));
    const session = {
      id: `s${Date.now()}`,
      name: activeWorkout.workoutName,
      date: endTime.toISOString().slice(0, 10),
      durationSec,
      exercises: activeWorkout.exercises.map((ex) => ({
        name: ex.name,
        variantLabel: ex.variant.label,
        sets: ex.sets
          .filter((s) => s.done)
          .map((s) => ({ weight: s.weight, reps: s.reps, type: s.type, rir: s.rir })),
      })).filter((ex) => ex.sets.length > 0),
    };
    setFinishedSession(session);
    setActiveWorkout(null);
    setWorkoutMinimized(false);
  };

  const commitFinishedSession = () => {
    if (finishedSession && finishedSession.exercises.length > 0) {
      setWorkoutHistory((h) => [finishedSession, ...h]);
    }
    setFinishedSession(null);
  };

  const discardFinishedSession = () => {
    setFinishedSession(null);
  };

  // Logout: full reset to a fresh-install state. Clears the localStorage
  // snapshot so the next load starts at welcome. Also restores the mock
  // workout history and a clean chat so the demo loop works end-to-end:
  // log out → see mock data again → run onboarding → new fresh state.
  const handleLogout = () => {
    clearSnapshot();
    setActiveWorkout(null);
    setWorkoutMinimized(false);
    setFinishedSession(null);
    setOpenHistoryId(null);
    setActiveTab("home");
    setAppSubScreen(null);
    setUserName("Tyler");
    setSelectedEquipment(new Set());
    setFitnessLevel(null);
    setTimeAway(null);
    setRestTimerModePref("countup");
    setRestCountdownTargetPref(90);
    setWorkoutHistory(MOCK_WORKOUT_HISTORY);
    setOnboardingComplete(false);
    setCustomExercises([]);
    setExerciseSort({ mode: "alpha", dir: "asc" });
    // Coach's File state. Mirror the workoutHistory pattern: bring back
    // the mock seeds so the demo flows correctly on next sign-in.
    setPlanGoal("build_muscle");
    setPlanDaysPerWeek(3);
    setCoachRules(MOCK_COACH_RULES);
    setCoachObservations(MOCK_COACH_OBSERVATIONS);
    setProgressPRs(MOCK_PROGRESS_PRS);
    setBodyStats(MOCK_BODY_STATS);
    setCoachFileOpenedAt(Date.now());
    setCoachFileLastUpdatedAt(NOW_FOR_SEED - 2 * DAY);
    setUnitsPref("lbs");
    setStreakRemindersOn(true);
    setLeaderboardOn(false);
    // Reset Coach chats to a single fresh chat
    const newId = `c${Date.now()}`;
    setCoachChats([{ id: newId, createdAt: Date.now(), messages: [] }]);
    setCurrentCoachChatId(newId);
    setScreen("welcome");
  };

  const renderTab = () => {
    switch (activeTab) {
      case "home": return <HomeTab onTabChange={setActiveTab} userName={userName} history={workoutHistory} />;
      case "workout": return (
        <WorkoutTab
          userEquipment={selectedEquipment}
          workout={activeWorkout}
          minimized={workoutMinimized}
          history={workoutHistory}
          openHistoryId={openHistoryId}
          setOpenHistoryId={setOpenHistoryId}
          finishedSession={finishedSession}
          customExercises={customExercises}
          restTimerMode={restTimerModePref}
          restCountdownTarget={restCountdownTargetPref}
          onChangeRestTimerMode={setRestTimerModePref}
          onChangeRestCountdownTarget={setRestCountdownTargetPref}
          onStartEmpty={requestStartEmptyWorkout}
          onUpdateWorkout={updateActiveWorkout}
          onMinimize={minimizeWorkout}
          onCancel={cancelActiveWorkout}
          onFinish={finishActiveWorkout}
          onCommitFinished={commitFinishedSession}
          onDiscardFinished={discardFinishedSession}
          onRepeatWorkout={requestRepeatWorkout}
          onTabChange={setActiveTab}
        />
      );
      case "coach": return (
        <CoachTab
          userName={userName}
          chat={currentCoachChat}
          chats={coachChats}
          isOnline={isOnline}
          inputFocused={coachInputFocused}
          onSetInputFocused={setCoachInputFocused}
          onAppendMessage={appendCoachMessage}
          onNewChat={startNewCoachChat}
          onSwitchChat={switchCoachChat}
          onDeleteChat={deleteCoachChat}
          onRenameChat={renameCoachChat}
        />
      );
      case "exercises": return (
        <ExercisesTab
          userEquipment={selectedEquipment}
          onOpenEquipmentEditor={openEquipmentEditor}
          customExercises={customExercises}
          exerciseSort={exerciseSort}
          onChangeSort={setExerciseSort}
          workoutHistory={workoutHistory}
          onAddCustom={addCustomExercise}
          onUpdateCustom={updateCustomExercise}
          onDeleteCustom={deleteCustomExercise}
        />
      );
      case "profile": {
        // ── Vitals for Coach's File landing ──
        // sessionsCount: count of all workouts in history.
        // streakDays: existing computeStreak helper (calendar-day consecutive).
        // mostTrainedMuscle: highest-count primary muscle across all logged
        //   exercises. Resolved via findExerciseByName (handles built-in +
        //   customs). Ties broken by alpha order; falls back to "—" if empty.
        const sessionsCount = workoutHistory.length;
        const streakDays = computeStreak(workoutHistory);
        const muscleCounts = {};
        for (const w of workoutHistory) {
          for (const ex of (w.exercises || [])) {
            const def = findExerciseByName(ex.name, customExercises);
            const primary = def && def.primary;
            if (!primary) continue;
            muscleCounts[primary] = (muscleCounts[primary] || 0) + 1;
          }
        }
        let mostTrainedMuscle = "—";
        const muscleEntries = Object.entries(muscleCounts);
        if (muscleEntries.length > 0) {
          muscleEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
          mostTrainedMuscle = muscleEntries[0][0];
        }
        return (
          <ProfileTab
            userName={userName}
            planGoal={planGoal}
            fitnessLevel={fitnessLevel}
            timeAway={timeAway}
            planDaysPerWeek={planDaysPerWeek}
            equipmentCount={selectedEquipment.size}
            coachRules={coachRules}
            progressPRs={progressPRs}
            coachObservations={coachObservations}
            sessionsCount={sessionsCount}
            streakDays={streakDays}
            mostTrainedMuscle={mostTrainedMuscle}
            coachFileOpenedAt={coachFileOpenedAt}
            coachFileLastUpdatedAt={coachFileLastUpdatedAt}
            // Sub-screen openers. Equipment routes to the existing
            // EquipmentDetailScreen via openEquipmentEditor. Settings,
            // Plan, Rules, Progress, Observations all route through
            // appSubScreen state — handlers in renderAppContent mount
            // the matching sub-screen component.
            onOpenSettings={() => setAppSubScreen("settings")}
            onOpenPlan={() => setAppSubScreen("plan")}
            onOpenEquipment={openEquipmentEditor}
            onOpenRules={() => setAppSubScreen("rules")}
            onOpenProgress={() => setAppSubScreen("progress")}
            onOpenObservations={() => setAppSubScreen("observations")}
          />
        );
      }
      default: return <HomeTab onTabChange={setActiveTab} userName={userName} history={workoutHistory} />;
    }
  };

  const renderAppContent = () => {
    if (appSubScreen === "equipment_editor") {
      return (
        <EquipmentDetailScreen
          presetId={null}
          existingSelection={selectedEquipment}
          onBack={closeEquipmentEditor}
          onDone={(sel) => {
            setSelectedEquipment(sel);
            closeEquipmentEditor();
          }}
        />
      );
    }
    if (appSubScreen === "settings") {
      return (
        <SettingsSubscreen
          onBack={() => setAppSubScreen(null)}
          unitsPref={unitsPref}
          onChangeUnits={setUnitsPref}
          restTimerMode={restTimerModePref}
          onChangeRestTimerMode={setRestTimerModePref}
          restCountdownTarget={restCountdownTargetPref}
          onChangeRestCountdownTarget={setRestCountdownTargetPref}
          streakRemindersOn={streakRemindersOn}
          onChangeStreakReminders={setStreakRemindersOn}
          leaderboardOn={leaderboardOn}
          onChangeLeaderboard={setLeaderboardOn}
          onLogout={handleLogout}
          bodyStats={bodyStats}
        />
      );
    }
    if (appSubScreen === "plan") {
      // Plan sub-screen mutates four fields. Every change commits
      // immediately (no global save). coachFileLastUpdatedAt bumps
      // on each change so the signed-footer recency on the landing
      // reflects the user's most recent edit.
      const stamp = () => setCoachFileLastUpdatedAt(Date.now());
      return (
        <PlanSubscreen
          onBack={() => setAppSubScreen(null)}
          planGoal={planGoal}
          fitnessLevel={fitnessLevel}
          timeAway={timeAway}
          planDaysPerWeek={planDaysPerWeek}
          onChangeGoal={(v) => { setPlanGoal(v); stamp(); }}
          onChangeLevel={(v) => { setFitnessLevel(v); stamp(); }}
          onChangeTimeAway={(v) => { setTimeAway(v); stamp(); }}
          onChangeDaysPerWeek={(v) => { setPlanDaysPerWeek(v); stamp(); }}
        />
      );
    }
    if (appSubScreen === "rules") {
      // Rules CTA card deep-links to Coach chat. Closing the sub-screen
      // first and then switching tabs keeps the back-stack sane (if
      // user navigates back from Coach later they land on the
      // Coach's File landing, not the Rules sub-screen).
      const openCoachChat = () => { setAppSubScreen(null); setActiveTab("coach"); };
      return (
        <RulesSubscreen
          onBack={() => setAppSubScreen(null)}
          coachRules={coachRules}
          onDeleteRule={(id) => {
            setCoachRules((prev) => prev.filter((r) => r.id !== id));
            setCoachFileLastUpdatedAt(Date.now());
          }}
          onOpenCoachChat={openCoachChat}
        />
      );
    }
    if (appSubScreen === "progress") {
      return (
        <ProgressSubscreen
          onBack={() => setAppSubScreen(null)}
          progressPRs={progressPRs}
        />
      );
    }
    if (appSubScreen === "observations") {
      return (
        <ObservationsSubscreen
          onBack={() => setAppSubScreen(null)}
          coachObservations={coachObservations}
          onDeleteObservation={(id) => {
            setCoachObservations((prev) => prev.filter((o) => o.id !== id));
            setCoachFileLastUpdatedAt(Date.now());
          }}
          onResetAll={() => {
            setCoachObservations([]);
            setCoachFileLastUpdatedAt(Date.now());
          }}
        />
      );
    }
    // SessionBar is shown whenever an active workout exists AND
    //   - the user is not on the workout tab, OR
    //   - the workout is minimized
    // It sits between the tab content and the TabBar.
    const showSessionBar = activeWorkout && (activeTab !== "workout" || workoutMinimized);
    // Hide the TabBar while the Coach input is focused, so the composing
    // surface feels full-height instead of getting sandwiched between the
    // keyboard and the tab bar. Matches Claude / iMessage / every major
    // chat app. Only triggers on the Coach tab.
    const hideTabBar = activeTab === "coach" && coachInputFocused;
    return (
      <>
        {renderTab()}
        {showSessionBar && <SessionBar workout={activeWorkout} restTimerMode={restTimerModePref} restCountdownTarget={restCountdownTargetPref} onTap={expandWorkoutFromBar} />}
        {!hideTabBar && <TabBar active={activeTab} onTab={setActiveTab} />}

        {showStartConflict && (
          <>
            <div
              onClick={() => setPendingStartAction(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100 }}
            />
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 101, background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 14, padding: "22px 22px 18px", width: 300,
              boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            }}>
              <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
                You have a workout in progress
              </div>
              <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5, marginBottom: 18, textAlign: "center" }}>
                What would you like to do with it?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={handleSaveAndStartNew}
                  style={{
                    width: "100%", padding: "12px", background: COLORS.gold,
                    border: `1px solid ${COLORS.gold}`, borderRadius: 8,
                    color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Save current and start new
                </button>
                <button
                  onClick={handleDiscardAndStartNew}
                  style={{
                    width: "100%", padding: "12px", background: "#3A1A1A",
                    border: "1px solid #5A2A2A", borderRadius: 8,
                    color: "#FF6B6B", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Discard current and start new
                </button>
              </div>
              <div
                onClick={() => setPendingStartAction(null)}
                style={{
                  marginTop: 14, color: COLORS.textSecondary, fontSize: 12,
                  textAlign: "center", cursor: "pointer", padding: "6px",
                }}
              >
                Cancel
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  // Called at the two entry points into the main app: (1) finishing
  // onboarding via the Completion screen's "Meet Coach AI" button, and
  // (2) signing back in on the Sign In screen. Flips the persistence
  // flag so subsequent reloads skip straight to the tabs.
  const enterApp = () => {
    setOnboardingComplete(true);
    goTo("app");
  };

  const renderScreen = () => {
    switch (screen) {
      case "welcome":
        return <WelcomeScreen onGetStarted={() => goTo("goals")} onSignIn={() => goTo("signin")} />;
      case "signin":
        return <SignInScreen onBack={() => goTo("welcome")} onSignIn={enterApp} />;
      case "goals":
        return <GoalsScreen onNext={() => goTo("level")} onBack={() => goTo("welcome")} onSkip={() => goTo("level")} />;
      case "level":
        return (
          <FitnessLevelScreen
            value={fitnessLevel}
            onChange={(lvl) => {
              setFitnessLevel(lvl);
              // Picking Beginner invalidates any previously-chosen timeAway
              // (Beginners don't see Screen 3b). Clear so a back-and-forth
              // between Intermediate→Beginner doesn't leave stale state.
              if (lvl === "beginner") setTimeAway(null);
            }}
            onNext={() => goTo(fitnessLevel === "beginner" ? "aboutyou" : "timeaway")}
            onBack={() => goTo("goals")}
            onSkip={() => goTo("aboutyou")}
          />
        );
      case "timeaway":
        return (
          <TimeAwayScreen
            value={timeAway}
            onChange={setTimeAway}
            onNext={() => goTo("aboutyou")}
            onBack={() => goTo("level")}
            onSkip={() => goTo("aboutyou")}
          />
        );
      case "aboutyou":
        return <AboutYouScreen onNext={() => goTo("days")} onBack={() => goTo(fitnessLevel === "beginner" || fitnessLevel === null ? "level" : "timeaway")} onSkip={() => goTo("days")} />;
      case "days":
        return <DaysScreen onNext={() => goTo("equipment")} onBack={() => goTo("aboutyou")} onSkip={() => goTo("equipment")} />;
      case "equipment":
        return (
          <EquipmentPresetScreen
            onBack={() => goTo("days")}
            onSkip={() => {
              // Skip-for-now defaults to ALL equipment available, so the
              // user gets the full library by default. They can refine
              // later in Profile → Fitness Profile → Equipment.
              const allIds = new Set();
              for (const cat of EQUIPMENT_CATEGORIES) {
                for (const item of cat.items) allIds.add(item.id);
              }
              setSelectedEquipment(allIds);
              goTo("account");
            }}
            selectedEquipment={selectedEquipment}
            onPickPreset={(id) => {
              setEquipPreset(id);
              goTo("equipment_detail");
            }}
            onEditDetail={() => {
              setEquipPreset(null);
              goTo("equipment_detail");
            }}
            onContinue={() => goTo("account")}
          />
        );
      case "equipment_detail":
        return (
          <EquipmentDetailScreen
            presetId={equipPreset}
            existingSelection={selectedEquipment}
            onBack={() => goTo("equipment")}
            onDone={(sel) => {
              setSelectedEquipment(sel);
              goTo("equipment");
            }}
          />
        );
      case "account":
        return <CreateAccountScreen onNext={() => goTo("name")} onBack={() => goTo("equipment")} />;
      case "name":
        return (
          <NameScreen
            onNext={(n) => { setUserName(n); goTo("complete"); }}
            onBack={() => goTo("account")}
          />
        );
      case "complete":
        return <CompletionScreen onEnter={enterApp} />;
      case "app":
        return renderAppContent();
      default:
        return null;
    }
  };

  return (
    <div style={{ width: "100vw", minHeight: "100dvh", background: COLORS.bg }}>
      <style>{`
        /* ── iOS-native feel ────────────────────────────────────────────
           These rules eliminate the common "this is a webapp, not a real
           app" giveaways on iOS Safari + standalone home-screen launches. */

        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: ${COLORS.bg};
          overscroll-behavior: none; /* kills rubber-band bounce at edges */
          -webkit-text-size-adjust: 100%; /* prevent iOS auto-resize of text on rotate */
        }

        /* Remove the gray flash that iOS draws on tap. Single biggest
           "webapp" tell — native iOS apps never show this. */
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Disable the long-press "Copy / Share / Lookup" menu on UI
           elements. Inputs and textareas opt back in below. */
        button, a, div, span, label, svg, img {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }

        /* Allow selection inside text inputs and textareas — disabling it
           globally would break copy/paste in form fields. */
        input, textarea {
          -webkit-user-select: text;
          user-select: text;
          -webkit-touch-callout: default;
        }

        /* iOS zooms inputs on focus if font-size is < 16px. Force 16px
           minimum on form fields to prevent that "page zooms in when I
           tap the field" jump. */
        input, textarea, select {
          font-size: 16px;
        }

        /* Remove the 300ms tap delay iOS imposes on clickable elements
           waiting for a possible double-tap-zoom. Buttons feel instant. */
        button, a, [role="button"] {
          touch-action: manipulation;
        }

        /* Prevent pinch-zoom on the whole app — native apps don't zoom. */
        body {
          touch-action: pan-x pan-y;
        }

        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #FFD700; cursor: pointer; border: 3px solid #111111; box-shadow: 0 0 8px rgba(255,215,0,0.4); }
        input[type="range"]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #FFD700; cursor: pointer; border: 3px solid #111111; box-shadow: 0 0 8px rgba(255,215,0,0.4); }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes coachDot { 0%, 60%, 100% { opacity: 0.2; } 30% { opacity: 1; } }
        @keyframes shakeField {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        input::placeholder { color: #555; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
      <PhoneFrame>
        {pIdx >= 0 && <ProgressBar current={pIdx + 1} total={progressScreens.length} />}
        {renderScreen()}
      </PhoneFrame>
    </div>
  );
}
