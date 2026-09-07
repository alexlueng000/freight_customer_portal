# Customer Portal 品牌化入口优化需求

> 状态：试点方案已收敛
> 修订日期：2026-09-08
> 当前交付条件：自有服务器 IP 访问，暂无正式域名
> 试点决策：使用 `/t/{portalSlug}` 识别 Tenant，登录后保留现有 `/portal/*` 业务路由

## 1. 背景

当前 Customer Portal 登录页仍然呈现为典型 SaaS 后台登录界面：

- 左侧展示 `Freight Customer Portal`
- 使用统一产品品牌
- 客户需要填写 `租户代码`
- 页面整体更像“第三方 SaaS 系统入口”
- 缺少货代公司自身品牌、服务信息和官网感

这会导致客户第一感知变成：

> “我正在登录一个第三方系统。”

而不是：

> “我正在进入这家货代公司的客户服务平台。”

本轮需要把 Customer Portal 从：

**Generic SaaS Login**

优化成：

**White-label Freight Forwarder Customer Portal**

核心目标：

> 客户侧品牌化，内部 Operation 端继续保持标准 SaaS 后台形态。

---

# 2. 本轮目标

本轮只优化 Customer Portal 的：

1. Public Landing Page
2. Login Entry
3. Tenant Branding
4. Tenant Identification
5. 登录后的品牌一致性

不要扩大到完整企业官网 CMS。

不要新增：

- 新闻系统
- 博客系统
- 页面编辑器
- SEO CMS
- 自定义页面构建器
- 多层官网导航系统

V1 只做固定结构 + 可配置品牌信息。

---

# 3. 新的客户侧结构

Customer Portal 建议拆成两层：

```text
Tenant Public Landing
↓
Customer Login
↓
Customer Workspace
```

V1 试点不提供客户自助注册。客户账号继续由租户内部用户创建和管理，避免引入邀请、邮箱验证、客户公司归属和开户审批等新流程。

而 Operation 端继续保持：

```text
Admin / Operation SaaS Backend
```

两者视觉和身份感知不应该完全一样。

---

# 4. Public Landing Page

新增租户级公开入口页。

示例：

```text
Northstar Freight

首页
在线运价
客户中心
联系我们

--------------------------------

让国际物流更简单

在线查询海运价格
快速获取正式报价
跟踪订舱与出运进度

[查询运价]
[登录客户中心]

--------------------------------

我们的服务

海运 FCL
起运地拖车
出口报关
目的港清关
目的地派送

--------------------------------

联系我们

Phone
Email
Address
WhatsApp / WeChat
```

目标：

客户第一眼看到的是：

- 货代公司 Logo
- 货代公司名称
- 货代公司服务
- 货代公司联系方式

而不是 SaaS 产品品牌。

---

# 5. Landing Page 固定结构

V1 固定为以下区块：

## Header

包含：

- Tenant Logo
- Tenant Company Name
- Navigation
- Login CTA

导航 V1 可固定：

```text
首页
在线运价
客户中心
联系我们
```

不要做动态菜单编辑器。

---

## Hero

支持租户配置：

```text
heroTitle
heroSubtitle
```

默认示例：

```text
让国际物流更简单

在线查询运价、获取正式报价，
跟踪订舱与出运进度。
```

CTA：

```text
查询运价
登录客户中心
```

---

## Services

展示租户支持的主要服务。

V1 使用固定 Service Tags：

```text
OCEAN_FCL
ORIGIN_PICKUP
EXPORT_CUSTOMS
IMPORT_CUSTOMS
DESTINATION_DELIVERY
```

UI：

```text
海运 FCL
起运地拖车 / 提货
出口报关
目的港清关
目的地派送
```

允许租户选择显示哪些服务。

不要做复杂 Service CMS。

---

## Contact

支持：

```text
phone
email
address
website
wechat
whatsapp
```

没有配置的字段不显示。

---

# 6. 登录页调整

当前登录页问题：

```text
租户代码
邮箱
密码
```

其中：

`租户代码`

不应该暴露给普通客户。

修改为：

```text
邮箱
密码

[登录客户中心]
```

页面继续展示：

- Tenant Logo
- Tenant Company Name

不要展示：

```text
Freight Customer Portal
DEMO
Tenant Code
```

除非处于开发 / Demo 环境。

---

# 7. Tenant 自动识别

## 7.1 当前试点方案

当前系统部署在自有服务器，使用 IP 访问，尚无可用的正式域名。本轮使用 URL Path 中的 `portalSlug` 识别 Tenant：

```text
http(s)://SERVER_IP/t/northstar
http(s)://SERVER_IP/t/northstar/login
```

系统从 `northstar` 解析 Tenant，客户无需查看或手动输入 `tenantCode`。

`portalSlug` 是对外门户标识，不默认等同于内部 `Tenant.code`。建议规则为：

```text
小写字母、数字和连字符
全局唯一
不允许 admin、api、www、portal 等保留值
```

URL 中的 `portalSlug` 只负责识别 Tenant，不代替鉴权。登录和所有业务 API 仍必须使用服务端解析的 `tenantId`、Token 中的 Tenant Context 和 `customerCompanyId` 进行授权。

客户登录请求应提交 `portalSlug + email + password`，由后端将 `portalSlug` 解析为 Tenant 后查找用户。不得只在界面隐藏租户代码，却继续由客户端构造或提交生产 `tenantCode`。后端对“Tenant 不存在”和“账号或密码错误”应返回统一登录失败信息，避免 Tenant 和账号枚举。

## 7.2 未来域名方案

取得正式域名后，可增加：

```text
northstar.portal-domain.com
```

未来再可选支持：

```text
portal.northstarfreight.com
```

路径、子域名和 Custom Domain 应调用同一 Tenant Resolver。本轮不实现子域名、Custom Domain、DNS 自动配置或证书签发。

---

# 8. Localhost / Dev 环境兼容

开发环境仍然需要能够选择 Demo Tenant。

建议通过：

```text
localhost:3000/demo
```

或者：

```text
localhost:3000/?tenant=DEMO
```

进行开发测试。

但：

不要让 Production Customer UI 出现：

```text
租户代码
```

开发环境的 tenant selector 与正式客户登录页分离。

自有服务器的试点环境使用与生产相同的路径规则：

```text
http(s)://SERVER_IP/t/demo
```

如通过公网交付真实客户账号，必须使用 HTTPS。不得为了支持 IP + HTTP 而在生产环境全局降级 Cookie 或会话安全策略。

---

# 9. Tenant Branding 数据模型

检查当前 Tenant / Company Profile 是否已有相关字段。

优先复用。

如缺少，可增加：

```text
portalSlug
brandName
logoObjectKey
primaryBrandColor
heroTitle
heroSubtitle

phone
email
website
address

wechat
whatsapp

serviceTags[]
```

现有 `brandName`、`logoUrl` 和 `customDomain` 字段应优先复用或做兼容迁移。Logo 不应保存会过期的短时签名 URL；应保存对象 Key 或稳定的受控资源地址。

所有新增字段尽量 optional。

历史 tenant 没有配置时：

必须有默认展示。

不要导致历史数据 Migration 后页面报错。

---

# 10. Brand Color

Tenant 可配置一个 Primary Brand Color。

用于：

- Primary CTA
- Link
- Selected Navigation
- Highlight

不要允许租户配置完整 Design System。

不要开放：

```text
20 个颜色
字体
圆角
阴影
Layout
CSS
```

V1 只允许：

```text
Primary Brand Color
Logo
```

保证整体产品仍然一致。

---

# 11. Login Page 视觉方向

目标：

Professional
Trustworthy
Freight Forwarder Website
B2B Customer Portal

不要做成：

- SaaS Admin Login
- ERP Login
- Marketing Template
- Consumer App
- Dribbble Landing Page

页面优先建立：

```text
Company Identity
↓
Service Value
↓
Login
```

而不是：

```text
Product Identity
↓
Tenant Code
↓
Login
```

---

# 12. Customer Workspace 品牌继承

客户登录以后：

Header / Sidebar 顶部继续使用：

```text
Tenant Logo
Tenant Company Name
```

不要重新切回：

```text
Freight Customer Portal
```

客户整个使用过程应该始终感知：

> “我正在使用 XX Freight 的客户平台。”

---

# 13. Customer Workspace 保留当前业务能力

本轮不要重构登录后的业务结构。

继续保留：

```text
Dashboard
Rate
Quote
Booking
Shipment
Document
Invoice
Company Profile
```

仅做品牌与入口优化。

不要借本轮需求修改：

- Rate 逻辑
- Quote 状态机
- Booking 状态机
- Shipment
- SO
- Invoice
- Document

---

# 14. URL / Navigation

本轮最小试点结构：

```text
/t/[portalSlug]
Tenant Public Landing

/t/[portalSlug]/login
Tenant Customer Login

/portal
Customer Dashboard

/portal/rates
/portal/quotes
/portal/bookings
/portal/shipments

/admin/login
Internal Login

/admin
Internal Workspace
```

登录成功后继续使用现有 `/portal/*` 业务路由，本轮不将所有 Portal 页面重构为 `/t/[portalSlug]/portal/*`。Tenant 范围继续由登录后的 Token 和服务端 Tenant Context 保证。

Landing Page 上的“查询运价”不得变成匿名查价，应进入：

```text
/t/[portalSlug]/login?next=/portal/rates
```

---

# 15. Deep Link

必须保留当前：

```text
/t/northstar/login?next=/portal/bookings
```

之类的 Deep Link 能力。

当用户通过邮件 / 微信打开：

```text
/portal/bookings/BOOKxxx
```

未登录：

```text
→ Tenant Login
→ Login
→ 自动回到 Booking Detail
```

Landing Page 优化不能破坏 Deep Link。

通知和客户分享链接需要携带正确的门户入口。当前 IP 部署阶段可生成：

```text
http(s)://SERVER_IP/t/northstar/login?next=/portal/bookings/BOOKxxx
```

`next` 只能接受本站 `/portal` 下的合法路径，不得接受外部 URL。

---

# 16. Demo 环境

Demo Tenant 可以继续存在。

但 Demo 信息不要占用正式 Login UI。

可以通过：

```text
Development Mode
Demo Account Hint
```

仅开发环境显示。

Production 不显示：

```text
本地演示租户
运营账号
客户账号
```

---

# 17. Responsive

重点保证：

Desktop
Tablet
Mobile

Landing Page 与 Login 都可正常使用。

Mobile 不要继续使用：

```text
50% Marketing
50% Login
```

这种固定双栏结构。

Mobile 建议：

```text
Logo
Company
Hero

Login CTA
```

然后进入 Login 页面。

---

# 18. 实现顺序

严格按以下顺序执行。

## Phase 1

检查：

- Tenant Model
- Company Profile
- Login Flow
- Tenant Resolver
- Current Route Structure
- Branding support
- IP/HTTPS 部署条件

先给出最小改造方案。

---

## Phase 2

实现：

Tenant Branding Data

不要先改 UI。

本阶段优先新增 `portalSlug` 及必要品牌字段，建立路径 Tenant Resolver 和只返回公开展示信息的 Branding 读取能力。

---

## Phase 3

实现：

Public Tenant Landing Page

---

## Phase 4

重构：

Customer Login

删除 Production 的 Tenant Code 输入。

客户从 `/t/[portalSlug]/login` 进入，Tenant 由路径解析。内部员工使用独立 `/admin/login` 入口，本轮不重写内部鉴权流程。

---

## Phase 5

Customer Workspace：

继承 Tenant Logo / Company Name / Brand Color。

---

## Phase 6

Regression Test：

Login
Deep Link
Tenant Isolation
Customer Workspace
Unknown/Inactive Tenant
Customer Credential on Wrong Tenant Portal

---

# 19. 验收标准

完成后必须满足：

1. 客户打开入口时，第一眼看到的是货代公司品牌
2. 不再以 Freight Customer Portal 作为客户侧主要品牌
3. Production 登录页不再要求客户填写 Tenant Code
4. Tenant 能够自动识别
5. Landing Page 有：
   - Logo
   - Company Name
   - Hero
   - Services
   - Contact
   - Login CTA
6. Customer Workspace 登录后继续显示 Tenant Branding
7. 不影响现有：
   - Rate
   - Quote
   - Booking
   - Shipment
8. Deep Link 继续正常工作
9. Tenant Isolation 不受影响
10. 历史 Tenant 没有 Branding 配置也不会报错
11. Mobile 可正常使用
12. 没有引入完整 CMS
13. 客户可通过 `http(s)://SERVER_IP/t/{portalSlug}` 访问对应租户门户
14. 客户登录成功后继续使用现有 `/portal/*` 业务路由
15. 内部员工仍可通过独立 Admin 入口登录
16. Tenant A 的门户不能使用 Tenant B 的客户账号登录
17. 未知、暂停或关闭的 Tenant 不提供客户登录
18. “查询运价”CTA 必须先登录，本轮不暴露匿名运价 API
19. 通过公网使用真实客户账号时必须使用 HTTPS

---

# 20. Non-goals

本轮明确不做：

```text
完整企业官网
博客
新闻
SEO CMS
动态页面编辑器
Theme Builder
租户自定义 CSS
多语言 CMS
Custom Domain 自动配置
子域名 Tenant 识别
DNS 自动配置
SSL 证书自动签发
客户自助注册
匿名运价查询
在线聊天
CRM
Marketing Automation
```

这些都不是当前 V1 目标。

---

# 21. 产品原则

本轮最终必须贯彻：

> Customer Portal 是货代公司的数字客户入口，而不是 SaaS 产品的登录后台。

以及：

> 客户侧品牌化，内部侧产品化。

Customer 看到：

```text
Northstar Freight
```

Operation 看到：

```text
Freight SaaS Backend
```

两者角色不同，不应该共享完全相同的产品身份感知。

---

# 22. 完成后输出

完成后请输出简洁实施报告：

1. 修改了哪些 Model
2. Tenant Branding 新增了哪些字段
3. Tenant 如何自动识别
   - 试点阶段如何从 `/t/{portalSlug}` 解析
4. Landing Page 新增了哪些页面
5. Login Flow 如何变化
6. 是否删除了 Production Tenant Code 输入
7. Customer Workspace 如何继承 Tenant Branding
8. Deep Link 是否保持
9. Mobile 是否处理
10. 是否存在架构风险
11. 尚未实现的内容
12. 客户门户的 HTTPS 入口和内部 Admin 登录入口

如果现有架构与上述方案冲突：

优先最小可行改造。

不要为了本轮需求大范围重写整个认证系统。
