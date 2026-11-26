/* ============================================================
   Paper presets: real DSE paper lengths, searchable in Focus
   ============================================================

   Durations follow the HKEAA assessment frameworks for the papers each
   subject actually has today. Only papers whose published length is stable
   are listed; anything else is left to the custom-minutes field rather than
   guessing a number.
   ============================================================ */

export const PAPER_PRESETS = [
  { code: 'CHIN', subject: 'Chinese', paper: 'P1', name: 'Reading', minutes: 90, aliases: ['chin', 'chi', '中文'] },
  { code: 'CHIN', subject: 'Chinese', paper: 'P2', name: 'Writing', minutes: 135, aliases: ['chin', 'chi', '中文'] },
  { code: 'ENG', subject: 'English', paper: 'P1', name: 'Reading', minutes: 60, aliases: ['eng', 'english lang'] },
  { code: 'ENG', subject: 'English', paper: 'P2', name: 'Writing', minutes: 120, aliases: ['eng'] },
  { code: 'ENG', subject: 'English', paper: 'P3', name: 'Listening & Integrated Skills', minutes: 120, aliases: ['eng', 'listening', 'integrated'] },
  { code: 'ENG', subject: 'English', paper: 'P4', name: 'Speaking', minutes: 25, aliases: ['eng', 'oral'] },
  { code: 'MATH', subject: 'Mathematics', paper: 'P1', name: 'Conventional', minutes: 135, aliases: ['maths', 'math', '數學'] },
  { code: 'MATH', subject: 'Mathematics', paper: 'P2', name: 'Multiple choice', minutes: 75, aliases: ['maths', 'math', 'mc', '數學'] },
  { code: 'M1', subject: 'M1', paper: 'P1', name: 'Calculus & Statistics', minutes: 150, aliases: ['maths', 'math'] },
  { code: 'M2', subject: 'M2', paper: 'P1', name: 'Algebra & Calculus', minutes: 150, aliases: ['maths', 'math'] },
  { code: 'CSD', subject: 'CSD', paper: 'P1', name: 'Data-based questions', minutes: 120, aliases: ['公民', 'citizenship', 'ls'] },
  { code: 'BIOL', subject: 'Biology', paper: 'P1', name: 'Structured & essay', minutes: 150, aliases: ['bio', '生物'] },
  { code: 'BIOL', subject: 'Biology', paper: 'P2', name: 'Elective', minutes: 60, aliases: ['bio', '生物'] },
  { code: 'CHEM', subject: 'Chemistry', paper: 'P1', name: 'Structured & essay', minutes: 150, aliases: ['chem', '化學'] },
  { code: 'CHEM', subject: 'Chemistry', paper: 'P2', name: 'Elective', minutes: 60, aliases: ['chem', '化學'] },
  { code: 'PHYS', subject: 'Physics', paper: 'P1', name: 'Structured & essay', minutes: 150, aliases: ['phys', '物理'] },
  { code: 'PHYS', subject: 'Physics', paper: 'P2', name: 'Elective', minutes: 60, aliases: ['phys', '物理'] }
];

/** Short label used on the logged study block, e.g. "Chinese P1 Reading". */
export const presetLabel = (preset) => `${preset.subject} ${preset.paper} ${preset.name}`;

/** Search across subject, paper, name, aliases and length. */
export function searchPresets(query, presets = PAPER_PRESETS) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return presets;
  const terms = q.split(/\s+/);
  return presets.filter((p) => {
    const aliases = (p.aliases || []).join(' ');
    const haystack = `${p.subject} ${p.code} ${p.paper} ${p.name} ${aliases} ${p.minutes} min ${p.minutes}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
