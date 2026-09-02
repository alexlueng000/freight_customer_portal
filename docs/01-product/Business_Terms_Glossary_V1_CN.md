# 货代业务术语与缩写速查手册（V1）

> 目的：帮助新加入项目的开发/测试/产品人员快速看懂 PRD、技术设计、ERD 和代码里的货代术语与英文缩写。
> 说明：本文按“出现频率 + 学习顺序”组织，先讲贯穿全项目的核心链路术语，再讲船期/单证/箱型/费用，最后是技术类缩写。
> 更新日期：2026-08-31

---

## 1. 一句话理解本项目业务

货代（Freight Forwarder）帮外贸公司安排海运。外贸公司（客户）在门户上：

```
查运价(Rate) → 要报价(Quote) → 下订舱(Booking) → 货代订舱出提单(SO/BL)
→ 货物上船运输(Shipment) → 全程跟踪节点(Tracking) → 拿单证(Document) → 收账单(Invoice)
```

---

## 2. 核心链路对象（本项目领域模型）

| 术语 | 全称 | 通俗解释 |
| --- | --- | --- |
| **Rate（运价）** | Ocean Freight Rate | 货代从船司/同行拿到的运输价格。含航线（POL→POD）、船司、箱型、有效期和成本价。本项目中一条 Rate 可挂多个箱型价格（RatePrice）和附加费（RateCharge） |
| **Markup（加价）** | — | 货代在成本价上加价卖给客户的方式。V1 只支持固定金额（FIXED）和百分比（PERCENT）两种 |
| **Quote（报价）** | Quotation | 货代给客户的正式报价单，有编号（如 QT202609000123）、有效期、明细和 PDF。价格从 Rate 快照复制，之后 Rate 变了也不影响已出的报价 |
| **Booking（订舱）** | Booking / Booking Request | 客户接受报价后下的“订单”，即向货代正式申请舱位。客户提交 → 货代审核 → 确认 → 放出 SO |
| **Shipment（货运单/履约单）** | Shipment | 一票货的完整运输过程。Booking 确认放 SO 后建档，贯穿从提柜到完成全程 |
| **Container（集装箱）** | Container | 一票 Shipment 可能有多个箱子，柜号、封条、重量等独立维护 |
| **TrackingEvent（跟踪节点）** | Tracking Event | 运输过程中的业务节点，如“已装船”“已离港”“已到港”。V1 是人工录入的标准节点，不是船司实时数据 |
| **Document（单证）** | Document | SO、BL、Invoice 附件等文件，带版本和“客户是否可见”开关 |
| **Invoice（账单）** | Invoice / Receivable | 货代开给客户的应收账单。客户在线查看确认，财务人工标记收款 |
| **Tenant（租户）** | Tenant | SaaS 里的一家货代公司。所有业务数据都归属某个租户，数据严格隔离 |
| **CustomerCompany（客户公司）** | — | 租户（货代）的客户，即外贸/工厂企业。一家客户公司可有多个联系人和登录账号 |

---

## 3. 航线与地点

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **POL** | Port of Loading | 起运港/装货港，如盐田（YANTIAN）、上海（SHANGHAI） |
| **POD** | Port of Discharge | 卸货港/目的港，如洛杉矶（LOS_ANGELES）、汉堡（HAMBURG） |
| **Carrier（船司）** | Shipping Line / Carrier | 承运集装箱的航运公司，如 COSCO（中远海运）、ONE、Maersk（马士基） |
| **Vessel（船名）** | Vessel Name | 具体执行运输的船舶名称 |
| **Voyage（航次）** | Voyage No. | 船的班次编号，船名 + 航次唯一确定一程船期 |

## 4. 时间类缩写（船期四兄弟）

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **ETD** | Estimated Time of Departure | 预计离港时间。查价和报价都用它 |
| **ETA** | Estimated Time of Arrival | 预计到港时间 |
| **ATD** | Actual Time of Departure | 实际离港时间，开船后由操作录入 |
| **ATA** | Actual Time of Arrival | 实际到港时间 |

记忆法：**E = Estimated（预计），A = Actual（实际）；D = Departure（离港），A = Arrival（到港）**。

## 5. 单证类缩写

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **SO** | Shipping Order | 订舱确认单/下货纸。船司确认舱位后发放，是提柜装货的凭证。本项目 Booking 确认后由操作上传 |
| **BL / B/L** | Bill of Lading | 提单。货权凭证，收货人凭 BL 提货。分草稿（DRAFT_BL）和正本/最终（FINAL_BL）两个阶段 |
| **MBL** | Master Bill of Lading | 船东单/主提单，船司签给货代的 |
| **HBL** | House Bill of Lading | 货代单/子提单，货代签给实际客户的 |
| **SI** | Shipping Instruction | 补料/装船指示，客户提供给船司做单的资料（V1 不做 SI EDI） |
| **VGM** | Verified Gross Mass | 集装箱验证总重。国际公约要求申报，超重不能上船 |

## 6. 集装箱相关

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **FCL** | Full Container Load | 整箱，一票货独占一个柜子。V1 只做整箱 |
| **LCL** | Less than Container Load | 拼箱，多家货拼一个柜。V1 不做 |
| **20GP** | 20 feet General Purpose | 20 英尺干货柜 |
| **40GP** | 40 feet General Purpose | 40 英尺干货柜 |
| **40HQ / 40HC** | 40 feet High Cube | 40 英尺高柜，最常用箱型（本项目演示即盐田→洛杉矶 40HQ） |
| **柜号** | Container No. | 集装箱全球唯一编号，格式为 4 字母船东代码 + 7 位数字（如 COSU1234567），项目里有格式校验 |
| **封条号** | Seal No. | 封柜铅封编号，防中途开箱 |
| **Gate In** | — | 进港/还重柜进场（TrackingEvent 之一：Container Gated In） |
| **提柜** | Empty Container Picked Up | 拖车去堆场提取空柜（TrackingEvent 之一） |

## 7. 费用与计价

| 术语 | 解释 |
| --- | --- |
| **Ocean Freight（海运费）** | 主运费，按箱计价的基础费用 |
| **Surcharge（附加费）** | 海运之外的附加费用，如 THC、BAF。本项目用 **RateCharge** 表达 |
| **THC** | Terminal Handling Charge，码头操作费（本项目测试样本中的典型附加费） |
| **BAF / FAF** | Bunker Adjustment Factor，燃油附加费 |
| **Charge Basis（计价单位）** | 费用怎么算：`PER_CONTAINER` 按箱（× 箱量）、`PER_BL` 按提单（每票 1 次）、`PER_SHIPMENT` 按票（每票 1 次）、`INCLUDED` 已含在海运费里 |
| **Cost Amount（成本价）** | 货代采购价，**客户永远不可见** |
| **Sell Amount（销售价）** | 卖给客户的价格 = 基价 + Markup（加价） |
| **AR（应收）** | Accounts Receivable，客户欠货代的钱。本项目 Invoice 即应收账单 |
| **AP（应付）** | Accounts Payable，货代欠供应商的钱。**V1 明确不做** |

## 8. 合规申报类（V1 全部不做，看懂即可）

| 缩写 | 全称 | 一句话解释 |
| --- | --- | --- |
| **EDI** | Electronic Data Interchange | 系统间标准化报文交换。V1 不接船司 EDI |
| **AMS** | Automated Manifest System | 美国舱单申报系统 |
| **ISF** | Importer Security Filing | 美国进口安全申报（俗称 10+2） |
| **ENS** | Entry Summary Declaration | 欧盟入境摘要申报 |
| **AFR** | Advanced Filing Rules | 日本预配舱单申报 |
| **AIS** | Automatic Identification System | 船舶实时定位系统。V1 不做实时追踪 |
| **OCR** | Optical Character Recognition | 图片文字识别。V1 不做 |

## 9. 角色与权限

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **RBAC** | Role-Based Access Control | 基于角色的权限控制。本项目角色见下表 |
| **SUPER_ADMIN** | 平台超管 | SaaS 平台方，管理租户，不碰具体业务 |
| **TENANT_ADMIN** | 货代管理员 | 货代公司内部管理员，管员工/客户/运价/全部订单 |
| **SALES** | 销售 | 负责客户、报价、手工改价；只能看自己名下客户 |
| **OPERATION** | 操作 | 订舱审核、SO/BL 上传、Shipment 维护、节点录入 |
| **FINANCE** | 财务 | Invoice 创建、发布、标记收款 |
| **CUSTOMER_ADMIN** | 客户管理员 | 客户公司管理员，管本公司子账号 |
| **CUSTOMER_USER** | 客户普通用户 | 只能看本公司被授权的数据 |

## 10. 技术类缩写

| 缩写 | 全称 | 解释 |
| --- | --- | --- |
| **SaaS** | Software as a Service | 多租户订阅式软件，一套系统服务多家货代 |
| **API** | Application Programming Interface | 前后端之间调用接口 |
| **JWT** | JSON Web Token | 短期访问令牌，登录后前端凭它调 API |
| **RBAC Guard** | — | 后端权限拦截器，每个接口声明所需权限 |
| **ORM / Prisma** | Object-Relational Mapping | 用 TypeScript 代码操作数据库的框架 |
| **BullMQ** | — | 基于 Redis 的后台任务队列，本项目用于 Excel 导入、PDF 生成、邮件发送 |
| **S3 / MinIO** | — | S3 是 AWS 对象存储协议；MinIO 是本地自建的 S3 兼容存储，存放上传的单证文件 |
| **DTO** | Data Transfer Object | 接口入参/出参的数据结构定义 |
| **E2E** | End-to-End Test | 端到端自动化测试（Playwright 模拟真实用户操作浏览器） |
| **UAT** | User Acceptance Test | 业务/用户验收测试，按 docs 里的测试手册和验收清单执行 |
| **CI** | Continuous Integration | GitHub Actions 自动构建、跑测试 |
| **CSP / HSTS** | Content Security Policy / HTTP Strict Transport Security | 浏览器安全响应头（当前风险登记里的 SEC-02） |
| **CSRF** | Cross-Site Request Forgery | 跨站请求伪造攻击 |
| **XSS** | Cross-Site Scripting | 跨站脚本攻击 |
| **RLS** | Row-Level Security | PostgreSQL 数据库行级安全，作为应用层租户隔离之外的纵深防御 |

---

## 11. 状态机速记（对照英文看懂代码枚举）

| 对象 | 状态流（代码里的枚举值 → 中文） |
| --- | --- |
| **Quote** | `DRAFT`(草稿/待销售确认) → `SENT`(已发送) → `VIEWED`(客户已看) → `ACCEPTED`(已接受) / `REJECTED`(已拒绝) / `EXPIRED`(已过期) / `BOOKED`(已转订舱) |
| **Booking** | `DRAFT`（草稿）→ `SUBMITTED`（待审核）→ `REJECTED`（待客户补充，可重新提交）或 `APPROVED`（待订舱）→ `BOOKING_SUBMITTED`（已提交订舱、待 SO）→ `BOOKED`（已订舱）；另有 `CANCELLED`（已取消） |
| **Shipment** | `PLANNED`（待开船）→ `DEPARTED`（运输中）→ `ARRIVED`（已到港）；起运前或运输中可受控进入 `CANCELLED`（已取消） |
| **Invoice** | `DRAFT`(草稿) → `ISSUED`(已发布) → `CUSTOMER_CONFIRMED`(客户已确认) → `PAID`(已收款)；可 `VOID`(作废) |
| **Document** | `ACTIVE`(当前有效) → `SUPERSEDED`(被新版本替代) |

## 12. 高频组合短语对照

| 文档里看到的写法 | 意思 |
| --- | --- |
| “盐田 → 洛杉矶 40HQ” | POL=YANTIAN，POD=LOS_ANGELES，箱型 40 英尺高柜 |
| “Accepted Quote 转 Booking” | 客户接受报价后一键生成订舱草稿 |
| “SO Released” | 订舱确认且 SO 已上传，可以提柜装货了 |
| “客户可见性 customer_visible=false” | 内部文件，客户在任何接口都拿不到 |
| “价格快照” | Quote 生成时把当时的费用/单价固化存下来，之后运价调整不影响历史报价 |
| “转单” | Quote 1:N Booking，V1 限制一份 Quote 只能转一次 |
| “白标 / White-label” | 货代用自己的 Logo、品牌色和域名使用这套门户 |

---

> 维护约定：新增业务术语或状态时同步更新本表；与 PRD/技术设计冲突时以批准文档为准。
