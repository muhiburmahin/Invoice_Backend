import { addMonths, format, startOfMonth, subMonths } from "date-fns";

export type MonthBucket = {
  label: string;
  key: string;
  start: Date;
  end: Date;
};

export function getMonthBuckets(count: number, referenceDate = new Date()): MonthBucket[] {
  return Array.from({ length: count }, (_, i) => {
    const monthsAgo = count - 1 - i;
    const start = startOfMonth(subMonths(referenceDate, monthsAgo));
    const end =
      monthsAgo === 0
        ? addMonths(start, 1)
        : startOfMonth(subMonths(referenceDate, monthsAgo - 1));
    return {
      label: format(start, "MMM"),
      key: format(start, "yyyy-MM"),
      start,
      end,
    };
  });
}
