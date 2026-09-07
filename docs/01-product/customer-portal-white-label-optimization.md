# Customer Portal 品牌化入口优化需求

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
Login / Register
↓
Customer Workspace
```

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

V1 目标：

系统通过当前访问域名自动识别 tenant。

优先支持：

```text
tenant-slug.yourdomain.com
```

例如：

```text
northstar.portal-domain.com
```

自动识别：

```text
tenant = NORTHSTAR
```

未来可支持：

```text
portal.northstarfreight.com
```

即 Custom Domain。

本轮如果 Custom Domain 成本过高，可以先不实现。

但代码结构必须避免继续依赖客户手动输入 tenant code。

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

---

# 9. Tenant Branding 数据模型

检查当前 Tenant / Company Profile 是否已有相关字段。

优先复用。

如缺少，可增加：

```text
companyName
logoUrl
brandColor
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

建议结构：

```text
/
Public Landing

/login
Tenant Login

/portal
Customer Dashboard

/portal/rates
/portal/quotes
/portal/bookings
/portal/shipments
```

如果当前已有路由结构：

不要强制重构全部 URL。

优先最小改造。

---

# 15. Deep Link

必须保留当前：

```text
/login?next=/portal/bookings
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

先给出最小改造方案。

---

## Phase 2

实现：

Tenant Branding Data

不要先改 UI。

---

## Phase 3

实现：

Public Tenant Landing Page

---

## Phase 4

重构：

Customer Login

删除 Production 的 Tenant Code 输入。

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
4. Landing Page 新增了哪些页面
5. Login Flow 如何变化
6. 是否删除了 Production Tenant Code 输入
7. Customer Workspace 如何继承 Tenant Branding
8. Deep Link 是否保持
9. Mobile 是否处理
10. 是否存在架构风险
11. 尚未实现的内容

如果现有架构与上述方案冲突：

优先最小可行改造。

不要为了本轮需求大范围重写整个认证系统。
