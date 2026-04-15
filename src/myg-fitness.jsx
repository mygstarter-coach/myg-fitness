import { useState, useEffect, useRef } from "react";

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
      { id: "leg_press_machine", label: "Leg Press (45°)" },
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
   the list to have access to that variant (e.g. "Barbell + Flat Bench").
   Equipment ids map to EQUIPMENT_CATEGORIES above. Exercises spanning two
   muscle groups (Deadlift, RDL, Good Morning, Rack Pull, Back Extension)
   appear in both filters but are de-duped in "All" by id.
*/

const EXERCISE_LIBRARY = [
  // LEGS (20)
  { id: "squat", name: "Squat", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "front_squat", name: "Front Squat", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "goblet_squat", name: "Goblet Squat", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "deadlift", name: "Deadlift", primary: "Legs", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"], key: "barbell_conventional" },
    { label: "Barbell (Sumo)", equipment: ["barbell"], key: "barbell_sumo" },
    { label: "Hex Bar", equipment: ["hex_bar"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "romanian_deadlift", name: "Romanian Deadlift", primary: "Legs", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "good_morning", name: "Good Morning", primary: "Legs", alsoIn: ["Back"], secondary: ["Back"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "hip_thrust", name: "Hip Thrust", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell + Flat Bench", equipment: ["barbell", "flat_bench"] },
    { label: "Dumbbells + Flat Bench", equipment: ["dumbbells", "flat_bench"] },
    { label: "Hip Thrust Machine", equipment: ["hip_thrust_machine"] },
  ]},
  { id: "leg_press", name: "Leg Press", primary: "Legs", secondary: [], type: "Compound", variants: [
    { label: "Leg Press (45°)", equipment: ["leg_press_machine"] },
    { label: "Seated Leg Press", equipment: ["seated_leg_press_machine"] },
  ]},
  { id: "hack_squat", name: "Hack Squat", primary: "Legs", secondary: [], type: "Compound", variants: [
    { label: "Hack Squat Machine", equipment: ["hack_squat_machine"] },
  ]},
  { id: "bulgarian_split_squat", name: "Bulgarian Split Squat", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "lunge", name: "Lunge", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "step_up", name: "Step-Up", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Dumbbells + Plyo Box", equipment: ["dumbbells", "plyo_box"] },
  ]},
  { id: "glute_bridge", name: "Glute Bridge", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "glute_kickback", name: "Glute Kickback", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Glute Kickback Machine", equipment: ["glute_kickback_machine"] },
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "leg_curl", name: "Leg Curl", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Seated Leg Curl", equipment: ["seated_leg_curl_machine"] },
    { label: "Lying Leg Curl", equipment: ["lying_leg_curl_machine"] },
  ]},
  { id: "leg_extension", name: "Leg Extension", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Leg Extension Machine", equipment: ["leg_extension_machine"] },
  ]},
  { id: "standing_calf_raise", name: "Standing Calf Raise", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
    { label: "Standing Calf Raise Machine", equipment: ["standing_calf_raise_machine"] },
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "seated_calf_raise", name: "Seated Calf Raise", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Seated Calf Raise Machine", equipment: ["seated_calf_raise_machine"] },
    { label: "Plate on Knees", equipment: ["weight_plates"] },
    { label: "Rotary Calf Machine", equipment: ["rotary_calf_machine"] },
    { label: "Calf Press on 45° Leg Press", equipment: ["leg_press_machine"] },
    { label: "Calf Press on Seated Leg Press", equipment: ["seated_leg_press_machine"] },
  ]},
  { id: "hip_abductor", name: "Hip Abductor", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Hip Abductor Machine", equipment: ["hip_abductor_machine"] },
  ]},
  { id: "hip_adductor", name: "Hip Adductor", primary: "Legs", secondary: [], type: "Isolation", variants: [
    { label: "Hip Adductor Machine", equipment: ["hip_abductor_machine"] },
  ]},
  { id: "box_jump", name: "Box Jump", primary: "Legs", secondary: ["Core"], type: "Compound", variants: [
    { label: "Plyo Box", equipment: ["plyo_box"] },
  ]},

  // BACK (18) — deadlift/RDL/good_morning already declared under Legs with alsoIn
  { id: "rack_pull", name: "Rack Pull", primary: "Back", secondary: ["Legs"], type: "Compound", variants: [
    { label: "Barbell + Squat Rack", equipment: ["barbell", "squat_rack"] },
  ]},
  { id: "bent_over_row", name: "Bent-Over Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "single_arm_row", name: "Single-Arm Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "incline_row", name: "Incline Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell + Adjustable Bench", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells + Adjustable Bench", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "seated_row", name: "Seated Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Seated Cable Row", equipment: ["seated_cable_row"] },
    { label: "Iso Lateral Row Machine", equipment: ["iso_lateral_row_machine"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "tbar_row", name: "T-Bar Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "T-Bar Row Machine", equipment: ["tbar_row_machine"] },
  ]},
  { id: "upright_row", name: "Upright Row", primary: "Back", secondary: ["Shoulders"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "lat_pulldown", name: "Lat Pulldown", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Cable Lat Pulldown", equipment: ["cable_lat_pulldown"] },
    { label: "Lat Pulldown Machine", equipment: ["lat_pulldown_machine"] },
    { label: "Single-Arm Cable", equipment: ["cable_high"], key: "cable_high_single_arm" },
  ]},
  { id: "pull_up", name: "Pull-Up", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"] },
    { label: "Assisted Pull-Up Machine", equipment: ["assisted_pullup_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands", "pull_up_bar"] },
  ]},
  { id: "chin_up", name: "Chin-Up", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"] },
    { label: "Assisted Pull-Up Machine", equipment: ["assisted_pullup_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands", "pull_up_bar"] },
  ]},
  { id: "inverted_row", name: "Inverted Row", primary: "Back", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "straight_arm_pulldown", name: "Straight-Arm Pulldown", primary: "Back", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "face_pull", name: "Face Pull", primary: "Back", secondary: ["Shoulders"], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "shrug", name: "Shrug", primary: "Back", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "back_extension", name: "Back Extension", primary: "Back", secondary: ["Legs"], type: "Compound", variants: [
    { label: "Hyperextension Bench", equipment: ["hyperextension_bench"] },
    { label: "Back Extension Machine", equipment: ["back_extension_machine"] },
  ]},

  // CHEST (11)
  { id: "bench_press", name: "Bench Press", primary: "Chest", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Barbell + Flat Bench", equipment: ["barbell", "flat_bench"] },
    { label: "Dumbbells + Flat Bench", equipment: ["dumbbells", "flat_bench"] },
    { label: "Smith Machine + Flat Bench", equipment: ["smith_machine", "flat_bench"] },
  ]},
  { id: "incline_press", name: "Incline Press", primary: "Chest", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Barbell + Adjustable Bench", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells + Adjustable Bench", equipment: ["dumbbells", "adjustable_bench"] },
    { label: "Smith Machine + Adjustable Bench", equipment: ["smith_machine", "adjustable_bench"] },
  ]},
  { id: "decline_press", name: "Decline Press", primary: "Chest", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell + Adjustable Bench", equipment: ["barbell", "adjustable_bench"] },
    { label: "Dumbbells + Adjustable Bench", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "machine_press", name: "Machine Press", primary: "Chest", secondary: ["Shoulders", "Arms"], type: "Compound", variants: [
    { label: "Hammer Strength Chest Press", equipment: ["hammer_strength_chest"] },
    { label: "Hammer Strength Incline Press", equipment: ["hammer_strength_incline"] },
    { label: "Hammer Strength Decline Press", equipment: ["hammer_strength_decline"] },
  ]},
  { id: "chest_fly", name: "Chest Fly", primary: "Chest", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells + Flat Bench", equipment: ["dumbbells", "flat_bench"] },
    { label: "Pec Deck", equipment: ["pec_deck"] },
  ]},
  { id: "incline_chest_fly", name: "Incline Chest Fly", primary: "Chest", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells + Adjustable Bench", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "cable_crossover", name: "Cable Crossover", primary: "Chest", secondary: [], type: "Isolation", variants: [
    { label: "Cable Crossover", equipment: ["cable_crossover"] },
  ]},
  { id: "push_up", name: "Push-Up", primary: "Chest", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Standard", equipment: [], key: "bodyweight_standard" },
    { label: "Diamond", equipment: [], key: "bodyweight_diamond" },
  ]},
  { id: "dip", name: "Dip", primary: "Chest", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dip Station", equipment: ["dip_station"] },
    { label: "Assisted Dip Machine", equipment: ["assisted_pullup_machine"] },
  ]},
  { id: "svend_press", name: "Svend Press", primary: "Chest", secondary: [], type: "Isolation", variants: [
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "floor_press", name: "Floor Press", primary: "Chest", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "pullover", name: "Pullover", primary: "Chest", secondary: ["Back"], type: "Isolation", variants: [
    { label: "Dumbbells + Flat Bench", equipment: ["dumbbells", "flat_bench"] },
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},

  // SHOULDERS (9)
  { id: "overhead_press", name: "Overhead Press", primary: "Shoulders", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Smith Machine", equipment: ["smith_machine"] },
  ]},
  { id: "arnold_press", name: "Arnold Press", primary: "Shoulders", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "machine_shoulder_press", name: "Machine Shoulder Press", primary: "Shoulders", secondary: ["Arms"], type: "Compound", variants: [
    { label: "Hammer Strength Shoulder Press", equipment: ["hammer_strength_shoulder"] },
  ]},
  { id: "lateral_raise", name: "Lateral Raise", primary: "Shoulders", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Lateral Raise Machine", equipment: ["lateral_raise_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "front_raise", name: "Front Raise", primary: "Shoulders", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
  ]},
  { id: "rear_delt_fly", name: "Rear Delt Fly", primary: "Shoulders", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable Crossover", equipment: ["cable_crossover"] },
    { label: "Pec Deck (Reverse)", equipment: ["pec_deck"] },
  ]},
  { id: "landmine_press", name: "Landmine Press", primary: "Shoulders", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
  ]},
  { id: "handstand_push_up", name: "Handstand Push-Up", primary: "Shoulders", secondary: ["Arms", "Core"], type: "Compound", variants: [
    { label: "Bodyweight", equipment: [] },
  ]},

  // ARMS (13)
  { id: "bicep_curl", name: "Bicep Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar"] },
    { label: "Bicep Curl Machine", equipment: ["bicep_curl_machine"] },
  ]},
  { id: "hammer_curl", name: "Hammer Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "preacher_curl", name: "Preacher Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "EZ Curl Bar + Preacher Bench", equipment: ["ez_curl_bar", "preacher_bench"] },
    { label: "Dumbbells + Preacher Bench", equipment: ["dumbbells", "preacher_bench"] },
  ]},
  { id: "concentration_curl", name: "Concentration Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "incline_curl", name: "Incline Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells + Adjustable Bench", equipment: ["dumbbells", "adjustable_bench"] },
  ]},
  { id: "tricep_pushdown", name: "Tricep Pushdown", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Tricep Extension Machine", equipment: ["tricep_extension_machine"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "overhead_tricep_extension", name: "Overhead Tricep Extension", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "EZ Curl Bar", equipment: ["ez_curl_bar"] },
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Tricep Extension Machine", equipment: ["tricep_extension_machine"] },
  ]},
  { id: "skull_crusher", name: "Skull Crusher", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "EZ Curl Bar + Flat Bench", equipment: ["ez_curl_bar", "flat_bench"] },
    { label: "Dumbbells + Flat Bench", equipment: ["dumbbells", "flat_bench"] },
  ]},
  { id: "close_grip_bench", name: "Close-Grip Bench Press", primary: "Arms", secondary: ["Chest"], type: "Compound", variants: [
    { label: "Barbell + Flat Bench", equipment: ["barbell", "flat_bench"] },
    { label: "Smith Machine + Flat Bench", equipment: ["smith_machine", "flat_bench"] },
  ]},
  { id: "tricep_kickback", name: "Tricep Kickback", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "wrist_curl", name: "Wrist Curl", primary: "Arms", secondary: [], type: "Isolation", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "bench_dip", name: "Bench Dip", primary: "Arms", secondary: ["Chest"], type: "Compound", variants: [
    { label: "Flat Bench", equipment: ["flat_bench"] },
  ]},

  // CORE (19)
  { id: "plank", name: "Plank", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "side_plank", name: "Side Plank", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "reverse_plank", name: "Reverse Plank", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "dead_bug", name: "Dead Bug", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "pallof_press", name: "Pallof Press", primary: "Core", secondary: [], type: "Compound", variants: [
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "ab_wheel_rollout", name: "Ab Wheel Rollout", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Ab Wheel", equipment: ["ab_wheel"] }]},
  { id: "cable_twist", name: "Cable Twist", primary: "Core", secondary: [], type: "Compound", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
    { label: "Torso Rotation Machine", equipment: ["torso_rotation_machine"] },
  ]},
  { id: "mountain_climber", name: "Mountain Climber", primary: "Core", secondary: [], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "crunch", name: "Crunch", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [] },
    { label: "Ab Crunch Machine", equipment: ["ab_crunch_machine"] },
  ]},
  { id: "cable_crunch", name: "Cable Crunch", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Cable (High Pulley)", equipment: ["cable_high"] },
  ]},
  { id: "bicycle_crunch", name: "Bicycle Crunch", primary: "Core", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "oblique_crunch", name: "Oblique Crunch", primary: "Core", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "decline_crunch", name: "Decline Crunch", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Adjustable Bench", equipment: ["adjustable_bench"] },
  ]},
  { id: "hanging_leg_raise", name: "Hanging Leg Raise", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"] },
  ]},
  { id: "leg_raise", name: "Leg Raise", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [] },
  ]},
  { id: "russian_twist", name: "Russian Twist", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Bodyweight", equipment: [] },
    { label: "Medicine Ball", equipment: ["medicine_ball"] },
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "side_bend", name: "Side Bend", primary: "Core", secondary: [], type: "Isolation", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Cable (Low Pulley)", equipment: ["cable_low"] },
    { label: "Resistance Bands", equipment: ["resistance_bands"] },
  ]},
  { id: "superman", name: "Superman", primary: "Core", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "v_up", name: "V-Up", primary: "Core", secondary: [], type: "Isolation", variants: [{ label: "Bodyweight", equipment: [] }]},

  // CARDIO (7)
  { id: "treadmill", name: "Treadmill", primary: "Cardio", secondary: ["Legs"], type: "Compound", variants: [{ label: "Treadmill", equipment: ["treadmill"] }]},
  { id: "stationary_bike", name: "Stationary Bike", primary: "Cardio", secondary: ["Legs"], type: "Compound", variants: [{ label: "Stationary Bike", equipment: ["stationary_bike"] }]},
  { id: "rowing_machine", name: "Rowing Machine", primary: "Cardio", secondary: ["Back", "Arms"], type: "Compound", variants: [{ label: "Rowing Machine", equipment: ["rowing_machine"] }]},
  { id: "elliptical", name: "Elliptical", primary: "Cardio", secondary: ["Legs"], type: "Compound", variants: [{ label: "Elliptical", equipment: ["elliptical"] }]},
  { id: "stair_climber", name: "Stair Climber", primary: "Cardio", secondary: ["Legs"], type: "Compound", variants: [{ label: "Stair Climber", equipment: ["stair_climber"] }]},
  { id: "jump_rope", name: "Jump Rope", primary: "Cardio", secondary: [], type: "Compound", variants: [{ label: "Jump Rope", equipment: ["jump_rope"] }]},
  { id: "battle_ropes", name: "Battle Ropes", primary: "Cardio", secondary: ["Arms", "Shoulders"], type: "Compound", variants: [{ label: "Battle Ropes", equipment: ["battle_ropes"] }]},

  // FULL BODY (18)
  { id: "power_clean", name: "Power Clean", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "hang_clean", name: "Hang Clean", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "clean_and_press", name: "Clean and Press", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders", "Arms"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
  ]},
  { id: "clean_and_jerk", name: "Clean and Jerk", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders", "Arms"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "snatch", name: "Snatch", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "power_snatch", name: "Power Snatch", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "hang_snatch", name: "Hang Snatch", primary: "Full Body", secondary: ["Legs", "Back", "Shoulders"], type: "Olympic", variants: [{ label: "Barbell", equipment: ["barbell"] }]},
  { id: "deadlift_high_pull", name: "Deadlift High Pull", primary: "Full Body", secondary: ["Back", "Shoulders"], type: "Olympic", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "muscle_up", name: "Muscle-Up", primary: "Full Body", secondary: ["Back", "Chest", "Arms"], type: "Olympic", variants: [
    { label: "Pull-Up Bar", equipment: ["pull_up_bar"] },
    { label: "Gymnastics Rings", equipment: ["gymnastics_rings"] },
  ]},
  { id: "kettlebell_swing", name: "Kettlebell Swing", primary: "Full Body", secondary: ["Legs", "Back"], type: "Compound", variants: [{ label: "Kettlebells", equipment: ["kettlebell"] }]},
  { id: "turkish_get_up", name: "Turkish Get-Up", primary: "Full Body", secondary: ["Shoulders", "Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "thruster", name: "Thruster", primary: "Full Body", secondary: ["Legs", "Shoulders"], type: "Compound", variants: [
    { label: "Barbell", equipment: ["barbell"] },
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
  ]},
  { id: "farmer_carry", name: "Farmer Carry", primary: "Full Body", secondary: ["Back", "Core"], type: "Compound", variants: [
    { label: "Dumbbells", equipment: ["dumbbells"] },
    { label: "Kettlebells", equipment: ["kettlebell"] },
    { label: "Weight Plates", equipment: ["weight_plates"] },
  ]},
  { id: "sled_push", name: "Sled Push", primary: "Full Body", secondary: ["Legs", "Core"], type: "Compound", variants: [{ label: "Sled", equipment: ["sled"] }]},
  { id: "sled_pull", name: "Sled Pull", primary: "Full Body", secondary: ["Legs", "Back"], type: "Compound", variants: [{ label: "Sled", equipment: ["sled"] }]},
  { id: "bear_crawl", name: "Bear Crawl", primary: "Full Body", secondary: ["Core", "Shoulders"], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "burpee", name: "Burpee", primary: "Full Body", secondary: ["Core", "Legs"], type: "Compound", variants: [{ label: "Bodyweight", equipment: [] }]},
  { id: "ball_slam", name: "Ball Slam", primary: "Full Body", secondary: ["Core", "Shoulders"], type: "Compound", variants: [{ label: "Medicine Ball", equipment: ["medicine_ball"] }]},
];

/* Mock "last max" data — keyed by exercise id. Used by the list row display.
   Resolved to the user's most-recently-logged variant at render time.
*/
const MOCK_LAST_MAX = {
  squat: { weight: 225, reps: 5, unit: "lb" },
  bench_press: { weight: 185, reps: 6, unit: "lb" },
  deadlift: { weight: 315, reps: 3, unit: "lb" },
  overhead_press: { weight: 115, reps: 5, unit: "lb" },
  bent_over_row: { weight: 165, reps: 8, unit: "lb" },
  romanian_deadlift: { weight: 205, reps: 8, unit: "lb" },
  incline_press: { weight: 145, reps: 6, unit: "lb" },
  bicep_curl: { weight: 75, reps: 10, unit: "lb" },
  lat_pulldown: { weight: 140, reps: 10, unit: "lb" },
  leg_press: { weight: 360, reps: 10, unit: "lb" },
};

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

/* Mock session history — now nested by variant. Structure:
   MOCK_HISTORY[exerciseId][variantKey] = [sessions...]

   Variant keys are generated with variantKey() above. Most exercises have
   history for just their "main" variant, but a few have a second variant
   with lighter history so we can demo variant-switching in the UI.
*/
const MOCK_HISTORY = {
  squat: {
    // Barbell + Squat Rack (main)
    "barbell+squat_rack": [
      { date: "2026-02-08", sets: [{ weight: 185, reps: 8 }, { weight: 205, reps: 6 }, { weight: 205, reps: 5 }] },
      { date: "2026-02-15", sets: [{ weight: 195, reps: 8 }, { weight: 215, reps: 6 }, { weight: 215, reps: 5 }] },
      { date: "2026-02-22", sets: [{ weight: 205, reps: 8 }, { weight: 215, reps: 6 }, { weight: 215, reps: 6 }] },
      { date: "2026-03-01", sets: [{ weight: 205, reps: 8 }, { weight: 225, reps: 5 }, { weight: 225, reps: 4 }] },
      { date: "2026-03-08", sets: [{ weight: 215, reps: 8 }, { weight: 225, reps: 6 }, { weight: 225, reps: 5 }] },
      { date: "2026-03-15", sets: [{ weight: 215, reps: 8 }, { weight: 235, reps: 4 }, { weight: 225, reps: 5 }] },
      { date: "2026-03-22", sets: [{ weight: 225, reps: 6 }, { weight: 235, reps: 5 }, { weight: 225, reps: 5 }] },
      { date: "2026-04-02", sets: [{ weight: 225, reps: 8 }, { weight: 245, reps: 3 }, { weight: 225, reps: 5 }] },
    ],
    // Smith Machine (lighter history — demos variant switching)
    "smith_machine": [
      { date: "2026-03-05", sets: [{ weight: 225, reps: 8 }, { weight: 245, reps: 6 }] },
      { date: "2026-03-19", sets: [{ weight: 235, reps: 8 }, { weight: 255, reps: 6 }] },
    ],
  },
  bench_press: {
    // Barbell + Flat Bench (main)
    "barbell+flat_bench": [
      { date: "2026-02-10", sets: [{ weight: 155, reps: 8 }, { weight: 165, reps: 6 }, { weight: 165, reps: 5 }] },
      { date: "2026-02-17", sets: [{ weight: 165, reps: 8 }, { weight: 175, reps: 6 }, { weight: 165, reps: 6 }] },
      { date: "2026-02-24", sets: [{ weight: 165, reps: 8 }, { weight: 175, reps: 7 }, { weight: 175, reps: 6 }] },
      { date: "2026-03-03", sets: [{ weight: 175, reps: 8 }, { weight: 185, reps: 5 }, { weight: 175, reps: 6 }] },
      { date: "2026-03-10", sets: [{ weight: 175, reps: 8 }, { weight: 185, reps: 6 }, { weight: 185, reps: 5 }] },
      { date: "2026-03-17", sets: [{ weight: 185, reps: 7 }, { weight: 185, reps: 6 }, { weight: 175, reps: 7 }] },
      { date: "2026-03-24", sets: [{ weight: 185, reps: 8 }, { weight: 195, reps: 4 }, { weight: 185, reps: 5 }] },
      { date: "2026-04-03", sets: [{ weight: 185, reps: 8 }, { weight: 185, reps: 6 }, { weight: 175, reps: 8 }] },
    ],
    // Dumbbells (secondary, for demoing the switcher)
    "dumbbells+flat_bench": [
      { date: "2026-02-14", sets: [{ weight: 65, reps: 10 }, { weight: 70, reps: 8 }, { weight: 70, reps: 7 }] },
      { date: "2026-03-01", sets: [{ weight: 70, reps: 10 }, { weight: 75, reps: 8 }, { weight: 70, reps: 8 }] },
      { date: "2026-03-22", sets: [{ weight: 75, reps: 10 }, { weight: 80, reps: 7 }, { weight: 75, reps: 8 }] },
    ],
  },
  deadlift: {
    "barbell_conventional": [
      { date: "2026-02-12", sets: [{ weight: 275, reps: 5 }, { weight: 275, reps: 4 }] },
      { date: "2026-02-19", sets: [{ weight: 285, reps: 5 }, { weight: 285, reps: 3 }] },
      { date: "2026-02-26", sets: [{ weight: 295, reps: 4 }, { weight: 275, reps: 5 }] },
      { date: "2026-03-05", sets: [{ weight: 295, reps: 5 }, { weight: 295, reps: 3 }] },
      { date: "2026-03-12", sets: [{ weight: 305, reps: 4 }, { weight: 285, reps: 5 }] },
      { date: "2026-03-19", sets: [{ weight: 315, reps: 2 }, { weight: 295, reps: 5 }] },
      { date: "2026-03-26", sets: [{ weight: 315, reps: 3 }, { weight: 295, reps: 5 }] },
      { date: "2026-04-05", sets: [{ weight: 315, reps: 3 }, { weight: 295, reps: 6 }] },
    ],
    "barbell_sumo": [
      { date: "2026-03-15", sets: [{ weight: 295, reps: 4 }, { weight: 275, reps: 5 }] },
      { date: "2026-03-29", sets: [{ weight: 305, reps: 4 }, { weight: 285, reps: 5 }] },
    ],
  },
  overhead_press: {
    "barbell": [
      { date: "2026-02-11", sets: [{ weight: 95, reps: 8 }, { weight: 105, reps: 5 }, { weight: 105, reps: 4 }] },
      { date: "2026-02-18", sets: [{ weight: 95, reps: 8 }, { weight: 105, reps: 6 }, { weight: 105, reps: 5 }] },
      { date: "2026-02-25", sets: [{ weight: 105, reps: 8 }, { weight: 110, reps: 5 }, { weight: 105, reps: 5 }] },
      { date: "2026-03-04", sets: [{ weight: 105, reps: 8 }, { weight: 115, reps: 3 }, { weight: 105, reps: 6 }] },
      { date: "2026-03-11", sets: [{ weight: 105, reps: 8 }, { weight: 115, reps: 4 }, { weight: 110, reps: 5 }] },
      { date: "2026-03-18", sets: [{ weight: 110, reps: 8 }, { weight: 115, reps: 5 }, { weight: 115, reps: 4 }] },
      { date: "2026-03-25", sets: [{ weight: 115, reps: 5 }, { weight: 110, reps: 6 }, { weight: 105, reps: 7 }] },
      { date: "2026-04-04", sets: [{ weight: 115, reps: 5 }, { weight: 115, reps: 4 }, { weight: 105, reps: 7 }] },
    ],
  },
  bent_over_row: {
    "barbell": [
      { date: "2026-02-09", sets: [{ weight: 135, reps: 8 }, { weight: 145, reps: 8 }, { weight: 145, reps: 6 }] },
      { date: "2026-02-16", sets: [{ weight: 145, reps: 8 }, { weight: 155, reps: 6 }, { weight: 145, reps: 8 }] },
      { date: "2026-02-23", sets: [{ weight: 145, reps: 8 }, { weight: 155, reps: 8 }, { weight: 155, reps: 6 }] },
      { date: "2026-03-02", sets: [{ weight: 155, reps: 8 }, { weight: 165, reps: 6 }, { weight: 155, reps: 7 }] },
      { date: "2026-03-09", sets: [{ weight: 155, reps: 8 }, { weight: 165, reps: 7 }, { weight: 155, reps: 8 }] },
      { date: "2026-03-16", sets: [{ weight: 165, reps: 8 }, { weight: 165, reps: 7 }, { weight: 155, reps: 8 }] },
      { date: "2026-03-23", sets: [{ weight: 165, reps: 8 }, { weight: 165, reps: 8 }, { weight: 155, reps: 8 }] },
      { date: "2026-04-01", sets: [{ weight: 165, reps: 8 }, { weight: 175, reps: 6 }, { weight: 165, reps: 7 }] },
    ],
  },
  romanian_deadlift: {
    "barbell": [
      { date: "2026-02-13", sets: [{ weight: 165, reps: 10 }, { weight: 185, reps: 8 }, { weight: 185, reps: 8 }] },
      { date: "2026-02-20", sets: [{ weight: 175, reps: 10 }, { weight: 185, reps: 10 }, { weight: 185, reps: 8 }] },
      { date: "2026-02-27", sets: [{ weight: 185, reps: 10 }, { weight: 195, reps: 8 }, { weight: 185, reps: 10 }] },
      { date: "2026-03-06", sets: [{ weight: 185, reps: 10 }, { weight: 205, reps: 6 }, { weight: 195, reps: 8 }] },
      { date: "2026-03-13", sets: [{ weight: 195, reps: 10 }, { weight: 205, reps: 8 }, { weight: 195, reps: 10 }] },
      { date: "2026-03-20", sets: [{ weight: 195, reps: 10 }, { weight: 215, reps: 6 }, { weight: 205, reps: 8 }] },
      { date: "2026-03-27", sets: [{ weight: 205, reps: 8 }, { weight: 215, reps: 7 }, { weight: 205, reps: 8 }] },
      { date: "2026-04-06", sets: [{ weight: 205, reps: 10 }, { weight: 215, reps: 8 }, { weight: 205, reps: 8 }] },
    ],
  },
  incline_press: {
    "adjustable_bench+barbell": [
      { date: "2026-02-11", sets: [{ weight: 115, reps: 8 }, { weight: 125, reps: 6 }, { weight: 125, reps: 5 }] },
      { date: "2026-02-18", sets: [{ weight: 125, reps: 8 }, { weight: 135, reps: 5 }, { weight: 125, reps: 6 }] },
      { date: "2026-02-25", sets: [{ weight: 125, reps: 8 }, { weight: 135, reps: 6 }, { weight: 125, reps: 7 }] },
      { date: "2026-03-04", sets: [{ weight: 135, reps: 7 }, { weight: 135, reps: 6 }, { weight: 125, reps: 7 }] },
      { date: "2026-03-11", sets: [{ weight: 135, reps: 8 }, { weight: 145, reps: 4 }, { weight: 135, reps: 6 }] },
      { date: "2026-03-18", sets: [{ weight: 135, reps: 8 }, { weight: 145, reps: 5 }, { weight: 135, reps: 7 }] },
      { date: "2026-03-25", sets: [{ weight: 145, reps: 5 }, { weight: 135, reps: 7 }, { weight: 135, reps: 6 }] },
      { date: "2026-04-04", sets: [{ weight: 145, reps: 6 }, { weight: 145, reps: 5 }, { weight: 135, reps: 7 }] },
    ],
  },
  bicep_curl: {
    "barbell": [
      { date: "2026-02-14", sets: [{ weight: 55, reps: 12 }, { weight: 65, reps: 10 }, { weight: 65, reps: 8 }] },
      { date: "2026-02-21", sets: [{ weight: 65, reps: 12 }, { weight: 65, reps: 10 }, { weight: 65, reps: 10 }] },
      { date: "2026-02-28", sets: [{ weight: 65, reps: 12 }, { weight: 70, reps: 10 }, { weight: 65, reps: 12 }] },
      { date: "2026-03-07", sets: [{ weight: 70, reps: 12 }, { weight: 70, reps: 10 }, { weight: 65, reps: 12 }] },
      { date: "2026-03-14", sets: [{ weight: 70, reps: 12 }, { weight: 75, reps: 8 }, { weight: 70, reps: 10 }] },
      { date: "2026-03-21", sets: [{ weight: 75, reps: 10 }, { weight: 75, reps: 8 }, { weight: 70, reps: 10 }] },
      { date: "2026-03-28", sets: [{ weight: 75, reps: 10 }, { weight: 75, reps: 9 }, { weight: 70, reps: 12 }] },
      { date: "2026-04-06", sets: [{ weight: 75, reps: 10 }, { weight: 75, reps: 10 }, { weight: 70, reps: 12 }] },
    ],
    "ez_curl_bar": [
      { date: "2026-03-08", sets: [{ weight: 60, reps: 12 }, { weight: 65, reps: 10 }] },
    ],
  },
  lat_pulldown: {
    "cable_lat_pulldown": [
      { date: "2026-02-09", sets: [{ weight: 110, reps: 12 }, { weight: 120, reps: 10 }, { weight: 120, reps: 8 }] },
      { date: "2026-02-16", sets: [{ weight: 120, reps: 12 }, { weight: 130, reps: 9 }, { weight: 120, reps: 10 }] },
      { date: "2026-02-23", sets: [{ weight: 120, reps: 12 }, { weight: 130, reps: 10 }, { weight: 130, reps: 8 }] },
      { date: "2026-03-02", sets: [{ weight: 130, reps: 10 }, { weight: 130, reps: 10 }, { weight: 120, reps: 12 }] },
      { date: "2026-03-09", sets: [{ weight: 130, reps: 12 }, { weight: 140, reps: 8 }, { weight: 130, reps: 10 }] },
      { date: "2026-03-16", sets: [{ weight: 130, reps: 12 }, { weight: 140, reps: 9 }, { weight: 130, reps: 12 }] },
      { date: "2026-03-23", sets: [{ weight: 140, reps: 10 }, { weight: 140, reps: 9 }, { weight: 130, reps: 12 }] },
      { date: "2026-04-01", sets: [{ weight: 140, reps: 10 }, { weight: 140, reps: 10 }, { weight: 130, reps: 12 }] },
    ],
  },
  leg_press: {
    "leg_press_machine": [
      { date: "2026-02-12", sets: [{ weight: 270, reps: 12 }, { weight: 290, reps: 10 }, { weight: 290, reps: 8 }] },
      { date: "2026-02-19", sets: [{ weight: 290, reps: 12 }, { weight: 310, reps: 10 }, { weight: 290, reps: 10 }] },
      { date: "2026-02-26", sets: [{ weight: 290, reps: 12 }, { weight: 320, reps: 8 }, { weight: 310, reps: 10 }] },
      { date: "2026-03-05", sets: [{ weight: 310, reps: 12 }, { weight: 330, reps: 8 }, { weight: 310, reps: 10 }] },
      { date: "2026-03-12", sets: [{ weight: 320, reps: 10 }, { weight: 340, reps: 8 }, { weight: 320, reps: 10 }] },
      { date: "2026-03-19", sets: [{ weight: 320, reps: 12 }, { weight: 340, reps: 10 }, { weight: 320, reps: 10 }] },
      { date: "2026-03-26", sets: [{ weight: 340, reps: 10 }, { weight: 340, reps: 9 }, { weight: 320, reps: 12 }] },
      { date: "2026-04-05", sets: [{ weight: 360, reps: 10 }, { weight: 340, reps: 10 }, { weight: 320, reps: 12 }] },
    ],
  },
};

/* Build the set of body-part filters, including exercises that appear in
   two groups via alsoIn. Returns a new array each call, already sorted A-Z. */
function getExercisesForFilter(filter) {
  if (filter === "All") return [...EXERCISE_LIBRARY].sort((a, b) => a.name.localeCompare(b.name));
  return EXERCISE_LIBRARY
    .filter((e) => e.primary === filter || (e.alsoIn && e.alsoIn.includes(filter)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* A variant is "available" if the user has every equipment id it requires.
   A variant with an empty equipment array is always available (bodyweight). */
function variantAvailable(variant, userEquip) {
  return variant.equipment.every((id) => userEquip.has(id));
}
function exerciseHasAnyAvailableVariant(ex, userEquip) {
  return ex.variants.some((v) => variantAvailable(v, userEquip));
}

/* Multi-field search matcher. Matches if the query is a substring of any of:
   - exercise name ("Bench Press")
   - primary muscle group ("Chest")
   - secondary muscles ("Arms", "Shoulders")
   - variant labels ("Barbell + Flat Bench", "Dumbbells", "Smith Machine")

   This lets users search by equipment ("dumbbell"), muscle ("chest"), or
   name ("bench") and get sensible results instead of only name matching.
   Case-insensitive; query is trimmed. */
function exerciseMatchesSearch(ex, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (ex.name.toLowerCase().includes(q)) return true;
  if (ex.primary.toLowerCase().includes(q)) return true;
  if (ex.secondary && ex.secondary.some((m) => m.toLowerCase().includes(q))) return true;
  if (ex.variants.some((v) => v.label.toLowerCase().includes(q))) return true;
  return false;
}
function formatLastMax(id) {
  const pr = MOCK_LAST_MAX[id];
  if (!pr) return null;
  return `${pr.weight} × ${pr.reps}`;
}

/* Returns the history array for a (exerciseId, variantKey) pair, or []. */
function getVariantHistory(exerciseId, vKey) {
  const ex = MOCK_HISTORY[exerciseId];
  if (!ex) return [];
  return ex[vKey] || [];
}

/* Returns the most recent session date (ISO string) across a variant's
   history, or null if the variant has no history. Used for the smart-default
   variant picker and the dropdown previews. */
function getVariantLastDate(exerciseId, vKey) {
  const hist = getVariantHistory(exerciseId, vKey);
  if (hist.length === 0) return null;
  return hist[hist.length - 1].date;
}

/* Smart default variant selection for opening the detail sheet:
   1. The variant with the most recently logged session (any history wins)
   2. Otherwise, the first variant whose equipment the user has
   3. Otherwise, the first variant in the list (so the sheet never crashes)
*/
function pickDefaultVariant(exercise, userEquipment) {
  // (1) most recently logged
  let best = null;
  let bestDate = null;
  for (const v of exercise.variants) {
    const d = getVariantLastDate(exercise.id, variantKey(v));
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

/* For the list row display: last max of the user's most-recently-logged
   variant of this exercise. Returns { value, date } or null.
   - value: formatted string like "225 × 5"
   - date: ISO date string of the session
   Falls back to null for exercises with no logged history at all. */
function getRowLastMax(exerciseId, exercise) {
  const allVariants = MOCK_HISTORY[exerciseId];
  if (!allVariants) return null;

  // Find most recently logged variant
  let latestDate = null;
  let latestVKey = null;
  for (const [vKey, sessions] of Object.entries(allVariants)) {
    if (sessions.length === 0) continue;
    const d = sessions[sessions.length - 1].date;
    if (!latestDate || d > latestDate) {
      latestDate = d;
      latestVKey = vKey;
    }
  }
  if (!latestVKey) return null;

  // Most recent session of that variant → top set of that session
  const sessions = allVariants[latestVKey];
  const topSet = sessionTopSet(sessions[sessions.length - 1].sets);

  // Resolve the variant label by matching the latestVKey against the
  // exercise's library variants. Used for the small subtitle on the row
  // so the user knows which variant the max number is from.
  let variantLabel = null;
  if (exercise) {
    const matchedVariant = exercise.variants.find((v) => variantKey(v) === latestVKey);
    if (matchedVariant) variantLabel = matchedVariant.label;
  }

  return {
    value: `${topSet.weight} × ${topSet.reps}`,
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

/* Format a date string (YYYY-MM-DD) into a short display label like "Mar 22" */
function formatShortDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Shared Components ───────────────────────────────────────── */

function PhoneFrame({ children }) {
  // Detect if we're on a real mobile device (narrow viewport).
  // On real phones: fill the screen, no fake frame, no fake status bar.
  // On desktop: keep the iPhone-style mockup view for design review.
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 500
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < 500);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isMobile) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: COLORS.bg,
          position: "fixed",
          top: 0,
          left: 0,
          overflow: "hidden",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          display: "flex",
          flexDirection: "column",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 375, height: 812, borderRadius: 44, background: COLORS.bg,
        position: "relative", overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 2px #333",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex", flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 50, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", fontSize: 14, fontWeight: 600, color: COLORS.text, flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <svg width="17" height="12" viewBox="0 0 17 12" fill="white"><rect x="0" y="3" width="3" height="9" rx="1" /><rect x="4.5" y="2" width="3" height="10" rx="1" /><rect x="9" y="0" width="3" height="12" rx="1" /><rect x="13.5" y="1" width="3" height="11" rx="1" fillOpacity="0.3" /></svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="white"><path d="M8 2.4C10.6 2.4 13 3.5 14.7 5.3L16 4C14 1.9 11.1 .5 8 .5S2 1.9 0 4L1.3 5.3C3 3.5 5.4 2.4 8 2.4z" fillOpacity="0.3" /><path d="M8 5.4C9.8 5.4 11.4 6.1 12.6 7.3L13.9 6C12.4 4.5 10.3 3.5 8 3.5S3.6 4.5 2.1 6L3.4 7.3C4.6 6.1 6.2 5.4 8 5.4z" fillOpacity="0.6" /><path d="M8 8.4C9 8.4 9.9 8.8 10.5 9.5L8 12 5.5 9.5C6.1 8.8 7 8.4 8 8.4z" /></svg>
          <svg width="27" height="13" viewBox="0 0 27 13" fill="white"><rect x="0" y="0.5" width="23" height="12" rx="3.5" stroke="white" strokeWidth="1" fill="none" /><rect x="24.5" y="4" width="2" height="5" rx="1" fillOpacity="0.4" /><rect x="1.5" y="2" width="18" height="9" rx="2" fill="white" /></svg>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.2)" }} />
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
    <div style={{ padding: "0 24px", marginBottom: 4, flexShrink: 0 }}>
      <div style={{ height: 3, background: COLORS.border, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${(current / total) * 100}%`, background: COLORS.gold, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function PrivacyLine() {
  return (
    <p style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: "center", lineHeight: 1.5, margin: "16px 0 0", fontStyle: "italic" }}>
      Your data is only used to personalize your experience.<br />Never sold, never shared.
    </p>
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
      <div style={{ position: "absolute", top: "40%", textAlign: "center", opacity: logoV ? 1 : 0, transform: logoV ? "translateY(-50%) scale(1)" : "translateY(-50%) scale(1.08)", transition: "all 0.9s cubic-bezier(0.22,1,0.36,1)" }}>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 92, fontWeight: 700, color: COLORS.gold, margin: 0, letterSpacing: 8 }}>MYG</h1>
      </div>
      <div style={{ position: "absolute", bottom: 40, left: 32, right: 32, opacity: contentV ? 1 : 0, transform: contentV ? "translateY(0)" : "translateY(16px)", transition: "all 0.6s ease" }}>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, textAlign: "center", margin: "0 0 4px", fontWeight: 400 }}>Your AI fitness coach</p>
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, padding: "0 24px", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>
          What is your <span style={{ color: COLORS.gold }}>primary fitness goal</span>?
        </h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Choose one — your Coach will build around this.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map((g) => <SelectableChip key={g} label={g} selected={selected === g} onClick={() => setSelected(g)} />)}
        </div>
        <PrivacyLine />
        <div style={{ marginTop: 28, paddingBottom: 20 }}><GoldButton onClick={onNext}>Continue</GoldButton></div>
      </div>
    </div>
  );
}

function FitnessLevelScreen({ onNext, onBack, onSkip }) {
  const [level, setLevel] = useState(null);
  const levels = [
    { id: "beginner", label: "Beginner", desc: "New to working out or getting back into it" },
    { id: "intermediate", label: "Intermediate", desc: "Consistent training for 6+ months" },
    { id: "advanced", label: "Advanced", desc: "Years of structured training experience" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, padding: "0 24px", overflowY: "auto" }}>
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
        <PrivacyLine />
        <div style={{ marginTop: 28, paddingBottom: 20 }}><GoldButton onClick={onNext}>Continue</GoldButton></div>
      </div>
    </div>
  );
}

function AboutYouScreen({ onNext, onBack, onSkip }) {
  const [gender, setGender] = useState(null);
  const [ageRange, setAgeRange] = useState(null);
  const genders = ["Male", "Female", "Prefer not to say"];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, padding: "0 24px", overflowY: "auto" }}>
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
        <PrivacyLine />
        <div style={{ marginTop: 28, paddingBottom: 20 }}><GoldButton onClick={onNext}>Continue</GoldButton></div>
      </div>
    </div>
  );
}

function DaysScreen({ onNext, onBack, onSkip }) {
  const [days, setDays] = useState(3);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, padding: "0 24px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>How many days per week?</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: 0 }}>Your Coach will plan around your schedule.</p>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 80, fontFamily: "Georgia, 'Times New Roman', serif", color: COLORS.gold, fontWeight: 700, marginBottom: 4 }}>{days}</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 16, marginBottom: 40 }}>{days === 1 ? "day" : "days"} per week</div>
          <div style={{ width: "100%", padding: "0 8px" }}>
            <input type="range" min="1" max="7" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "100%", appearance: "none", height: 4, borderRadius: 2, background: `linear-gradient(to right, ${COLORS.gold} 0%, ${COLORS.gold} ${((days - 1) / 6) * 100}%, ${COLORS.border} ${((days - 1) / 6) * 100}%, ${COLORS.border} 100%)`, outline: "none", cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} style={{ color: d === days ? COLORS.gold : COLORS.textSecondary, fontSize: 13, fontWeight: d === days ? 700 : 400, width: 20, textAlign: "center" }}>{d}</span>)}
            </div>
          </div>
        </div>
        <PrivacyLine />
        <div style={{ marginTop: 16, paddingBottom: 20 }}><GoldButton onClick={onNext}>Continue</GoldButton></div>
      </div>
    </div>
  );
}

/* ── Equipment Preset Screen ─────────────────────────────────── */

function EquipmentPresetScreen({ onBack, onSkip, selectedEquipment, onPickPreset, onEditDetail, onContinue }) {
  const count = selectedEquipment.size;
  const hasSelection = count > 0;

  const opts = [
    { id: "full", label: "Full Gym", icon: "🏋️", desc: "Commercial gym — all equipment" },
    { id: "home", label: "Home Gym", icon: "🏠", desc: "Dumbbells, bench, maybe a rack" },
    { id: "bodyweight", label: "Bodyweight Only", icon: "💪", desc: "No equipment needed" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TopBar onBack={onBack} onSkip={onSkip} />
      <div style={{ flex: 1, minHeight: 0, padding: "0 24px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>Your equipment</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 24px" }}>
          {hasSelection ? "Your equipment is saved. Tap to change or continue." : "Select a starting point to customize."}
        </p>

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
              <span style={{ fontSize: 26 }}>{o.icon}</span>
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

        <PrivacyLine />
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

/* ── Equipment Detail Screen (Fitbod-style) ──────────────────── */

function EquipmentDetailScreen({ presetId, existingSelection, onDone, onBack }) {
  const [selected, setSelected] = useState(() => {
    if (existingSelection && existingSelection.size > 0 && presetId === null) {
      return new Set(existingSelection);
    }
    return new Set(PRESETS[presetId] || []);
  });

  const [collapsed, setCollapsed] = useState(new Set());

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSection = (catId) => {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(catId)) n.delete(catId); else n.add(catId);
      return n;
    });
  };

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

      <div style={{ padding: "0 24px 10px", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, color: COLORS.text, margin: "4px 0 0", fontWeight: 400 }}>Available Equipment</h2>
      </div>

      {/* Scrollable equipment list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {EQUIPMENT_CATEGORIES.map((cat) => {
          const isOpen = !collapsed.has(cat.id);
          const catCount = cat.items.filter((i) => selected.has(i.id)).length;
          const allIn = catCount === cat.items.length;

          return (
            <div key={cat.id}>
              {/* Category header row */}
              <button
                onClick={() => toggleSection(cat.id)}
                style={{
                  width: "100%", padding: "13px 24px",
                  background: "rgba(255,255,255,0.03)",
                  border: "none", borderBottom: `1px solid ${COLORS.border}`,
                  cursor: "pointer", display: "flex", alignItems: "center",
                }}
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke={COLORS.textSecondary} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: "transform 0.2s ease", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", marginRight: 12, flexShrink: 0 }}
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
                <span style={{ flex: 1, textAlign: "left", color: COLORS.text, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {cat.label}
                </span>
                <button
                  onClick={(e) => toggleAllInCat(cat, e)}
                  style={{ background: "none", border: "none", color: COLORS.gold, fontSize: 12, cursor: "pointer", padding: "2px 0", fontWeight: 500 }}
                >
                  {allIn ? "None" : "All"}
                </button>
              </button>

              {/* Individual items */}
              {isOpen &&
                cat.items.map((item, idx) => {
                  const isSel = selected.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      style={{
                        width: "100%", padding: "14px 24px 14px 48px",
                        background: "transparent",
                        border: "none",
                        borderBottom: `1px solid rgba(51,51,51,${idx < cat.items.length - 1 ? "0.5" : "1"})`,
                        cursor: "pointer", display: "flex", alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          flex: 1, textAlign: "left",
                          color: isSel ? COLORS.text : COLORS.inactive,
                          fontSize: 15, fontWeight: isSel ? 500 : 400,
                        }}
                      >
                        {item.label}
                      </span>
                      <div style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isSel && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} showSkip={false} />
      <div style={{ flex: 1, padding: "0 24px", overflowY: "auto" }}>
        <div style={{ marginTop: 8, marginBottom: 32 }}><MYGLogo size={36} /></div>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "0 0 8px", fontWeight: 400 }}>Create your account</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>One last step before you meet your Coach.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TextInput placeholder="Email" value={email} onChange={setEmail} type="email" />
          <TextInput placeholder="Password" value={pw} onChange={setPw} type="password" />
        </div>
        <div style={{ marginTop: 24 }}><GoldButton onClick={onNext}>Create Account</GoldButton></div>
        <Divider />
        <div style={{ paddingBottom: 20 }}><SocialButtons /></div>
      </div>
    </div>
  );
}

function NameScreen({ onNext, onBack }) {
  const [name, setName] = useState("");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <TopBar onBack={onBack} showSkip={false} />
      <div style={{ flex: 1, padding: "0 24px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28, color: COLORS.text, margin: "12px 0 8px", fontWeight: 400 }}>What should we call you?</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px" }}>Your Coach will use this name.</p>
        <TextInput placeholder="First name" value={name} onChange={setName} />
        <div style={{ flex: 1 }} />
        <div style={{ paddingBottom: 20 }}><GoldButton onClick={onNext}>Continue</GoldButton></div>
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

function HomeTab({ onTabChange }) {
  const rw = [
    { name: "Upper Body Push", date: "Today", muscles: "Chest, Shoulders, Triceps" },
    { name: "Lower Body", date: "Yesterday", muscles: "Quads, Hamstrings, Glutes" },
    { name: "Pull Day", date: "Mar 28", muscles: "Back, Biceps" },
  ];
  return (
    <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 2px", fontWeight: 400 }}>Good morning, Alex</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: 0 }}>Level 2 · Grinder</p>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: COLORS.card, border: `2px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: COLORS.gold, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: 16 }}>A</span>
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
        {[{ l: "Streak", v: "3", u: "days", c: COLORS.gold }, { l: "XP", v: "750", u: "/ 1,500", c: COLORS.gold }, { l: "Workouts", v: "12", u: "total", c: COLORS.text }].map((s, i) => (
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
      {rw.map((w, i) => (
        <div key={i} style={{ background: COLORS.card, borderRadius: 10, padding: 16, marginBottom: 8, border: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ color: COLORS.text, fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{w.name}</div><div style={{ color: COLORS.textSecondary, fontSize: 12 }}>{w.muscles}</div></div>
          <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{w.date}</span>
        </div>
      ))}
    </div>
  );
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
    name: "Upper Body Push",
    date: "2026-04-06",
    durationSec: 52 * 60,
    exercises: [
      { name: "Bench Press", variantLabel: "Barbell + Flat Bench", sets: [
        { weight: 135, reps: 10, type: "warmup" },
        { weight: 185, reps: 8,  type: "working" },
        { weight: 205, reps: 6,  type: "working" },
        { weight: 215, reps: 5,  type: "working" },
        { weight: 195, reps: 6,  type: "working" },
      ]},
      { name: "Overhead Press", variantLabel: "Barbell", sets: [
        { weight: 95,  reps: 8, type: "working" },
        { weight: 105, reps: 6, type: "working" },
        { weight: 105, reps: 5, type: "working" },
      ]},
      { name: "Incline Press", variantLabel: "Dumbbells + Adjustable Bench", sets: [
        { weight: 50, reps: 10, type: "working" },
        { weight: 55, reps: 8,  type: "working" },
        { weight: 55, reps: 8,  type: "working" },
      ]},
      { name: "Lateral Raise", variantLabel: "Dumbbells", sets: [
        { weight: 15, reps: 12, type: "working" },
        { weight: 15, reps: 12, type: "working" },
        { weight: 20, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h2",
    name: "Leg Day",
    date: "2026-04-04",
    durationSec: 48 * 60,
    exercises: [
      { name: "Squat", variantLabel: "Barbell + Squat Rack", sets: [
        { weight: 135, reps: 10, type: "warmup" },
        { weight: 225, reps: 8,  type: "working" },
        { weight: 245, reps: 5,  type: "working" },
        { weight: 245, reps: 5,  type: "working" },
      ]},
      { name: "Romanian Deadlift", variantLabel: "Barbell", sets: [
        { weight: 185, reps: 10, type: "working" },
        { weight: 205, reps: 8,  type: "working" },
        { weight: 205, reps: 8,  type: "working" },
      ]},
      { name: "Leg Press", variantLabel: "Leg Press (45°)", sets: [
        { weight: 360, reps: 12, type: "working" },
        { weight: 410, reps: 10, type: "working" },
        { weight: 410, reps: 10, type: "working" },
      ]},
    ],
  },
  {
    id: "h3",
    name: "Pull Day",
    date: "2026-04-02",
    durationSec: 44 * 60,
    exercises: [
      { name: "Deadlift", variantLabel: "Barbell", sets: [
        { weight: 225, reps: 5, type: "warmup" },
        { weight: 275, reps: 5, type: "working" },
        { weight: 315, reps: 3, type: "working" },
        { weight: 315, reps: 3, type: "working" },
      ]},
      { name: "Pull-Up", variantLabel: "Pull-Up Bar", sets: [
        { weight: 0, reps: 8, type: "working" },
        { weight: 0, reps: 7, type: "working" },
        { weight: 0, reps: 6, type: "working" },
      ]},
      { name: "Seated Row", variantLabel: "Seated Cable Row", sets: [
        { weight: 130, reps: 10, type: "working" },
        { weight: 145, reps: 8,  type: "working" },
        { weight: 145, reps: 8,  type: "working" },
      ]},
    ],
  },
];

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
  finishedSession,
  onStartEmpty, onUpdateWorkout, onMinimize, onCancel, onFinish,
  onCommitFinished, onDiscardFinished,
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

  // Active workout that's not minimized → show the logger
  if (workout && !minimized) {
    return (
      <ActiveLogger
        workout={workout}
        onUpdateWorkout={onUpdateWorkout}
        userEquipment={userEquipment}
        onMinimize={onMinimize}
        onCancel={onCancel}
        onFinish={onFinish}
      />
    );
  }

  // Idle (or minimized active workout — same idle view, the SessionBar
  // takes care of letting them get back into it)
  return (
    <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", position: "relative" }}>
      <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 20px", fontWeight: 400 }}>Workout</h2>

      {/* Empty CTA — Situation B only. Situation A (Coach-queued workout)
          will live above this when Coach generation lands.
          If a workout is currently active but minimized, hide this CTA so
          the user isn't tempted to start a second one. */}
      {!workout && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30, paddingBottom: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: COLORS.card, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="1.8"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
          </div>
          <p style={{ color: COLORS.text, fontSize: 17, fontWeight: 500, margin: "0 0 4px" }}>No active workout</p>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: "0 0 22px", textAlign: "center" }}>Start an empty session or ask Coach to build one</p>
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
      )}

      {/* History list — full-detail cards per spec */}
      <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: workout ? "0 0 10px" : "32px 0 10px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>History</p>
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
                    {ex.sets.length} sets · Max: {top.weight}×{top.reps}
                  </span>
                </div>
              );
            })}
          </button>
        );
      })}

      {/* History recap bottom sheet */}
      {openHistoryId && (
        <HistoryRecapSheet
          session={history.find((w) => w.id === openHistoryId)}
          onClose={() => setOpenHistoryId(null)}
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
  workout, onUpdateWorkout, userEquipment, onMinimize, onCancel, onFinish,
}) {
  // Pull session state out of the workout prop. We mutate via onUpdateWorkout
  // (which writes through to App-level state, so it survives tab switches).
  const { exercises, workoutName, startTime, restTimerMode, restTimer } = workout;

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
  const setRestTimerMode = (m) => onUpdateWorkout({ restTimerMode: m });

  const [elapsed, setElapsed] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Live timer — ticks once per second while logger is mounted
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // When the active field changes, scroll its row into view above the keypad.
  useEffect(() => {
    if (!activeField) return;
    const key = `${activeField.exerciseUid}_${activeField.setIdx}`;
    const node = setRowRefs.current[key];
    if (node && node.scrollIntoView) {
      // Use a small timeout so React has committed any layout changes first.
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    }
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
  const addExercise = (libraryEx, variant) => {
    // Pre-fill the first set as a placeholder from the previous workout's
    // first set, if any history exists for this variant.
    const hist = getVariantHistory(libraryEx.id, variantKey(variant));
    const lastSession = hist[hist.length - 1];
    const prevFirstSet = lastSession && lastSession.sets[0];
    const hasPrev = prevFirstSet != null;

    setExercises((prev) => [
      ...prev,
      {
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
      },
    ]);
    setPickerOpen(false);
  };

  const removeExercise = (uid) => {
    setExercises((prev) => prev.filter((e) => e.uid !== uid));
    if (restTimer && restTimer.exerciseUid === uid) clearRestTimer();
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
        if ("weight" in patch) next.weightIsPlaceholder = false;
        if ("reps" in patch) next.repsIsPlaceholder = false;
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
        const hist = getVariantHistory(ex.exerciseId, variantKey(ex.variant));
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
    // promotion logic actually fires.
    if (activeField.field === "reps") {
      const ex = exercisesRef.current.find((e) => e.uid === activeField.exerciseUid);
      const set = ex && ex.sets[activeField.setIdx];
      if (set && !set.done) {
        toggleSetDone(activeField.exerciseUid, activeField.setIdx);
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
    if (dragY > 120) { onMinimize(); }
    setDragY(0);
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
      position: "relative",
      transform: `translateY(${dragY}px)`,
      transition: dragMinRef.current.dragging ? "none" : "transform 0.25s ease",
      opacity: dragY > 0 ? Math.max(0.4, 1 - dragY / 300) : 1,
    }}>
      {/* ── Drag handle — pull down to minimize ── */}
      <div
        onPointerDown={onDragHandleDown}
        onPointerMove={onDragHandleMove}
        onPointerUp={onDragHandleUp}
        onPointerCancel={onDragHandleUp}
        style={{
          display: "flex", justifyContent: "center", padding: "8px 0 4px",
          cursor: "grab", touchAction: "none", flexShrink: 0,
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: COLORS.border,
        }} />
      </div>

      {/* ── Header — clean: name + timer left, gear + finish right ── */}
      <div style={{
        padding: "4px 20px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexShrink: 0, gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <input
              autoFocus
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
              style={{
                background: "transparent", border: "none", outline: "none",
                color: COLORS.text, fontSize: 19, fontWeight: 600, padding: 0,
                width: "100%", borderBottom: `1px solid ${COLORS.gold}`,
              }}
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: COLORS.text, fontSize: 19, fontWeight: 600, textAlign: "left",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                width: "100%", lineHeight: 1.2,
              }}
            >
              {workoutName}
            </button>
          )}
          <div style={{
            color: COLORS.gold, fontSize: 12, fontWeight: 500,
            marginTop: 4, fontVariantNumeric: "tabular-nums",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.gold }} />
            {formatDuration(elapsed)}
            {/* Gear icon — opens settings menu (rest timer + cancel) */}
            <button
              onClick={() => setSettingsMenuOpen((o) => !o)}
              style={{
                background: "none", border: "none", padding: "2px 4px",
                cursor: "pointer", color: COLORS.textSecondary,
                display: "flex", alignItems: "center", marginLeft: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
        <button
          onClick={onFinish}
          style={{
            padding: "8px 18px", background: COLORS.gold, border: "none",
            borderRadius: 17, color: COLORS.bg, fontSize: 13, fontWeight: 700,
            cursor: "pointer", height: 34, flexShrink: 0,
          }}
        >
          Finish
        </button>
      </div>

      {/* Settings menu (gear icon) — rest timer + cancel */}
      {settingsMenuOpen && (
        <>
          <div onClick={() => setSettingsMenuOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 15 }} />
          <div style={{
            position: "absolute", top: 70, left: 20, zIndex: 16,
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            minWidth: 200, padding: 6,
          }}>
            <div style={{ padding: "6px 10px 4px", color: COLORS.textSecondary, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Rest Timer</div>
            {[
              { id: "countup",   label: "Count up" },
              { id: "countdown", label: "Countdown (90s)" },
              { id: "off",       label: "Off" },
            ].map((opt) => {
              const isActive = restTimerMode === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => { setRestTimerMode(opt.id); }}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 6,
                    background: isActive ? COLORS.goldHighlight : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    color: isActive ? COLORS.gold : COLORS.text, fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <span>{opt.label}</span>
                  {isActive && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              );
            })}
            <div style={{ height: 1, background: COLORS.border, margin: "6px 4px" }} />
            <button
              onClick={() => { setSettingsMenuOpen(false); setConfirmCancel(true); }}
              style={{
                width: "100%", padding: "10px 10px", borderRadius: 6,
                background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left", color: "#FF6B6B", fontSize: 13, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
              Cancel Workout
            </button>
          </div>
        </>
      )}

      {/* ── Scrollable exercise list ── */}
      <div
        ref={scrollRef}
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
            isLast={exIdx === exercises.length - 1}
            restTimerMode={restTimerMode}
            restTimer={restTimer}
            activeField={activeField}
            caretPos={caretPos}
            setCaretPos={setCaretPos}
            onUpdateSet={(setIdx, patch) => updateSet(ex.uid, setIdx, patch)}
            onToggleSetDone={(setIdx) => toggleSetDone(ex.uid, setIdx)}
            onAddSet={() => addSet(ex.uid)}
            onRemoveSet={(setIdx) => removeSet(ex.uid, setIdx)}
            onClearRestTimer={clearRestTimer}
            onRemove={() => removeExercise(ex.uid)}
            onToggleCollapsed={() => toggleExerciseCollapsed(ex.uid)}
            onOpenSetTypePopover={(setIdx) => setTypePopover({ uid: ex.uid, setIdx })}
            onOpenVariantMenu={() => setVariantMenuFor(ex.uid)}
            onFocusField={(setIdx, field) => {
              // Focusing a placeholder field just clears that ONE field's
              // placeholder so the user can type fresh. The other field
              // stays as a placeholder (gray) until the user touches it
              // too OR commits the whole set with the checkbox.
              const target = ex.sets[setIdx];
              if (target) {
                if (field === "weight" && target.weightIsPlaceholder) {
                  updateSet(ex.uid, setIdx, {
                    weight: "",
                    weightIsPlaceholder: false,
                  });
                } else if (field === "reps" && target.repsIsPlaceholder) {
                  updateSet(ex.uid, setIdx, {
                    reps: "",
                    repsIsPlaceholder: false,
                  });
                }
              }
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

      {/* ── Tap-outside catcher to dismiss keypad ── */}
      {activeField && (
        <div
          onClick={() => setActiveField(null)}
          style={{
            position: "absolute", left: 0, right: 0, top: 0,
            bottom: 280, zIndex: 39,
          }}
        />
      )}

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
          onClose={() => setPickerOpen(false)}
          onAdd={addExercise}
        />
      )}
    </div>
  );
}

/* ── Exercise Card ────────────────────────────────────────────────
   One card per exercise in the active logger. Handles its own swipe-left
   reveal of Remove + Alternative actions, set rows, inline rest timer,
   collapse-on-complete behavior, and add-set button.
*/
function ExerciseCard({
  exercise, isLast, restTimerMode, restTimer, activeField, caretPos, setCaretPos,
  onUpdateSet, onToggleSetDone, onAddSet, onRemoveSet, onClearRestTimer,
  onRemove, onToggleCollapsed,
  onOpenSetTypePopover, onOpenVariantMenu,
  onFocusField, registerSetRef,
}) {
  // Swipe-to-reveal Remove/Alternative actions on the entire exercise
  const REVEAL_WIDTH = 140;
  const [drag, setDrag] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const dragRef = useRef({ startX: null, dragging: false });

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, dragging: true };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    let next = revealed ? -REVEAL_WIDTH + dx : dx;
    if (next > 0) next = 0;
    if (next < -REVEAL_WIDTH) next = -REVEAL_WIDTH;
    setDrag(next);
  };
  const onPointerUp = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    const open = drag < -REVEAL_WIDTH / 2;
    setRevealed(open);
    setDrag(open ? -REVEAL_WIDTH : 0);
  };
  const closeSwipe = () => { setRevealed(false); setDrag(0); };

  // Look up the library entry to know whether the variant chip should show
  const libEx = EXERCISE_LIBRARY.find((l) => l.id === exercise.exerciseId);
  const hasMultipleVariants = libEx && libEx.variants.length > 1;

  // Last-session reference for the overload cue + Prev column. This re-derives
  // when the variant changes (since variantKey changes) — so the prev column
  // automatically refreshes after a mid-workout variant switch.
  // Last-session reference for the Prev column. Re-derives when the
  // variant changes so the column automatically refreshes after a
  // mid-workout variant switch.
  const variantHist = getVariantHistory(exercise.exerciseId, variantKey(exercise.variant));
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

  return (
    <div style={{
      position: "relative",
      paddingBottom: 18,
      marginBottom: 18,
      borderBottom: isLast ? "none" : `1px solid #1F1F1F`,
    }}>
      {/* Underlying action layer (revealed by swiping the entire exercise) */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 18,
        width: REVEAL_WIDTH, display: "flex",
        borderRadius: 10, overflow: "hidden",
      }}>
        <button
          onClick={() => { closeSwipe(); /* TODO: open Coach alternatives picker */ }}
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
          transition: dragRef.current.dragging ? "none" : "transform 0.22s ease",
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
                // field is a placeholder, show the placeholder value in
                // gray. Otherwise show the real value (or empty/0 fallback).
                const displayWeight =
                  set.weight !== "" && set.weight != null ? String(set.weight) :
                  set.weightIsPlaceholder && set.placeholderWeight !== "" ? String(set.placeholderWeight) :
                  prevSet ? String(prevSet.weight) : "0";
                const displayReps =
                  set.reps !== "" && set.reps != null ? String(set.reps) :
                  set.repsIsPlaceholder && set.placeholderReps !== "" ? String(set.placeholderReps) :
                  prevSet ? String(prevSet.reps) : "0";

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

                      {/* Previous reference */}
                      <span style={{
                        flex: 1, color: COLORS.textSecondary,
                        fontSize: 12, textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {prevSet ? `${prevSet.weight}×${prevSet.reps}` : "—"}
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
                            width: 56, padding: "6px 0", textAlign: "center",
                            background: weightActive
                              ? (caretPos === -1 ? COLORS.gold : "#1A1A1A")
                              : (set.done ? "transparent" : "#1A1A1A"),
                            border: `1.5px solid ${
                              weightActive
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
                            width: 56, padding: "6px 0", textAlign: "center",
                            background: repsActive
                              ? (caretPos === -1 ? COLORS.gold : "#1A1A1A")
                              : (set.done ? "transparent" : "#1A1A1A"),
                            border: `1.5px solid ${
                              repsActive
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

                      {/* Done checkbox */}
                      <div style={{ width: 32, display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleSetDone(idx); }}
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
function InlineRestTimer({ startTs, mode, onDismiss }) {
  const COUNTDOWN_TARGET = 90;
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
      color = COLORS.textSecondary;
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

  const Btn = ({ children, onClick, style: s = {}, onPointerDown: pd, onPointerUp: pu }) => (
    <button
      onClick={onClick}
      onPointerDown={pd}
      onPointerUp={pu}
      onPointerLeave={pu}
      onPointerCancel={pu}
      style={{
        height: 46, background: "#1A1A1A", border: `1px solid #252525`,
        borderRadius: 10, color: COLORS.text, fontSize: 18, fontWeight: 500,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        ...s,
      }}
    >
      {children}
    </button>
  );

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
function SessionBar({ workout, onTap }) {
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

  // Compute rest timer display if active
  let restPill = null;
  if (workout.restTimer) {
    const COUNTDOWN_TARGET = 90;
    let display, isCountdown = workout.restTimerMode === "countdown";
    if (isCountdown) {
      const remaining = COUNTDOWN_TARGET - restElapsed;
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
          {workout.workoutName}
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
function AddExerciseSheet({ userEquipment, onClose, onAdd }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Stage 2: variant confirm
  const [pendingExId, setPendingExId] = useState(null);
  const pendingEx = pendingExId ? EXERCISE_LIBRARY.find((e) => e.id === pendingExId) : null;
  const [pendingVariant, setPendingVariant] = useState(null);
  useEffect(() => {
    if (pendingEx) setPendingVariant(pickDefaultVariant(pendingEx, userEquipment));
  }, [pendingExId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio"];

  const base = getExercisesForFilter(filter);
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

            <div style={{ flex: 1, padding: "4px 20px 16px", overflowY: "auto", minHeight: 0 }}>
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
                    width: "100%", padding: "10px 0",
                    display: "flex", alignItems: "center", gap: 12,
                    background: "none", border: "none",
                    borderBottom: `1px solid ${COLORS.border}`,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <ExerciseThumbnail size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                    <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>{e.primary}</div>
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
                        onClick={() => { setFilter(g); setMenuOpen(false); }}
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
function HistoryRecapSheet({ session, onClose }) {
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
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px" }}>
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
                      {s.weight} lbs × {s.reps}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {/* Reserved for a future phase per spec */}
          <button
            disabled
            style={{
              width: "100%", padding: 14, marginTop: 8,
              background: "transparent", border: `1.5px solid ${COLORS.border}`,
              borderRadius: 10, color: COLORS.inactive, fontSize: 14,
              cursor: "not-allowed",
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
                    {ex.sets.length} sets · Max: {top.weight}×{top.reps}
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

function CoachTab() {
  const [messages, setMessages] = useState([{ role: "coach", text: "Hey Alex! I'm your Coach. I see you're focused on building muscle with 3 days per week at a full gym. Want me to build you a workout for today, or do you have a question?" }]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const send = () => { if (!input.trim()) return; const u = input.trim(); setInput(""); setMessages((m) => [...m, { role: "user", text: u }]); setTimeout(() => { setMessages((m) => [...m, { role: "coach", text: "Here's what I'd suggest for today — a Push day focused on chest and shoulders. Want me to build it out with sets and reps?" }]); }, 800); };
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.bg} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg></div>
          <div><div style={{ color: COLORS.text, fontSize: 16, fontWeight: 600 }}>Coach AI</div><div style={{ color: COLORS.gold, fontSize: 11 }}>Online</div></div>
        </div>
      </div>
      <div style={{ flex: 1, padding: "16px 24px", overflowY: "auto" }}>
        {messages.map((m, i) => (<div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}><div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: 16, background: m.role === "user" ? COLORS.gold : COLORS.card, color: m.role === "user" ? COLORS.bg : COLORS.text, fontSize: 14, lineHeight: 1.5, borderBottomRightRadius: m.role === "user" ? 4 : 16, borderBottomLeftRadius: m.role === "coach" ? 4 : 16 }}>{m.text}</div></div>))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask your Coach..." style={{ flex: 1, padding: "12px 16px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, color: COLORS.text, fontSize: 14, outline: "none" }} />
          <button onClick={send} style={{ width: 40, height: 40, borderRadius: 20, background: COLORS.gold, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.bg} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
        </div>
      </div>
    </div>
  );
}

/* ── Exercises Tab ───────────────────────────────────────────────
   List view: search + body part filter chips + "My Equipment" toggle pill.
   Each row is Strong-style: thumbnail, name, body part, last max on the right.
   Tapping a row opens ExerciseDetailScreen (in-tab sub-screen, no route change).
*/

function ExerciseThumbnail({ size = 56 }) {
  // Placeholder — swap for real exercise illustrations later.
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, background: COLORS.card,
      border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700,
        color: COLORS.gold, fontSize: size * 0.32, letterSpacing: 0.5,
      }}>MYG</span>
    </div>
  );
}

function ExercisesTab({ userEquipment, onOpenEquipmentEditor }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [onlyMine, setOnlyMine] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Body-part filter options — ordered top-down by anatomical region, with
  // Full Body and Cardio last. Cleaner than the old order which had Cardio
  // mid-list between Core and Full Body.
  const groups = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio"];

  const base = getExercisesForFilter(filter);
  const filtered = base.filter((e) => {
    if (search && !exerciseMatchesSearch(e, search)) return false;
    if (onlyMine && !exerciseHasAnyAvailableVariant(e, userEquipment)) return false;
    return true;
  });

  // Body Part button shows "Any Body Part" for default, current selection otherwise.
  const bodyPartLabel = filter === "All" ? "Any Body Part" : filter;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      <div style={{ padding: "8px 24px 0", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 8px", fontWeight: 400 }}>Exercises</h2>

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
      <div style={{ flex: 1, padding: "4px 24px 20px", overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: COLORS.textSecondary, fontSize: 13, padding: "40px 20px" }}>
            {onlyMine
              ? "No exercises match your equipment. Try turning off the My Equipment filter."
              : "No exercises found."}
          </div>
        )}
        {filtered.map((e) => {
          const lastMax = getRowLastMax(e.id, e);
          return (
            <button
              key={e.id}
              onClick={() => setDetailId(e.id)}
              style={{
                width: "100%", padding: "8px 0",
                display: "flex", alignItems: "center", gap: 12,
                background: "none", border: "none",
                borderBottom: `1px solid ${COLORS.border}`,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <ExerciseThumbnail size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 1 }}>{e.primary}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                {lastMax ? (
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
            position: "absolute", top: 122, left: 24, zIndex: 11,
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
                  onClick={() => { setFilter(g); setMenuOpen(false); }}
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

      {/* Exercise detail bottom sheet — overlays the tab content. Backdrop
          click-to-dismiss above the sheet; sheet covers the lower ~85%. */}
      {detailId && (
        <ExerciseDetailSheet
          exercise={EXERCISE_LIBRARY.find((e) => e.id === detailId)}
          userEquipment={userEquipment}
          onClose={() => setDetailId(null)}
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

function ExerciseDetailSheet({ exercise, userEquipment, onClose }) {
  const [activeTab, setActiveTab] = useState("about");
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);

  // Smart-default variant: most recently logged, else first available by
  // equipment, else first in the list. User can switch via the chip.
  const [activeVariant, setActiveVariant] = useState(() => pickDefaultVariant(exercise, userEquipment));

  const hasMultipleVariants = exercise.variants.length > 1;
  const activeVariantKey = variantKey(activeVariant);
  const variantHistory = getVariantHistory(exercise.id, activeVariantKey);
  const hasHistory = variantHistory.length > 0;

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

        {/* Header: centered name with compact CTA floating top-right */}
        <div style={{ padding: "6px 16px 10px", flexShrink: 0, position: "relative" }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 20, color: COLORS.text,
            margin: 0, padding: "0 72px", // leave room for the CTA button on the right
            fontWeight: 400, lineHeight: 1.2,
            textAlign: "center",
          }}>{exercise.name}</h2>

          {/* Compact Add-to-Workout CTA in the top-right of the sheet header */}
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
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
                const hist = getVariantHistory(exercise.id, vk);
                const isActive = vk === activeVariantKey;
                let preview;
                if (hist.length > 0) {
                  const lastSession = hist[hist.length - 1];
                  const top = sessionTopSet(lastSession.sets);
                  preview = `${hist.length} ${hist.length === 1 ? "session" : "sessions"} · last ${top.weight}×${top.reps}`;
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
                    }}>{set.weight} × {set.reps}</span>
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
  const metricLabel = metric === "e1rm" ? "lb" : metric === "volume" ? "lb" : "lb";

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

        {/* Y-axis unit label top-left */}
        <text x={PAD_L - 6} y={PAD_T - 2} fontSize="9" fill={COLORS.textSecondary} textAnchor="end">
          {metricLabel}
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
      sub: `${bestE1rm.weight}×${bestE1rm.reps} · ${formatShortDate(bestE1rm.date)}`,
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

/* ── Profile Tab ─────────────────────────────────────────────────
   Single scrolling page per Bible §6.5. Two sections separated by a
   gold rule divider:

     Section 1 — Settings (standard register)
       Avatar/name/level header, settings rows, Log Out

     Section 2 — Coach Profile (themed register)
       Gold rule divider, section header with C monogram + italic
       Georgia title, one-line italic subtitle, then six entry cards
       for About You / My Equipment / Your Rules / What Coach Has
       Noticed / What Coach Sees / Coach's Assessment (locked).

   Visual distinction between the two sections is intentionally quiet:
   Coach cards share the same dark card background as settings rows
   but add a 2px gold left-edge accent and use Georgia serif titles.
   Gold is used as an accent, never as a background fill.

   The "Equipment" row inside Coach Profile wires to onOpenEquipmentEditor,
   which the App component routes to the full-screen EquipmentDetailScreen.
*/

function ProfileTab({ onOpenEquipmentEditor, equipmentCount, onLogout }) {
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Settings rows (Section 1). Bible §6.5 lists Body Stats, Membership,
  // Units, Leaderboard, Notifications, Account. Fitness Profile and
  // Workout Preferences are NOT here — that content moved down into
  // the Coach Profile section.
  const settingsRows = [
    { id: "body_stats", label: "Body Stats", desc: "Height, weight, age, gender" },
    { id: "membership", label: "Membership", desc: "Active · Renews Apr 15" },
    { id: "units", label: "Units", desc: "Pounds (lbs)" },
    { id: "leaderboard", label: "Leaderboard", desc: "Opted in" },
    { id: "notifications", label: "Notifications", desc: "Streak reminders on" },
    { id: "account", label: "Account", desc: "alex@email.com" },
  ];

  // Coach Profile cards (Section 2). Stateful descriptors show what
  // Coach currently knows about the user at a glance. Equipment card
  // wires to the full equipment editor.
  const coachCards = [
    { id: "about_you", label: "About You", desc: "Build Muscle · Intermediate · 3 days/week" },
    { id: "equipment", label: "My Equipment", desc: equipmentCount > 0 ? `${equipmentCount} items selected` : "Not set", onClick: onOpenEquipmentEditor },
    { id: "rules", label: "Your Rules", desc: "4 rules · created via Coach chat" },
    { id: "noticed", label: "What Coach Has Noticed", desc: "7 observations", descItalic: true },
    { id: "sees", label: "What Coach Sees", desc: "12-day streak · 47 sessions" },
  ];

  const cardBase = {
    width: "100%", padding: "14px 16px", background: COLORS.card,
    borderRadius: 10, marginBottom: 8, cursor: "pointer", textAlign: "left",
    display: "flex", alignItems: "center", gap: 14, fontFamily: "inherit",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      {/* Header — matches Exercises/Workout tab pattern */}
      <div style={{ padding: "8px 24px 0", flexShrink: 0 }}>
        <h2 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, color: COLORS.text, margin: "0 0 12px", fontWeight: 400 }}>Profile</h2>
      </div>

      <div style={{ flex: 1, padding: "0 24px 24px", overflowY: "auto", minHeight: 0 }}>

        {/* Avatar block */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: COLORS.card, border: `2px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: COLORS.gold, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: 22 }}>A</span>
          </div>
          <div>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 600 }}>Alex</div>
            <div style={{ color: COLORS.gold, fontSize: 12, marginTop: 2 }}>Level 2 · Grinder · 750 XP</div>
          </div>
        </div>

        {/* Section 1 — Settings rows */}
        {settingsRows.map((s) => (
          <button key={s.id} style={{ ...cardBase, border: `1px solid ${COLORS.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 500 }}>{s.label}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>{s.desc}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}

        {/* Log Out — lives with settings, above the divider */}
        <button
          onClick={() => setConfirmLogout(true)}
          style={{ width: "100%", padding: 13, background: "transparent", border: "1px solid #442222", borderRadius: 10, color: "#cc4444", fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log Out
        </button>

        {/* Gold rule divider — soft gradient fade from transparent */}
        <div style={{
          margin: "28px 0 22px",
          height: 1,
          background: `linear-gradient(to right, transparent 0%, ${COLORS.gold} 20%, ${COLORS.gold} 80%, transparent 100%)`,
          opacity: 0.8,
        }} />

        {/* Section 2 — Coach Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: COLORS.goldHighlight, border: `1.5px solid ${COLORS.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, color: COLORS.gold, fontWeight: 700, fontStyle: "italic", lineHeight: 1 }}>C</span>
          </div>
          <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, color: COLORS.gold, fontWeight: 400, fontStyle: "italic" }}>Coach Profile</div>
        </div>

        <div style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.5, marginBottom: 14 }}>
          The version of you Coach sees when building your sessions.
        </div>

        {/* Coach Profile cards — quiet gold accent on left edge, serif titles */}
        {coachCards.map((c) => (
          <button
            key={c.id}
            onClick={c.onClick}
            style={{
              ...cardBase,
              borderTop: `1px solid ${COLORS.border}`,
              borderRight: `1px solid ${COLORS.border}`,
              borderBottom: `1px solid ${COLORS.border}`,
              borderLeft: `2px solid ${COLORS.gold}`,
              borderRadius: "0 10px 10px 0",
              cursor: c.onClick ? "pointer" : "pointer",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, color: COLORS.text, fontWeight: 400 }}>{c.label}</div>
              <div style={{
                fontSize: 12, color: COLORS.textSecondary, marginTop: 3,
                ...(c.descItalic ? { fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" } : {}),
              }}>{c.desc}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}

        {/* Coach's Assessment — locked (Phase 3, unlocks at 20 sessions) */}
        <div style={{
          width: "100%", padding: "14px 16px", background: "#0c0c0c",
          border: "1px dashed #2a2410", borderRadius: 10,
          display: "flex", alignItems: "center", gap: 14, opacity: 0.6,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, color: COLORS.textSecondary, fontWeight: 400 }}>Coach&apos;s Assessment</div>
            <div style={{ fontSize: 12, color: "#5a5a5a", marginTop: 3 }}>Unlocks at 20 sessions</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

      </div>

      {/* Confirm logout modal */}
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
                Log Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
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
    <div style={{ display: "flex", justifyContent: "space-around", padding: "10px 0 2px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg, flexShrink: 0 }}>
      {tabs.map((t) => { const a = active === t.id; const c = a ? COLORS.gold : COLORS.inactive; return <button key={t.id} onClick={() => onTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 8px" }}>{t.icon(c)}<span style={{ fontSize: 10, color: c, fontWeight: a ? 600 : 400 }}>{t.label}</span></button>; })}
    </div>
  );
}

/* ── MAIN APP ────────────────────────────────────────────────── */

export default function MYGFitness() {
  const [screen, setScreen] = useState("welcome");
  const [activeTab, setActiveTab] = useState("home");
  const [equipPreset, setEquipPreset] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(new Set());

  const goTo = (s) => setScreen(s);

  const progressScreens = ["goals", "level", "aboutyou", "days", "equipment", "account", "name"];
  const pIdx = progressScreens.indexOf(screen);

  // In-app sub-screens that overlay the tab UI (e.g. equipment editor opened
  // from Profile or Exercises). null = normal tab view.
  const [appSubScreen, setAppSubScreen] = useState(null);
  const openEquipmentEditor = () => setAppSubScreen("equipment_editor");
  const closeEquipmentEditor = () => setAppSubScreen(null);

  // ── Active workout lifted to App ──
  // The active workout object survives tab switches because it lives here,
  // not inside WorkoutTab. The SessionBar mounted above the TabBar lets
  // the user re-enter the logger from any tab.
  const [activeWorkout, setActiveWorkout] = useState(null); // null = no session
  const [workoutMinimized, setWorkoutMinimized] = useState(false);
  const [finishedSession, setFinishedSession] = useState(null);
  const [workoutHistory, setWorkoutHistory] = useState(MOCK_WORKOUT_HISTORY);
  const [openHistoryId, setOpenHistoryId] = useState(null);

  const startEmptyWorkout = () => {
    const now = new Date();
    setActiveWorkout({
      exercises: [],
      workoutName: deriveWorkoutName([], now),
      startTime: now,
      restTimerMode: "countup",
      restTimer: null,
      nameWasEdited: false,
    });
    setWorkoutMinimized(false);
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

  // Logout: reset all session-relevant state and return to welcome.
  // We do not currently clear `selectedEquipment` because the user might
  // log back in as the same person (this is a prototype, not a real auth flow).
  // In production this would also clear auth tokens, etc.
  const handleLogout = () => {
    setActiveWorkout(null);
    setWorkoutMinimized(false);
    setFinishedSession(null);
    setOpenHistoryId(null);
    setActiveTab("home");
    setAppSubScreen(null);
    setScreen("welcome");
  };

  const renderTab = () => {
    switch (activeTab) {
      case "home": return <HomeTab onTabChange={setActiveTab} />;
      case "workout": return (
        <WorkoutTab
          userEquipment={selectedEquipment}
          workout={activeWorkout}
          minimized={workoutMinimized}
          history={workoutHistory}
          openHistoryId={openHistoryId}
          setOpenHistoryId={setOpenHistoryId}
          finishedSession={finishedSession}
          onStartEmpty={startEmptyWorkout}
          onUpdateWorkout={updateActiveWorkout}
          onMinimize={minimizeWorkout}
          onCancel={cancelActiveWorkout}
          onFinish={finishActiveWorkout}
          onCommitFinished={commitFinishedSession}
          onDiscardFinished={discardFinishedSession}
        />
      );
      case "coach": return <CoachTab />;
      case "exercises": return <ExercisesTab userEquipment={selectedEquipment} onOpenEquipmentEditor={openEquipmentEditor} />;
      case "profile": return <ProfileTab onOpenEquipmentEditor={openEquipmentEditor} equipmentCount={selectedEquipment.size} onLogout={handleLogout} />;
      default: return <HomeTab onTabChange={setActiveTab} />;
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
    // SessionBar is shown whenever an active workout exists AND
    //   - the user is not on the workout tab, OR
    //   - the workout is minimized
    // It sits between the tab content and the TabBar.
    const showSessionBar = activeWorkout && (activeTab !== "workout" || workoutMinimized);
    return (
      <>
        {renderTab()}
        {showSessionBar && <SessionBar workout={activeWorkout} onTap={expandWorkoutFromBar} />}
        <TabBar active={activeTab} onTab={setActiveTab} />
      </>
    );
  };

  const renderScreen = () => {
    switch (screen) {
      case "welcome":
        return <WelcomeScreen onGetStarted={() => goTo("goals")} onSignIn={() => goTo("signin")} />;
      case "signin":
        return <SignInScreen onBack={() => goTo("welcome")} onSignIn={() => goTo("app")} />;
      case "goals":
        return <GoalsScreen onNext={() => goTo("level")} onBack={() => goTo("welcome")} onSkip={() => goTo("level")} />;
      case "level":
        return <FitnessLevelScreen onNext={() => goTo("aboutyou")} onBack={() => goTo("goals")} onSkip={() => goTo("aboutyou")} />;
      case "aboutyou":
        return <AboutYouScreen onNext={() => goTo("days")} onBack={() => goTo("level")} onSkip={() => goTo("days")} />;
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
        return <NameScreen onNext={() => goTo("complete")} onBack={() => goTo("account")} />;
      case "complete":
        return <CompletionScreen onEnter={() => goTo("app")} />;
      case "app":
        return renderAppContent();
      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", padding: "40px 20px" }}>
      <style>{`
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #FFD700; cursor: pointer; border: 3px solid #111111; box-shadow: 0 0 8px rgba(255,215,0,0.4); }
        input[type="range"]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #FFD700; cursor: pointer; border: 3px solid #111111; box-shadow: 0 0 8px rgba(255,215,0,0.4); }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
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
