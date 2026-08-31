# Quote → Booking 订舱详情页优化需求

## 1. 背景

当前客户从已接受的 Quote 创建 Booking 后，会进入订舱详情页。

现有页面已经具备以下基础能力：

```text
Quote = ACCEPTED
↓
点击「创建订舱」
↓
生成 Booking Draft
↓
客户补充订舱资料
↓
保存草稿 / 提交
```

当前页面主骨架正确，但还存在几个关键问题：

1. 用户看不出该 Booking 来源于哪张 Quote。
2. Quote 中已经确定的箱型和箱量没有在 Booking 页面明确显示。
3. Booking 页面仍有较多重复填写字段，未充分体现 Quote → Booking 自动继承价值。
4. 缺少 Cargo Ready Date、Package Type 等真实订舱关键字段。
5. Shipper / Contact 当前仍采用纯手工输入方式，不利于高频客户重复使用。
6. 「提交审核」属于内部术语，不适合作为客户侧 CTA。
7. DRAFT 状态下使用「取消订舱」语义过重。
8. SO 与 Shipment 在 Draft 阶段提前展示，信息价值较低。
9. Booking Status 需要尽早统一，避免后续流程继续临时扩状态。
10. 必须限制 V1 不支持 Partial Booking，避免 Quote Quantity Consumption 复杂化。

本次目标不是推翻当前页面，而是将其优化为：

> **基于 Accepted Quote 自动继承数据，只让客户补充真正缺少的订舱信息。**

---

# 2. 核心产品原则

Booking 不是一张独立表单。

它应当是：

```text
Rate
↓
Quote
↓
Accepted Quote
↓
Booking Draft
↓
Shipment
```

因此必须遵循：

> 客户在 Rate / Quote 阶段已经提供或系统已经知道的数据，在 Booking 阶段不重复要求填写。

判断一个字段是否应该让客户重新输入，可以使用这个标准：

```text
系统是否已经知道？
```

如果答案是：

```text
Yes
```

则默认自动继承，仅在确有业务必要时允许修改。

---

# 3. Booking 来源 Quote

当前 Booking 页面必须新增来源信息。

建议顶部展示：

```text
BOOK202608000002

来源报价
QT202608000002

CNSZX → USNYC
MAEU · Pacific Express

ETD
2026-09-05

3 × 40HQ
```

Quote Number 应支持点击：

```text
Booking Detail
→ Quote Detail
```

---

# 4. Container Type 与 Quantity

这是 P0。

Accepted Quote 已经确定：

```text
3 × 40HQ
```

Booking 创建时必须自动继承：

```text
Container Type = 40HQ
Quantity = 3
```

Booking 页面必须明确展示：

```text
箱型
40HQ

数量
3
```

V1 建议：

```text
不可修改
```

原因：

如果 Quote：

```text
3 × 40HQ
```

而 Booking 允许改成：

```text
1 × 40HQ
```

系统马上需要支持：

```text
Quoted Quantity
Booked Quantity
Remaining Quantity
Partial Booking
Multiple Bookings per Quote
Quote Quantity Consumption
```

这会显著增加复杂度。

---

# 5. V1 Quote → Booking 关系

V1 定义：

```text
1 Accepted Quote
→
1 Booking
```

并且：

```text
Quote Container Quantity
=
Booking Container Quantity
```

暂不支持：

```text
1 Quote
→ N Bookings
```

也暂不支持：

```text
Partial Booking
```

---

# 6. Booking 创建后的 Quote 行为

Quote 创建 Booking 前：

```text
[基于此报价订舱]
```

创建成功后：

```text
关联订舱
BOOK202608000002

[查看订舱]
```

不得继续显示：

```text
创建订舱
```

避免重复生成 Booking。

后端必须增加重复创建保护。

例如：

```text
if quote.booking_id exists:
    reject duplicate create
```

---

# 7. Booking 页面顶部信息

建议顶部至少展示：

```text
Booking Number
BOOK202608000002

Source Quote
QT202608000002

Route
CNSZX → USNYC

Carrier
MAEU

Service
Pacific Express

ETD
2026-09-05

Container
3 × 40HQ

Status
DRAFT
```

其中：

- Route
- Carrier
- Service
- ETD
- Container
- Quantity

全部来自 Quote Snapshot。

---

# 8. Booking Draft 表单结构

建议拆成三个主要区块：

```text
1. Cargo Information
2. Shipper Information
3. Booking Contact
```

可选增加：

```text
4. Special Requirements
```

---

# 9. Cargo Information

V1 建议字段：

```text
Commodity *
Package Type *
Package Quantity *
Gross Weight KG *
Volume CBM
Cargo Ready Date *
Dangerous Goods
Special Instructions
```

---

# 10. Commodity

当前：

```text
品名 *
```

建议保留。

内部字段建议：

```text
commodity_name
```

未来可扩展：

```text
hs_code
commodity_description
```

但 V1 不要求 HS Code。

---

# 11. Package Type

当前只有：

```text
件数 *
```

信息不完整。

必须新增：

```text
包装类型 *
```

V1 可选值：

```text
CARTON
PALLET
CASE
BAG
DRUM
PACKAGE
OTHER
```

前端展示：

```text
Carton
Pallet
Case
Bag
Drum
Package
Other
```

最终数据表达：

```text
120 Cartons
```

而不是：

```text
120 件
```

---

# 12. Package Quantity

当前：

```text
件数 *
```

保留。

建议内部命名：

```text
package_quantity
```

不要使用模糊字段：

```text
quantity
```

避免与 Container Quantity 混淆。

---

# 13. Gross Weight

当前：

```text
毛重 KG *
```

保留并设为必填。

建议字段：

```text
gross_weight_kg
```

数值必须：

```text
> 0
```

---

# 14. Volume CBM

当前：

```text
体积 CBM *
```

建议对于 FCL：

```text
改为选填
```

原因：

FCL 订舱场景中，CBM 不一定在创建 Booking Draft 时已经精确可得。

建议：

```text
Volume CBM
```

不带 `*`。

字段：

```text
volume_cbm
```

---

# 15. Cargo Ready Date

当前缺失，是 P0。

必须新增：

```text
货好日期 *
Cargo Ready Date *
```

例如：

```text
2026-09-03
```

字段：

```text
cargo_ready_date
```

基本校验：

```text
cargo_ready_date <= ETD
```

如果晚于 ETD：

```text
货好日期晚于当前 ETD，请确认船期或重新选择报价。
```

---

# 16. Shipper Information

当前：

```text
发货人名称 *
发货人地址 *
```

全部要求手工填写。

不建议长期保留这种模式。

应该改成：

```text
发货人 / Shipper *

[ Shenzhen ABC Technology Co., Ltd. ▼ ]
```

选择后自动展示：

```text
地址
Shenzhen, Guangdong, China

联系人
xxx

电话
xxx
```

---

# 17. Address Book / Shipper Book

建议建立可复用实体：

```text
CompanyAddressBook
```

或：

```text
TradeParty
```

未来可统一承载：

```text
Shipper
Consignee
Notify Party
Billing Party
```

V1 至少支持：

```text
历史 Shipper
+
新增 Shipper
```

用户第一次填写后保存，下次直接选择。

---

# 18. Shipper 新增

如果没有历史记录：

```text
+ 新增发货人
```

弹窗字段：

```text
Company Name *
Address *
Contact
Email
Phone
Country
City
Postal Code
```

保存后：

```text
自动加入 Address Book
```

并回填当前 Booking。

---

# 19. Booking Contact

当前：

```text
订舱联系人 *
联系人邮箱
联系人电话
```

不应该每次从零输入。

默认从：

```text
Current Login User
```

或：

```text
Company Profile
```

自动带入：

```text
联系人
Alex

Email
xxx@company.com

Phone
+86 ...
```

允许修改，但默认已填。

---

# 20. Contact 字段建议

```text
booking_contact_name
booking_contact_email
booking_contact_phone
```

客户只在特殊场景下修改。

---

# 21. Dangerous Goods

当前 checkbox：

```text
□ 危险品
```

方向正确。

但必须明确 V1 行为。

如果 V1 不完整支持 DG：

```text
危险品订舱需要额外审核，请提交基础信息后由客服跟进。
```

未来可扩展：

```text
UN Number
IMO Class
Packing Group
Proper Shipping Name
Flash Point
Marine Pollutant
MSDS
DG Declaration
```

这些不属于本轮 P0。

---

# 22. Special Instructions

建议新增：

```text
特殊要求 / 备注
```

Textarea。

例如：

```text
Need 14 days free time.
Cargo requires side loading.
Please avoid transshipment.
```

字段：

```text
special_instructions
```

---

# 23. 操作按钮文案

当前：

```text
取消订舱
保存草稿
提交审核
```

建议在 DRAFT 状态改成：

```text
删除草稿
保存草稿
提交订舱
```

---

# 24. 为什么不用「提交审核」

客户不是在操作内部审批流程。

客户的真实目标是：

```text
我要订舱
```

因此主 CTA：

```text
提交订舱
```

后台状态自己变：

```text
DRAFT
→ SUBMITTED
```

---

# 25. 删除草稿

DRAFT 阶段还没有真正提交订舱。

因此：

```text
取消订舱
```

语义过重。

建议：

```text
删除草稿
```

点击后确认：

```text
删除此订舱草稿？

删除后不会影响原报价。

[取消]
[确认删除]
```

---

# 26. 已提交后的取消

只有：

```text
SUBMITTED
PROCESSING
```

状态才出现：

```text
取消订舱
```

取消后：

```text
CANCELLED
```

并要求：

```text
Cancellation Reason
```

---

# 27. Booking Status

V1 建议统一：

```text
DRAFT
SUBMITTED
PROCESSING
CONFIRMED
CANCELLED
```

DRAFT：客户正在填写。

SUBMITTED：客户已提交。

PROCESSING：运营 / 销售正在向 Carrier / Supplier 处理订舱。

CONFIRMED：订舱已确认，可以进入 SO / Shipment 阶段。

CANCELLED：订舱取消。

---

# 28. 不要把 Shipment 状态塞进 Booking Status

Booking 与 Shipment 是两个独立 lifecycle。

正确：

```text
Booking
DRAFT
↓
SUBMITTED
↓
PROCESSING
↓
CONFIRMED
```

然后：

```text
Booking CONFIRMED
↓
Shipment Created
```

Shipment 自己管理：

```text
BOOKED
DEPARTED
IN_TRANSIT
ARRIVED
DELIVERED
```

---

# 29. SO 与 Shipment 展示时机

当前 Draft 页面底部已经展示：

```text
SO 尚未放出，Shipment 尚未创建
```

不建议在 DRAFT 阶段显示。

用户还没提交 Booking，此时这些信息没有价值。

Draft 阶段只显示：

```text
Booking Form
```

Submitted 之后建议增加 Timeline：

```text
✓ 报价已接受
✓ 订舱已提交
● 等待处理
○ SO 放出
○ Shipment 创建
```

Confirmed 阶段再显示：

```text
SO Number
SO File
Vessel / Voyage
CY Cut-off
SI Cut-off
VGM Cut-off
```

如果 Shipment 已生成：

```text
关联 Shipment
SHP202609000021

[查看 Shipment]
```

---

# 30. Quote Snapshot 继承

Booking 创建时至少继承：

```text
source_quote_id
source_quote_number

customer_id

pol
pod

carrier
service

etd
transit_days

container_type
container_quantity

quote_currency
quote_total

freight_lines
surcharges

quote_terms
```

---

# 31. Quote 数据是否允许 Booking 修改

V1 建议以下字段锁定：

```text
POL
POD
Carrier
Service
ETD
Container Type
Container Quantity
Quote Price
```

如果客户需要改变这些信息：

```text
返回重新报价
```

而不是在 Booking 内直接改。

---

# 32. Quote Total 在 Booking 的展示

Booking 页面可以展示：

```text
Quote Amount
CNY 10,200
```

但不需要突出成主视觉。

主要作用是提醒：

```text
本次 Booking 来源于该 Quote
```

---

# 33. 提交校验

点击：

```text
提交订舱
```

必须校验：

```text
Commodity exists
Package Type exists
Package Quantity > 0
Gross Weight > 0
Cargo Ready Date exists
Shipper exists
Booking Contact exists
Container Quantity > 0
Source Quote exists
Source Quote Status = ACCEPTED
```

---

# 34. Quote 状态校验

创建 Booking 时：

```text
Quote Status must be ACCEPTED
```

禁止以下状态直接创建 Booking：

```text
PENDING_REVIEW
SENT
REJECTED
EXPIRED
CANCELLED
```

---

# 35. Quote 与 Booking 唯一关系

V1 建议数据库约束：

```text
booking.source_quote_id UNIQUE
```

从而保证：

```text
1 Quote
→ 1 Booking
```

---

# 36. Submit 成功后的用户反馈

不要只 Toast：

```text
提交成功
```

建议进入 Booking Detail Readonly 状态：

```text
订舱已提交

BOOK202608000002

状态
已提交

航线
CNSZX → USNYC

船司
MAEU

箱量
3 × 40HQ

ETD
2026-09-05
```

并显示：

```text
下一步
货代正在处理订舱。
```

---

# 37. Booking List

提交后立即出现在：

```text
客户门户
→ 订舱
```

列表。

建议至少展示：

```text
Booking No.
Route
Carrier
ETD
Container
Status
Updated At
```

---

# 38. 页面最终建议结构

## Header

```text
BOOK202608000002

来源报价
QT202608000002

CNSZX → USNYC

MAEU · Pacific Express

ETD
2026-09-05

3 × 40HQ

状态
草稿
```

## Section 1 — Cargo Information

```text
品名 *

包装类型 *
[Carton ▼]

件数 *

毛重 KG *

体积 CBM

货好日期 *
```

## Section 2 — Shipper

```text
发货人 *

[Shenzhen ABC Technology Co., Ltd. ▼]

地址
自动展示

[新增发货人]
```

## Section 3 — Contact

```text
订舱联系人
Alex

Email
xxx@company.com

Phone
+86 ...
```

默认自动带入。

## Section 4 — Special Requirements

```text
□ 危险品

特殊要求 / 备注
[........................]
```

## Footer Actions

DRAFT：

```text
[删除草稿]
[保存草稿]
[提交订舱]
```

SUBMITTED：

```text
[取消订舱]
```

---

# 39. P0

本轮必须完成：

```text
显示 Source Quote

显示并锁定：
Container Type
Container Quantity

新增：
Cargo Ready Date
Package Type

Shipper 可选择 / 可复用

Booking Contact 自动带入

提交审核 → 提交订舱

DRAFT：
取消订舱 → 删除草稿

Quote → Booking Duplicate Protection

Booking Status 统一
```

---

# 40. P1

建议后续：

```text
Address Book
Consignee / Notify Party
Booking Timeline
DG Basic Fields
Special Instructions
SO Information
Shipment Link
```

---

# 41. P2

后续真实客户需求出现后再做：

```text
Partial Booking
1 Quote → N Bookings
Remaining Quantity
Split Booking
Multiple Container Types
DG Full Workflow
Reefer
OOG
LCL Booking
Carrier API Integration
```

---

# 42. Codex 实施前检查

Codex 修改代码前先检查：

```text
Quote Model
Quote Status
Quote → Booking Relation
Booking Model
Booking Status Enum
Booking Create API
Booking Update API
Booking Submit API
Booking Detail Page
Booking List Page
Customer Profile
User Contact Data
Address / Shipper Model
Shipment Model
SO Model
```

第一步只输出：

1. 当前实现分析
2. 与本需求的差异
3. 需要新增 / 修改的数据字段
4. 是否需要 Migration
5. 是否已经存在 Address Book / Trade Party 模型
6. Quote → Booking 当前关联方式
7. 拟修改文件
8. API 改造计划
9. 页面改造计划
10. 风险与兼容性

不要立即修改代码。

---

# 43. 验收场景

## Case 1 — Quote 正常创建 Booking

Quote：

```text
QT202608000002

Status
ACCEPTED

Route
CNSZX → USNYC

Carrier
MAEU

ETD
2026-09-05

3 × 40HQ
```

创建 Booking 后：

```text
BOOK202608000002

Source Quote
QT202608000002

3 × 40HQ
```

箱型、数量不可修改。

## Case 2 — Duplicate Booking

同一 Quote 再次点击创建：

```text
Quote already has booking.
```

前端：

```text
该报价已经创建订舱。

[查看订舱]
```

不能生成第二条 Booking。

## Case 3 — Contact 自动带入

当前用户信息应自动填入 Contact，不需要重复输入。

## Case 4 — Shipper 复用

用户第一次新增 Shipper 后，下一次 Booking 可以直接选择。

## Case 5 — Cargo Ready Date

ETD：

```text
2026-09-05
```

Cargo Ready：

```text
2026-09-08
```

系统提示：

```text
货好日期晚于当前 ETD，请确认船期。
```

## Case 6 — Draft 操作

DRAFT 状态按钮：

```text
删除草稿
保存草稿
提交订舱
```

不得显示：

```text
取消订舱
```

## Case 7 — Submit

点击：

```text
提交订舱
```

状态：

```text
DRAFT
→ SUBMITTED
```

页面变只读，并显示：

```text
订舱已提交，货代正在处理。
```

---

# 44. 最终目标

用户体验最终应变成：

```text
我接受 Quote
↓
点击基于此报价订舱
↓
路线 / 船司 / ETD / 箱型 / 箱量全部自动带入
↓
我只补货物和发货信息
↓
提交订舱
↓
等待货代确认
```

而不是：

```text
我接受 Quote
↓
进入另一张空白表单
↓
重新填写前面已经填过的信息
```

这个页面的核心价值不是：

> 做一张完整 Booking Form。

而是：

> **让 Accepted Quote 无缝变成 Booking。**
