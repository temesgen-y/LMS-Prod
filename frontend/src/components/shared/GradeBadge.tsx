import { getGradeColor } from '@/utils/gradeCalculator';

interface GradeBadgeProps {
  grade : string | null | undefined;
  size? : 'sm' | 'md' | 'lg';
}

export const GradeBadge = ({ grade, size = 'md' }: GradeBadgeProps) => {
  if (!grade) {
    return <span className="text-gray-400 text-sm italic">Pending</span>;
  }

  const sizes = {
    sm : 'px-1.5 py-0.5 text-xs',
    md : 'px-2.5 py-1   text-sm font-semibold',
    lg : 'px-3   py-1.5 text-base font-bold',
  };

  return (
    <span className={`
      inline-flex items-center justify-center
      rounded border font-semibold
      ${sizes[size]}
      ${getGradeColor(grade)}
    `}>
      {grade}
    </span>
  );
};
