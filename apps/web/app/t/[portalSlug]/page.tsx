import {
  ArrowRight,
  Bell,
  Check,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Route,
  Search,
  ShieldCheck,
  Ship,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { PortalLoginDialog } from '@/components/portal-login-dialog';
import { TenantMark } from '@/components/tenant-mark';
import { brandColorStyle, getPortalBranding, portalServiceLabels } from '@/lib/portal-branding';

export default async function TenantLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ portalSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { portalSlug } = await params;
  const query = await searchParams;
  const branding = await getPortalBranding(portalSlug);
  if (!branding) return <PortalUnavailable />;
  const loginHref = `/t/${branding.portalSlug}?login=1`;
  const rateHref = `${loginHref}&next=${encodeURIComponent('/portal/rates')}`;
  const contacts = [
    branding.contact.phone && { icon: Phone, label: '电话', value: branding.contact.phone },
    branding.contact.email && { icon: Mail, label: '邮箱', value: branding.contact.email },
    branding.contact.address && { icon: MapPin, label: '地址', value: branding.contact.address },
    branding.contact.wechat && {
      icon: MessageCircle,
      label: '微信',
      value: branding.contact.wechat,
    },
    branding.contact.whatsapp && {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: branding.contact.whatsapp,
    },
  ].filter(Boolean) as Array<{ icon: typeof Phone; label: string; value: string }>;

  return (
    <main className="min-h-screen bg-white" style={brandColorStyle(branding.primaryBrandColor)}>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
          <TenantMark companyName={branding.companyName} logoUrl={branding.logoUrl} />
          <nav
            className="hidden items-center gap-7 text-sm text-slate-600 md:flex"
            aria-label="主要导航"
          >
            <a href="#home">首页</a>
            <a href="#services">服务</a>
            <a href="#workspace">客户中心</a>
            <a href="#contact">联系我们</a>
          </nav>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded border border-[var(--portal-brand,#087E8B)] px-4 text-sm font-semibold text-[var(--portal-brand,#087E8B)]"
            href={loginHref}
          >
            <UserRound aria-hidden className="size-4" />
            客户登录
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-slate-950 text-white" id="home">
        <div className="absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(circle_at_center,var(--portal-brand,#087E8B),transparent_68%)] opacity-30" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">
              International Freight Services
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {branding.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/70 sm:text-lg">
              {branding.heroSubtitle}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded bg-[var(--portal-brand,#087E8B)] px-6 font-semibold text-white"
                href={rateHref}
              >
                查询运价
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded border border-white/25 px-6 font-semibold text-white hover:bg-white/5"
                href={loginHref}
              >
                登录客户中心
              </Link>
            </div>
          </div>
          <div className="hidden items-center justify-center lg:flex">
            <div className="grid size-64 place-items-center rounded-full border border-white/10 bg-white/5">
              <Ship aria-hidden className="size-28 text-white/80" strokeWidth={1.2} />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:px-8">
          {[
            { value: '透明', label: '报价与费用清晰可查' },
            { value: '及时', label: '关键业务节点在线同步' },
            { value: '专属', label: '企业账号与客户数据隔离' },
          ].map((item) => (
            <div className="py-7 text-center" key={item.value}>
              <div className="text-xl font-semibold text-slate-950">{item.value}</div>
              <div className="mt-1 text-sm text-slate-500">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20" id="services">
        <p className="text-sm font-semibold text-[var(--portal-brand,#087E8B)]">我们的服务</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          从起运地到目的地的可靠协同
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branding.serviceTags.map((tag) => (
            <div
              className="flex min-h-20 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-5"
              key={tag}
            >
              <span className="grid size-8 place-items-center rounded-full bg-[var(--portal-brand,#087E8B)]/10 text-[var(--portal-brand,#087E8B)]">
                <Check aria-hidden className="size-4" />
              </span>
              <span className="font-medium text-slate-800">{portalServiceLabels[tag] ?? tag}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 text-white" id="workspace">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-20">
          <div className="max-w-lg">
            <p className="text-sm font-semibold text-[var(--portal-brand,#36B8C5)]">在线客户中心</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              一处掌握每票业务的关键进展
            </h2>
            <p className="mt-5 text-base leading-7 text-white/65">
              从查价到出运，将分散在邮件和聊天记录里的重要信息集中到安全、清晰的企业工作台。
            </p>
            <Link
              className="mt-8 inline-flex h-11 items-center gap-2 rounded bg-[var(--portal-brand,#087E8B)] px-5 text-sm font-semibold text-white"
              href={loginHref}
            >
              进入客户中心
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workspaceCapabilities.map(({ icon: Icon, title, description }) => (
              <article
                className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
                key={title}
              >
                <div className="grid size-10 place-items-center rounded-lg bg-white/10 text-white">
                  <Icon aria-hidden className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[var(--portal-brand,#087E8B)]">合作流程</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            从需求到出运，每一步都有明确衔接
          </h2>
        </div>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {customerJourney.map((item, index) => (
            <li className="relative border-t-2 border-slate-200 pt-6" key={item.title}>
              <span className="absolute -top-4 left-0 grid size-8 place-items-center rounded-full bg-[var(--portal-brand,#087E8B)] text-xs font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-[var(--portal-brand,#087E8B)]/5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center lg:px-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              已有企业客户账号？
            </h2>
            <p className="mt-2 text-sm text-slate-600">登录查看专属运价、报价、订舱和出运状态。</p>
          </div>
          <Link
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded bg-[var(--portal-brand,#087E8B)] px-5 text-sm font-semibold text-white"
            href={loginHref}
          >
            立即登录
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50" id="contact">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold text-[var(--portal-brand,#087E8B)]">联系我们</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              需要物流方案？欢迎联系
            </h2>
          </div>
          {contacts.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {contacts.map(({ icon: Icon, label, value }) => (
                <div className="flex gap-3" key={`${label}-${value}`}>
                  <Icon aria-hidden className="mt-0.5 size-5 text-[var(--portal-brand,#087E8B)]" />
                  <div>
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">请登录客户中心与您的服务团队联系。</p>
          )}
        </div>
      </section>
      <footer className="bg-slate-950 px-5 py-6 text-center text-xs text-white/55">
        © {new Date().getFullYear()} {branding.companyName}
      </footer>
      {query.login === '1' ? (
        <PortalLoginDialog
          branding={branding}
          nextPath={typeof query.next === 'string' ? query.next : undefined}
        />
      ) : null}
    </main>
  );
}

const workspaceCapabilities = [
  {
    icon: Search,
    title: '在线查询运价',
    description: '按航线、船期和箱型查询适用于您公司的销售价格。',
  },
  {
    icon: FileText,
    title: '报价集中管理',
    description: '查看正式报价、有效期和费用明细，并在线确认。',
  },
  {
    icon: PackageCheck,
    title: '订舱协同',
    description: '从已接受报价创建订舱，补充资料并跟进审核状态。',
  },
  { icon: Route, title: '出运进度', description: '查看船名航次、ETD、ETA 和关键运输节点。' },
  { icon: Bell, title: '关键通知', description: '报价、订舱与出运的重要变化及时提醒。' },
  {
    icon: ShieldCheck,
    title: '安全隔离',
    description: '企业账号、角色权限与租户数据范围全程受控。',
  },
] as const;

const customerJourney = [
  { title: '提交需求', description: '查询适用运价，选择航线、船期和所需服务。' },
  { title: '确认报价', description: '在线查看正式报价与费用明细，确认后进入订舱。' },
  { title: '协同订舱', description: '补充货物与联系人信息，跟进订舱审核和 SO。' },
  { title: '跟进出运', description: '集中查看船期变化、关键节点和业务文件。' },
] as const;

function PortalUnavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">客户门户暂不可用</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          请检查访问地址，或联系您的货代服务团队获取正确入口。
        </p>
      </div>
    </main>
  );
}
