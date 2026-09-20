import { QuoteRequestPage } from '@/components/quote-request-page';

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return <QuoteRequestPage rateId={id}
    containerType={typeof query.containerType === 'string' ? query.containerType : ''}
    etdFrom={typeof query.etdFrom === 'string' ? query.etdFrom : undefined}
    etdTo={typeof query.etdTo === 'string' ? query.etdTo : undefined} />;
}
