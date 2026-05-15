import { redirect } from 'next/navigation';
import { ymd, shiftYmd } from '@/lib/time';

export default function RecapIndex() {
  redirect(`/recap/${shiftYmd(ymd(), -1)}`);
}
