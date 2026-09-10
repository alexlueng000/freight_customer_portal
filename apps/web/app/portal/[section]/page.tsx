import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

const sections: Record<string, { title: string; description: string }> = {
  company: { title: '公司资料', description: '公司资料由货代维护。如需修改公司名称、地址或联系人，请联系您的销售。客户账号可由有权限的公司管理员在用户页面管理。' },
  documents: { title: '单证', description: '已发布 SO 和附件请在对应订舱详情查看。' },
};

export default async function PortalSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section];
  if (!content) notFound();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="客户门户" title={content.title} />
      <EmptyState title="请联系货代维护资料" description={content.description} />
    </div>
  );
}
