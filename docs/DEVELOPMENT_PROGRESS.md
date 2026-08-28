# Freight Customer Portal 开发进度日志

> 最后更新：2026-08-29
> 当前阶段：Phase 1 — SaaS / 安全基础
> 当前目标：完成首个可持久化、可鉴权的业务纵切片

## 1. 项目当前状态

项目基础环境已经建立，客户门户与运营后台界面可以正常运行。当前已从纯模拟页面推进到真实数据库、真实登录、真实用户和租户上下文阶段。

本地开发入口：

- Web：`http://localhost:3000`
- 客户门户：`http://localhost:3000/portal`
- 运营后台：`http://localhost:3000/admin`
- API：`http://localhost:4000/api/v1`
- API 文档：`http://localhost:4000/api/docs`
- PostgreSQL：`localhost:5433`

## 2. 已完成内容

### 2.1 项目基础

- 建立 pnpm monorepo，包含 Web、API、Worker 和共享 packages。
- 建立 Next.js、NestJS、Prisma、PostgreSQL、Redis、MinIO 基础结构。
- 完成 Docker Compose、本地环境变量示例和 CI 基线。
- 增加健康检查、数据库 readiness 检查、统一 API 错误结构和请求上下文。
- 修复 Next.js 开发缓存与生产构建产物混用导致的 Webpack/CSS 异常。

### 2.2 数据库与多租户基础

- 已建立 Tenant、User、Role、Permission、UserRole、CustomerCompany、CustomerContact、AuditLog、BusinessNumberCounter 等基础模型。
- 已加入关键租户一致性约束和数据库触发器，防止跨租户绑定客户、用户和角色。
- 已新增 RefreshSession 表，用于刷新令牌轮换和重放检测。
- 当前 3 个 Prisma migration 已写入版本库并应用到本地数据库。
- Demo seed 可重复执行，已经创建 DEMO 租户、系统角色、权限、演示客户公司及演示用户。

### 2.3 后端认证

- 支持“租户代码 + 邮箱 + 密码”登录。
- 密码使用 bcrypt，并在哈希前加入环境级 pepper。
- 使用短期 JWT Access Token。
- Refresh Token 使用随机不透明令牌，只在数据库保存 HMAC 哈希。
- Refresh Token 使用 HttpOnly、SameSite=Strict Cookie，并在每次刷新时轮换。
- 检测旧 Refresh Token 重用后会撤销整个令牌族。
- 已实现登录、刷新、退出和当前用户接口：
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- 全局 Auth Guard 会重新查询当前用户、租户和角色，不把 JWT 中的角色当作唯一权限来源。
- 登录和退出会写入审计日志。
- 登录接口和刷新接口已配置限流。

### 2.4 前端认证与角色分流

- 已新增 `/login` 登录页面并接入真实 API。
- Web 通过同源代理访问 API，避免跨域和 Refresh Cookie 问题。
- Access Token 仅保存在前端运行内存，不写入 localStorage。
- 页面初始化时使用 HttpOnly Refresh Cookie 恢复登录状态。
- 已对 React Strict Mode 下重复刷新请求进行去重，避免触发令牌重放保护。
- 未登录访问业务页面会跳转登录页，并保留合法的目标路径。
- 内部用户登录后进入 `/admin`。
- 客户用户登录后进入 `/portal`。
- 客户用户访问 `/admin` 会被送回 `/portal`。
- 页面租户名称和用户名称已经来自真实登录数据。
- 顶部用户按钮已经接入退出登录。

### 2.5 当前演示账号

租户代码：`DEMO`

| 类型       | 邮箱                          | 本地演示密码        | 登录后入口 |
| ---------- | ----------------------------- | ------------------- | ---------- |
| 内部管理员 | `admin@demo.freight.local`    | `DemoAdmin!2026`    | `/admin`   |
| 客户管理员 | `customer@demo.freight.local` | `DemoCustomer!2026` | `/portal`  |

演示密码仅用于本地开发，不得用于共享、测试或生产环境。

### 2.6 客户公司 API

- 已新增 `customers` NestJS 模块。
- 已实现客户公司分页列表、关键词/状态筛选、创建和详情接口：
  - `GET /api/v1/customers`
  - `POST /api/v1/customers`
  - `GET /api/v1/customers/:id`
- 所有客户查询强制使用认证上下文中的 `tenantId`；客户类型账号只能读取自己绑定的客户公司。
- 已新增通用 `@RequirePermissions()` decorator 和数据库权限 Guard，客户读取/创建分别要求 `customer.read` / `customer.manage`。
- 客户代码在租户内唯一；不同租户可使用相同代码。
- 金额和加价字段以字符串 DTO 接收并转换为 Prisma Decimal，避免 JavaScript 浮点数参与权威金额保存。
- 已校验默认加价类型/数值组合及销售负责人必须属于当前租户的内部用户。
- 创建客户与 AuditLog 写入位于同一数据库事务。

### 2.7 运营后台客户页面

- 已将 `/admin/customers` 从模拟数据切换到真实客户 API。
- 已实现分页、关键词搜索、状态筛选和清空筛选。
- 已实现 loading、empty、error 和 permission-denied 状态。
- 已新增基于 React Hook Form + Zod 的“新建客户”表单，覆盖基本信息、状态、信用额度、账期和基础加价规则。
- Access Token 过期时，前端 API 请求会使用 HttpOnly Refresh Cookie 轮换会话并自动重试一次。
- 创建权限按钮按当前角色提供前端提示性控制，最终权限仍由后端 `customer.manage` 强制执行。

### 2.8 客户联系人

- 已实现客户联系人列表和创建接口：
  - `GET /api/v1/customers/:id/contacts`
  - `POST /api/v1/customers/:id/contacts`
- 联系人查询强制校验租户和客户公司范围；客户类型账号只能读取自己绑定公司的联系人。
- 联系人创建要求 `customer.manage`，列表要求 `customer.read`。
- 已支持主要联系人、订舱联系人和单证联系人标记。
- 联系人创建与 AuditLog 写入位于同一事务；审计数据只记录是否存在邮箱/电话，不复制完整联系方式。
- 已新增 `/admin/customers/:id` 客户详情页，展示公司信息和联系人列表。
- 客户列表名称已链接到详情页，并新增 React Hook Form + Zod 联系人创建表单。

### 2.9 用户管理与基础 RBAC

- 已新增 `users` NestJS 模块及租户用户分页列表、创建和更新接口：
  - `GET /api/v1/users`
  - `POST /api/v1/users`
  - `PATCH /api/v1/users/:id`
- 用户列表支持姓名/邮箱搜索、用户类型、状态和客户公司筛选，响应不包含密码哈希。
- 内部用户只能分配 `TENANT_ADMIN`、`SALES`、`OPERATION`、`FINANCE`；客户用户只能分配 `CUSTOMER_ADMIN`、`CUSTOMER_USER`。
- 客户用户必须绑定当前租户下的 CustomerCompany，内部用户禁止绑定客户公司。
- 用户创建要求 `user.manage`，列表要求 `user.read`；角色读取以当前数据库配置为准。
- 初始密码只用于 bcrypt 哈希，不返回、不写审计；用户、角色分配和 AuditLog 在同一事务创建。
- 用户状态和角色变更按租户查询，跨租户 ID 返回未找到；角色与用户类型必须匹配。
- 角色分配、状态更新和包含前后值的 AuditLog 在同一数据库事务中完成。
- 已将 `/admin/users` 从模拟数据切换到真实 API，并支持分页、筛选、新建用户及角色/状态管理。

## 3. 已完成验证

- ESLint：通过。
- TypeScript typecheck：通过。
- Next.js / NestJS 生产构建：通过。
- API 自动化测试：8 个测试套件、25 个测试全部通过。
- 已覆盖登录、错误密码、当前用户、刷新令牌轮换、旧令牌重用、租户限定身份和数据库租户约束。
- 已覆盖客户公司跨租户隔离、同租户代码唯一性、客户账号公司范围、创建审计和权限 Guard。
- 已覆盖联系人跨租户/跨客户隔离、创建审计和联系方式审计脱敏。
- 已覆盖用户列表与更新的租户隔离、用户类型/角色匹配、客户公司绑定、状态/角色事务更新、变更审计和密码审计保护。
- 真实 HTTP 验收已覆盖登录、`/auth/me`、刷新和退出。
- 浏览器验收已覆盖内部账号登录、客户账号登录、角色分流、刷新恢复登录状态、客户列表/详情、联系人表单校验和 CSS 渲染。

## 4. 当前未完成事项与风险

- Dashboard、运价、报价、订舱、出运、单证和账单页面目前大部分仍使用模拟数据。
- 通用 permission decorator / guard 已实现，但完整权限矩阵和其他业务模块的敏感操作权限仍需逐模块落地。
- 前端还没有自动化组件测试和 Playwright E2E 测试基线。
- 忘记密码和重置密码尚未实现。
- 登录失败审计、账号锁定策略、CSP 和更完整的 Security Headers 尚未完成。
- 开发环境不要在 `next dev` 运行期间执行 `next build`，否则共用 `.next` 可能导致 Webpack 模块或 CSS 清单错位。
- 当前工作区包含尚未提交的基础、认证和前端登录改动；进入下一大模块前应先整理 diff，并由项目负责人决定是否创建阶段性提交。

## 5. 下一步开发计划

Phase 1 的首个可持久化纵切片已经完成：真实认证、租户上下文、客户公司/联系人和用户管理均已落地。下一步进入 **Rate 数据模型与运价 CRUD**，并继续在每个新模块中落实权限矩阵。

### 5.1 第一小步：客户公司 API（已完成）

- 实现 `customers` NestJS 模块。
- 实现客户公司分页列表、查询、创建和详情接口。
- 所有查询强制使用认证上下文中的 `tenantId`。
- 客户代码在同一租户内唯一。
- 使用 DTO 校验名称、代码、国家、账期、额度和默认加价字段。
- 金额与百分比使用 Prisma Decimal，不使用 JavaScript 浮点数保存权威金额。
- 创建和修改客户时写入 AuditLog。
- 为 `TENANT_ADMIN`、`SALES` 等角色增加明确的服务端权限检查。

建议接口：

```text
GET  /api/v1/customers
POST /api/v1/customers
GET  /api/v1/customers/:id
```

### 5.2 第二小步：运营后台客户页面（已完成）

- 将 `/admin/customers` 从模拟数据切换到真实 API。
- 增加分页、关键词和状态筛选。
- 增加“新建客户”表单。
- 完成 loading、empty、error 和 permission-denied 状态。
- 表单创建成功后刷新列表，并显示明确反馈。

### 5.3 第三小步：客户联系人（已完成）

- 在客户详情中查看和创建联系人。
- 支持主联系人、订舱联系人和单证联系人标记。
- 校验联系人必须属于当前租户下的目标客户公司。
- 后续客户用户创建必须绑定同租户的 CustomerCompany。

### 5.4 用户管理与基础 RBAC（已完成）

- 已实现内部用户和客户用户列表、创建、启停与单角色变更。
- 客户用户创建必须绑定当前租户下的 CustomerCompany。
- 用户管理接口已使用 permission decorator / guard，并覆盖无权限与跨租户失败路径。
- `/admin/users` 已从模拟数据切换到真实 API，提供创建和管理抽屉。

### 5.5 下一阶段：Rate 数据模型与运价 CRUD

- 按批准 ERD 核对 Rate、运价明细、有效期和币种字段，不提前引入通用定价引擎。
- 建立租户范围内的 Rate Prisma 模型、迁移、索引和数据库约束。
- 实现服务端分页、筛选、创建、详情和受控修改，并落实 `rate.read` / `rate.manage`。
- 金额使用 Prisma Decimal，日期按业务日期处理，敏感修改写入 AuditLog。
- 先完成运营后台运价管理，再接 Excel 导入和客户查价。

### 5.6 Phase 1 验收标准

- Tenant A 无法读取或修改 Tenant B 的客户公司。
- 无权限角色无法创建或修改客户。
- 相同客户代码可以存在于不同租户，但不能在同一租户重复。
- 创建客户后能立即在运营后台列表中看到真实数据库记录。
- 敏感变更能够在 AuditLog 中追踪操作者、租户、对象和变更内容。
- lint、typecheck、相关单元/集成测试和 build 全部通过。

## 6. 后续里程碑

Phase 1 的认证、客户和用户基础完成后，按以下顺序继续：

1. Rate 数据模型、CRUD、Excel 导入和客户查价。
2. Quote 创建、报价状态机和 PDF。
3. Booking 创建、提交、审核和确认。
4. Shipment、Container、TrackingEvent 和 Documents。
5. Invoice、Notifications 和 Branding。
6. 核心黄金路径 Playwright E2E 与试点加固。
