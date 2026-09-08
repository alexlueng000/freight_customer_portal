import { redirect } from 'next/navigation';

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ portalSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { portalSlug } = await params;
  const query = await searchParams;
  const target = new URLSearchParams({ login: '1' });
  if (typeof query.next === 'string') target.set('next', query.next);
  redirect(`/t/${portalSlug}?${target.toString()}`);
}
