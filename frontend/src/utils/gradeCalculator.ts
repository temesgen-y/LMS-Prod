// ─────────────────────────────────────────────────────────────────────────────
// getLetterGrade
// converts a percentage score (0–100) to a letter grade
// ─────────────────────────────────────────────────────────────────────────────
export const getLetterGrade = (scorePct: number): string => {
  if (scorePct >= 90) return 'A';
  if (scorePct >= 85) return 'A-';
  if (scorePct >= 80) return 'B+';
  if (scorePct >= 75) return 'B';
  if (scorePct >= 70) return 'B-';
  if (scorePct >= 65) return 'C+';
  if (scorePct >= 60) return 'C';
  if (scorePct >= 55) return 'C-';
  if (scorePct >= 45) return 'D';
  return 'F';
};

// ─────────────────────────────────────────────────────────────────────────────
// getGradeColor
// returns Tailwind color classes for a grade badge
// ─────────────────────────────────────────────────────────────────────────────
export const getGradeColor = (grade: string | null | undefined): string => {
  switch (grade) {
    case 'A' : return 'bg-green-100 text-green-800 border-green-200';
    case 'A-': return 'bg-green-100 text-green-700 border-green-200';
    case 'B+': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'B' : return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'B-': return 'bg-blue-100 text-blue-600 border-blue-200';
    case 'C+': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'C' : return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'C-': return 'bg-yellow-100 text-yellow-600 border-yellow-200';
    case 'D' : return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'F' : return 'bg-red-100 text-red-700 border-red-200';
    default  : return 'bg-gray-100 text-gray-500 border-gray-200';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getGpaPoints — converts a letter grade to a 4.0-scale GPA point value
// ─────────────────────────────────────────────────────────────────────────────
export const getGpaPoints = (grade: string): number => {
  const scale: Record<string, number> = {
    'A': 4.00, 'A-': 3.75,
    'B+': 3.50, 'B': 3.00, 'B-': 2.75,
    'C+': 2.50, 'C': 2.00, 'C-': 1.75,
    'D': 1.00, 'F': 0.00,
  };
  return scale[grade] ?? 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// calculateGpa — weighted GPA across courses using credit hours
// ─────────────────────────────────────────────────────────────────────────────
export const calculateGpa = (
  courses: { letter: string; credits: number }[]
): number => {
  const completed = courses.filter(c => c.letter != null && c.letter !== '');
  if (completed.length === 0) return 0;
  const totalPoints  = completed.reduce((sum, c) => sum + getGpaPoints(c.letter) * c.credits, 0);
  const totalCredits = completed.reduce((sum, c) => sum + c.credits, 0);
  return totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// validateCourseTotalMarks
// all items in a course must sum to exactly 100
// returns status of the current total
// ─────────────────────────────────────────────────────────────────────────────
export const validateCourseTotalMarks = (
  items: { total_marks: number }[]
): {
  currentTotal : number;
  remaining    : number;
  isValid      : boolean;
  isOver       : boolean;
} => {
  const currentTotal = items.reduce((sum, i) => sum + (i.total_marks ?? 0), 0);
  return {
    currentTotal,
    remaining : 100 - currentTotal,
    isValid   : currentTotal === 100,
    isOver    : currentTotal > 100,
  };
};
