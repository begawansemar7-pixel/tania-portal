import { Hero } from '@/components/home/hero';
import { QuickAccess } from '@/components/home/quick-access';
import { getIdentityProvider } from '@/lib/tania/container';

export default async function HomePage() {
  const actor = await getIdentityProvider().getActor();

  return (
    <>
      <Hero userName={actor?.name ?? 'there'} />
      <QuickAccess />
    </>
  );
}
