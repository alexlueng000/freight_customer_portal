import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

const sections: Record<string, { title: string; description: string }> = {
  'audit-logs': { title: '审计日志', description: '系统持续记录关键业务操作。当前版本暂未开放审计检索页面，如需核查请联系平台管理员。' },
  settings: { title: '设置', description: '当前版本暂未开放自助设置。公司品牌和账号配置变更请联系平台管理员。' },
  documents: { title: '单证', description: '已发布 SO 和附件请在对应订舱详情查看。' },
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section];
  if (!content) notFound();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="运营后台" title={content.title} />
      <EmptyState title="此页面暂未开放" description={content.description} />
    </div>
  );
}
