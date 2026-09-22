/**
 * Demo seed data — the former INITIAL_ITEMS from LandingPage.tsx, expressed as
 * database rows. Fixed UUIDs make seeding idempotent: re-running never creates
 * duplicates (Supabase: existing ids are skipped; dev store: same check).
 *
 * reporter_id is NULL on purpose: demo items belong to no real user, so their
 * private verification questions are effectively server-only data.
 */

const minsAgoIso = (mins: number): string =>
  new Date(Date.now() - mins * 60_000).toISOString();

/** Deterministic question UUID derived from its item's UUID. */
const Q = (itemUuid: string, n: number): string =>
  `${itemUuid.slice(0, 24)}${n}${itemUuid.slice(25)}`;

const IT = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CP = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEMO_SEED_VERSION = 1;

export interface SeedQuestion {
  id: string;
  question: string;
  question_type: 'text' | 'multiple_choice' | 'yes_no';
  options: string[] | null;
  correct_answer: string;
  weight: number;
  required: boolean;
  is_private: boolean;
}

export interface SeedItemRow {
  id: string;
  reporter_id: string | null;
  type: 'lost' | 'found';
  title: string;
  category: string;
  description: string;
  item_date_time: string;
  time_precision: 'exact' | 'approximate' | 'unknown';
  location: string;
  distinguishing_features: string;
  status: 'active' | 'matched' | 'verification_pending' | 'verified' | 'returned' | 'closed';
  reward: string | null;
  created_at: string;
  updated_at: string;
}

export const DEMO_SEED: { item: SeedItemRow; questions: SeedQuestion[] }[] = [
  // --- Item 1: Wallet (found, matched) + counterpart (lost) -----------------
  {
    item: {
      id: IT(1),
      reporter_id: null,
      type: 'found',
      title: 'Vintage Tan Leather Bifold Wallet',
      category: 'Wallet / Money',
      description:
        'Brown leather with subtle stitching wear. Contains metro card and library pass (initials D.M.).',
      item_date_time: minsAgoIso(34),
      time_precision: 'approximate',
      location: 'Central Library, 2nd Floor Reading Room',
      distinguishing_features: '',
      status: 'matched',
      reward: null,
      created_at: minsAgoIso(24),
      updated_at: minsAgoIso(24),
    },
    questions: [
      {
        id: Q(IT(1), 1),
        question: 'What specific cards or IDs were inside the wallet?',
        question_type: 'text',
        options: null,
        correct_answer: 'Metro card with initials D.M. and city library card',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(1), 2),
        question: 'What color is the interior lining fabric?',
        question_type: 'multiple_choice',
        options: ['Dark green fabric', 'Classic tan leather', 'Navy blue nylon', 'Red plaid'],
        correct_answer: 'Dark green fabric',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(1), 3),
        question: 'Does the wallet have an exterior zippered coin pocket?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'No',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(1), 4),
        question: 'What initials or name are visible inside or embossed?',
        question_type: 'text',
        options: null,
        correct_answer: 'D.M.',
        weight: 2,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(1),
      reporter_id: null,
      type: 'lost',
      title: 'Lost Tan Leather Wallet with D.M. Initials',
      category: 'Wallet / Money',
      description: 'Lost brown leather bifold wallet with transit pass and receipt inside.',
      item_date_time: minsAgoIso(70),
      time_precision: 'approximate',
      location: 'Central Library Study Area, 2nd Floor',
      distinguishing_features: '',
      status: 'matched',
      reward: null,
      created_at: minsAgoIso(60),
      updated_at: minsAgoIso(60),
    },
    questions: [
      {
        id: Q(CP(1), 1),
        question: 'What specific cards or IDs were inside the wallet?',
        question_type: 'text',
        options: null,
        correct_answer: 'Metro card with initials D.M. and city library card',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(CP(1), 2),
        question: 'What color is the interior lining fabric?',
        question_type: 'multiple_choice',
        options: ['Dark green fabric', 'Classic tan leather', 'Navy blue nylon', 'Red plaid'],
        correct_answer: 'Dark green fabric',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(CP(1), 3),
        question: 'Does the wallet have an exterior zippered coin pocket?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'No',
        weight: 1,
        required: true,
        is_private: true,
      },
    ],
  },

  // --- Item 2: Keys (lost, active) + counterpart (found) --------------------
  {
    item: {
      id: IT(2),
      reporter_id: null,
      type: 'lost',
      title: 'Brass Ring with 4 Keys & Green Enamel Tag',
      category: 'Keys',
      description: 'Two Yale cylinder keys, one bike u-lock key, and a circular green clover tag.',
      item_date_time: minsAgoIso(70),
      time_precision: 'approximate',
      location: 'Metropolitan Metro Line (Line 4 southbound)',
      distinguishing_features: '',
      status: 'active',
      reward: '$25 reward',
      created_at: minsAgoIso(60),
      updated_at: minsAgoIso(60),
    },
    questions: [
      {
        id: Q(IT(2), 1),
        question: 'What shape or charm is on the green enamel tag?',
        question_type: 'multiple_choice',
        options: ['Four-leaf clover', 'Oval monogram', 'Geometric rectangle', 'Mini heart'],
        correct_answer: 'Four-leaf clover',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(2), 2),
        question: 'How many total keys are on the ring?',
        question_type: 'multiple_choice',
        options: ['2–3 keys', '4–5 keys', '6–8 keys', 'Over 8 keys'],
        correct_answer: '4–5 keys',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(2), 3),
        question: 'Is there a bike U-lock key on the ring?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'Yes',
        weight: 1,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(2),
      reporter_id: null,
      type: 'found',
      title: 'Keyring with Brass Keys & Clover Charm',
      category: 'Keys',
      description: 'Found brass keys attached to a green enamel pendant.',
      item_date_time: minsAgoIso(55),
      time_precision: 'approximate',
      location: 'Metro Station Turnstile Box #2',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(45),
      updated_at: minsAgoIso(45),
    },
    questions: [],
  },

  // --- Item 3: Glasses (found, active) + counterpart (lost) -----------------
  {
    item: {
      id: IT(3),
      reporter_id: null,
      type: 'found',
      title: 'Tortoiseshell Acetate Reading Glasses',
      category: 'Glasses',
      description:
        'Oliver Peoples frame in amber/dark tortoise with black felt magnetic protective slip.',
      item_date_time: minsAgoIso(130),
      time_precision: 'approximate',
      location: 'Bean & Leaf Coffee Shop, Table 6',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(120),
      updated_at: minsAgoIso(120),
    },
    questions: [
      {
        id: Q(IT(3), 1),
        question: 'What brand or model code is printed on the inner temple arm?',
        question_type: 'text',
        options: null,
        correct_answer: 'Oliver Peoples 5032',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(3), 2),
        question: 'What prescription type or lens tint is used?',
        question_type: 'multiple_choice',
        options: [
          'Clear blue-light prescription',
          'Progressive bifocals',
          'Dark polarized tint',
          'Green tint sunglasses',
        ],
        correct_answer: 'Clear blue-light prescription',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(3), 3),
        question: 'Is there a minor scratch on the lower right lens?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'Yes',
        weight: 1,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(3),
      reporter_id: null,
      type: 'lost',
      title: 'Lost Designer Tortoise Reading Glasses',
      category: 'Glasses',
      description: 'Prescription reading glasses in tortoise casing.',
      item_date_time: minsAgoIso(190),
      time_precision: 'approximate',
      location: 'Bean & Leaf Coffee or nearby park bench',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(180),
      updated_at: minsAgoIso(180),
    },
    questions: [],
  },

  // --- Item 4: Backpack (lost, matched) + counterpart (found) ---------------
  {
    item: {
      id: IT(4),
      reporter_id: null,
      type: 'lost',
      title: 'Midnight Navy Commuter Backpack (22L)',
      category: 'Bags / Backpacks',
      description:
        'Water-resistant nylon with silver buckle. Inside notebook and audio headphones case.',
      item_date_time: minsAgoIso(190),
      time_precision: 'approximate',
      location: 'Union Square Park, near North Pavilion',
      distinguishing_features: '',
      status: 'matched',
      reward: null,
      created_at: minsAgoIso(180),
      updated_at: minsAgoIso(180),
    },
    questions: [
      {
        id: Q(IT(4), 1),
        question: 'What specific item was stored in the front zippered pouch?',
        question_type: 'text',
        options: null,
        correct_answer: 'Spiral dot notebook and audio headphones case',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(4), 2),
        question: 'What color is the inner fabric lining?',
        question_type: 'multiple_choice',
        options: ['Bright safety orange', 'Charcoal grey', 'Black nylon', 'Olive green'],
        correct_answer: 'Bright safety orange',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(4), 3),
        question: 'Was any keychain or carabiner attached to the bag?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'Yes',
        weight: 1,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(4),
      reporter_id: null,
      type: 'found',
      title: 'Navy Blue Canvas Daypack Found at Park Bench',
      category: 'Bags / Backpacks',
      description: 'Found navy backpack with side water bottle sleeve.',
      item_date_time: minsAgoIso(160),
      time_precision: 'approximate',
      location: 'Union Square Park Station Entrance',
      distinguishing_features: '',
      status: 'matched',
      reward: null,
      created_at: minsAgoIso(150),
      updated_at: minsAgoIso(150),
    },
    questions: [],
  },

  // --- Item 5: AirPods (found, active) + counterpart (lost) -----------------
  {
    item: {
      id: IT(5),
      reporter_id: null,
      type: 'found',
      title: 'Silver Apple AirPods Pro (2nd Gen)',
      category: 'Phone / Tablet',
      description: 'White charging case with small engraved mountain icon on reverse side.',
      item_date_time: minsAgoIso(250),
      time_precision: 'approximate',
      location: 'Riverside Park Bike Path Bench #14',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(240),
      updated_at: minsAgoIso(240),
    },
    questions: [
      {
        id: Q(IT(5), 1),
        question: 'What custom text or icon is engraved on the case/device?',
        question_type: 'text',
        options: null,
        correct_answer: 'Small mountain logo engraving',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(5), 2),
        question: 'What color or style case was on the device?',
        question_type: 'multiple_choice',
        options: ['Clear silicone case', 'Matte black shockproof', 'Tan leather folio', 'No case'],
        correct_answer: 'Clear silicone case',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(5), 3),
        question: 'Is there a small crack or scratch on the camera lens or bezel?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'Yes',
        weight: 1,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(5),
      reporter_id: null,
      type: 'lost',
      title: 'Lost AirPods Pro with Custom Engraved Case',
      category: 'Phone / Tablet',
      description: 'Lost wireless earbuds inside white case.',
      item_date_time: minsAgoIso(310),
      time_precision: 'approximate',
      location: 'Riverside Park jog path',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(300),
      updated_at: minsAgoIso(300),
    },
    questions: [],
  },

  // --- Item 6: Cat (lost, active) + counterpart (found) ---------------------
  {
    item: {
      id: IT(6),
      reporter_id: null,
      type: 'lost',
      title: 'Small Orange Tabby Cat (Named Milo)',
      category: 'Pets / Animals',
      description:
        'Friendly 2-year old male tabby with white paws and light brown leather collar with bell.',
      item_date_time: minsAgoIso(310),
      time_precision: 'approximate',
      location: 'Oakwood District, 5th Avenue & Elm',
      distinguishing_features: '',
      status: 'active',
      reward: '$150 reward',
      created_at: minsAgoIso(300),
      updated_at: minsAgoIso(300),
    },
    questions: [
      {
        id: Q(IT(6), 1),
        question: 'What exact name and phone number are on the collar tag?',
        question_type: 'text',
        options: null,
        correct_answer: 'Milo - 555-0192',
        weight: 2,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(6), 2),
        question: 'What color and pattern is the collar or harness?',
        question_type: 'text',
        options: null,
        correct_answer: 'Light brown leather with bell',
        weight: 1,
        required: true,
        is_private: true,
      },
      {
        id: Q(IT(6), 3),
        question: 'Does the pet have a microchip registered?',
        question_type: 'yes_no',
        options: null,
        correct_answer: 'Yes',
        weight: 2,
        required: true,
        is_private: true,
      },
    ],
  },
  {
    item: {
      id: CP(6),
      reporter_id: null,
      type: 'found',
      title: 'Found Friendly Tabby Cat with Leather Collar',
      category: 'Pets / Animals',
      description: 'Safe on garden porch, orange striped coat with white paws.',
      item_date_time: minsAgoIso(280),
      time_precision: 'approximate',
      location: 'Oakwood Community Garden porch',
      distinguishing_features: '',
      status: 'active',
      reward: null,
      created_at: minsAgoIso(270),
      updated_at: minsAgoIso(270),
    },
    questions: [],
  },
];

/**
 * Demo pairings (lost item id → found item id) that existed implicitly in the
 * mock data via the `counterpart` object. Exported so the data layer can
 * recreate them as matches rows when needed by later phases.
 */
export const DEMO_PAIRS: { lost_item_id: string; found_item_id: string }[] = [
  { lost_item_id: CP(1), found_item_id: IT(1) },
  { lost_item_id: IT(2), found_item_id: CP(2) },
  { lost_item_id: CP(3), found_item_id: IT(3) },
  { lost_item_id: IT(4), found_item_id: CP(4) },
  { lost_item_id: CP(5), found_item_id: IT(5) },
  { lost_item_id: IT(6), found_item_id: CP(6) },
];
