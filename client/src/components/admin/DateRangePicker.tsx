import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';

export type RangePeriod = '7d' | '30d' | '90d' | '6m' | '12m' | 'mtd' | 'ytd';

const OPTIONS: { value: RangePeriod; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
];

export function DateRangePicker({ value, onChange }: { value: RangePeriod; onChange: (value: RangePeriod) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RangePeriod)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
