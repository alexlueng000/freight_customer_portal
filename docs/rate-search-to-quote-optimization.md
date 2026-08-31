# Rate Search → Quote Request 环节优化需求

## 1. 背景

当前客户门户已经实现以下基本流程：

```text
Rate Search
→ 查询到可用运价
→ 点击「申请报价」
→ 弹窗确认箱量
→ 展示费用预估
→ 提交报价申请
```

现有流程方向正确，但当前存在几个需要尽快统一的产品语义和业务逻辑问题：

1. 查询结果已经展示“销售价”，但提交后仍要“销售审核”，容易让客户产生疑问：既然已经是销售价，为什么还要申请？销售审核后是否还会改价？
2. 报价预估中的附加费不能简单按照箱量全部相乘，必须按费用计费单位计算。
3. 查询结果缺少部分影响客户选方案的重要信息，例如直达/中转、Free Time、价格是否 All-in / 是否包含附加费。
4. 提交后需要形成明确的 Quote 状态和客户可追踪记录，而不是只提示“提交成功”。
5. 后续必须自然衔接 Quote Review → Send Quote → Accept Quote → Accept & Book。

本次改造目标不是重做 UI，而是把：

```text
Rate
→ Quote Request
→ Official Quote
```

三个业务概念彻底分清，并补齐价格计算、状态流转和用户反馈。

---

## 2. 产品目标

完成本次优化后，客户应能完成以下完整链路：

```text
查询运价
↓
选择一个适用方案
↓
确认箱型与箱量
↓
查看费用预估
↓
提交销售确认
↓
系统生成 Quote
↓
销售审核 / 调价 / 补充条款
↓
发送正式报价
↓
客户接受报价
↓
Accept & Book
```

核心目标：

- 客户不重复填写已经存在于 Rate 中的信息。
- 客户能够清楚区分“在线参考价”和“正式报价”。
- 系统可以准确计算不同计费方式的附加费。
- 提交后有明确 Quote 编号和状态。
- 后续 Quote → Booking 可以继续复用已有数据。

---

## 3. 核心概念定义

### 3.1 Rate Search

Rate Search 展示的是：

> 当前系统中适用于该查询条件的在线参考销售价格。

建议产品文案统一使用：

```text
预计总价
在线参考价
Estimated Price
```

不要再直接写：

```text
销售价
```

原因：销售仍然可能在 Quote 阶段根据以下情况进行最终确认：

- 舱位
- 运价是否仍有效
- 特殊货物
- 超重
- 客户等级
- 临时附加费
- Carrier 临时调整
- 商务折扣

### 3.2 Quote Request

客户选择 Rate 后提交的行为定义为：

> 请求基于当前 Rate 生成正式报价。

它不是重新询价。

系统应尽量自动继承：

- POL
- POD
- Carrier
- Service
- ETD
- Transit Time
- Container Type
- Rate
- Surcharges
- Validity
- Supplier
- Contract No.
- Currency

客户只补必要信息。

V1 最少只需要：

```text
Container Quantity
```

### 3.3 Official Quote

Official Quote 指：

> 销售确认价格、有效期、附加费和商务条款后，正式发送给客户的报价。

Quote 正式发送之前：

```text
Quote Status = PENDING_REVIEW
```

正式发送之后：

```text
Quote Status = SENT
```

---

## 4. Rate Search 查询结果优化

### 4.1 当前建议保留字段

查询结果继续保留：

- 船司 / 服务
- 航线
- ETD
- 航程
- 箱型
- 价格
- 有效期
- 操作

### 4.2 增加 Direct / Via 信息

客户选择方案时，是否直达是重要决策条件。

示例：

```text
CNSZX → USNYC
Direct
```

或：

```text
CNSZX → USNYC
Via Singapore
```

如果有中转港：

```text
Routing Type: TRANSSHIPMENT
Transshipment Port: SGSIN
```

### 4.3 增加 Free Time 信息

可以不单独增加大列，建议作为航线或方案附加信息展示：

```text
14 DEM + 7 DET
```

或：

```text
21 Days Combined
```

如果当前数据模型还没有 Free Time，可以先作为 V2 字段预留。

### 4.4 优化价格展示

当前：

```text
销售价
CNY 3,400.00

主运价 CNY 3,000.00 + 1 项附加费
```

建议改为：

```text
预计总价
CNY 3,400.00

海运费 CNY 3,000.00
含 1 项附加费
```

如果不是全部费用，应增加提示：

```text
不含目的港当地费用
```

如果 Rate 为 All-in：

```text
All-in Freight
```

建议 Rate 数据结构增加：

```text
price_type
```

可选值：

```text
BASE_FREIGHT
ALL_IN
```

---

## 5. 按钮文案优化

当前：

```text
申请报价
```

建议改为：

```text
获取正式报价
```

原因：客户当前不是从零开始询价，而是在已查询到的 Rate 基础上生成正式 Quote。

---

## 6. Quote Request 弹窗优化

### 6.1 弹窗标题

当前：

```text
确认报价申请
```

建议改为：

```text
获取正式报价
```

副标题可以写：

```text
确认箱量和预计费用后提交，由销售确认并发送正式报价。
```

### 6.2 方案摘要

保留当前摘要结构：

```text
航线
CNSZX → USNYC

船司
MAEU

ETD
2026-09-05

有效期至
2026-09-06
```

建议增加：

```text
Service
Pacific Express

Routing
Direct / Via XXX
```

如页面空间有限，Service 和 Routing 可以只展示一个。

---

## 7. 箱量输入

当前设计正确：

```text
箱量
[ 1 ] × 40HQ
```

V1 不建议在这里要求客户重新填写：

- POL
- POD
- Carrier
- ETD
- Commodity
- Shipper
- Consignee
- Contact
- HS Code

Rate 中已经存在的数据不得重复录入。

---

## 8. 费用预估计算规则

这是本次改造的 P0。

### 8.1 禁止所有费用直接乘 Container Quantity

附加费必须根据：

```text
charge_unit
```

计算。

### 8.2 支持的 charge_unit

V1 至少支持：

```text
PER_CONTAINER
PER_BL
PER_SHIPMENT
```

后续可以扩展：

```text
PER_TEU
PER_DOCUMENT
PER_WEIGHT
PER_CBM
```

### 8.3 计算示例

客户选择：

```text
3 × 40HQ
```

Rate：

```text
Ocean Freight
USD 2,000 / Container

THC
CNY 1,150 / Container

AMS
USD 35 / B/L

DOC
CNY 450 / B/L
```

正确计算：

```text
Ocean Freight
3 × USD 2,000
= USD 6,000

THC
3 × CNY 1,150
= CNY 3,450

AMS
1 × USD 35
= USD 35

DOC
1 × CNY 450
= CNY 450
```

### 8.4 前端费用展示

建议：

```text
费用预估

海运费
3 × CNY 3,000
CNY 9,000

THC
3 × CNY 1,150
CNY 3,450

AMS
1 × USD 35
USD 35

DOC
1 × CNY 450
CNY 450
```

---

## 9. 多币种处理

禁止将不同币种直接相加。

例如：

```text
USD 6,035
CNY 3,900
```

不能展示为：

```text
预计总额 CNY 47,xxx
```

除非系统明确存在：

- Tenant Base Currency
- Exchange Rate
- Exchange Rate Date
- Conversion Rule

V1 建议：

### 单币种

```text
预计总额
CNY 3,400
```

### 多币种

```text
预计费用

USD 6,035
CNY 3,900
```

不要强制汇总。

---

## 10. Rate 条件确认

如果 Rate 存在限制条件，例如：

```text
General Cargo Only
No DG
Max Weight 22T
Subject to Space
```

建议在提交按钮之前显示：

```text
适用条件

General Cargo Only
Max Weight: 22T
No DG
```

V1 可以增加确认：

```text
☑ 我确认本次货物符合该运价适用条件
```

如果 Rate 没有结构化限制字段，可以先展示 Rate Terms / Remarks。

---

## 11. 提交按钮

当前：

```text
提交报价申请
```

建议：

```text
提交销售确认
```

或者：

```text
提交并生成报价
```

优先推荐：

```text
提交销售确认
```

因为正式报价还需要销售审核。

---

## 12. 提交后行为

提交成功后不要只 Toast：

```text
提交成功
```

必须生成 Quote。

### 12.1 Quote Number

示例：

```text
QT-20260831-00142
```

Quote Number 由系统生成。

### 12.2 Quote 初始状态

```text
PENDING_REVIEW
```

中文：

```text
待销售确认
```

### 12.3 提交成功页面 / Dialog

建议展示：

```text
报价申请已提交

报价编号
QT-20260831-00142

状态
待销售确认

航线
CNSZX → USNYC

船司
MAEU

箱量
1 × 40HQ

预计费用
CNY 3,400

[查看报价详情]
```

### 12.4 自动进入 Quotes

提交之后，该记录必须立即出现在：

```text
客户门户
→ 报价
```

列表中。

---

## 13. Quote 数据快照

Quote 创建时不能只保存：

```text
rate_id
```

必须保存当前 Rate Snapshot。

原因：Rate 后续可能失效、被删除、被运营修改、调整 Sell Price 或调整 Surcharge，但历史 Quote 必须保持创建时的价格。

建议 Quote 创建时保存：

```text
quote_line
```

或类似 Snapshot：

```text
origin
destination
carrier
service
etd
container_type
container_quantity

base_rate
currency

surcharges[]

valid_until
rate_terms
```

Quote 可以保留：

```text
source_rate_id
```

用于追踪来源，但不得实时读取 Rate 覆盖历史 Quote。

---

## 14. Sales Review 流程

销售端收到：

```text
PENDING_REVIEW
```

Quote。

销售可以调整：

- Base Freight
- Surcharge
- Margin
- Final Sell Price
- Valid Until
- Terms
- Notes
- Free Time
- Space / Equipment Notice

销售确认后：

```text
Send Quote
```

状态变更：

```text
PENDING_REVIEW
→ SENT
```

---

## 15. 客户正式 Quote

客户收到 Quote 后至少展示：

```text
Quote Number
Route
Carrier
Service
ETD
Container
Quantity
Freight
Surcharges
Total
Validity
Terms
```

操作：

```text
接受报价
拒绝报价
下载 PDF
```

---

## 16. Quote → Booking

客户点击：

```text
接受报价
```

建议状态：

```text
SENT
→ ACCEPTED
```

然后出现核心 CTA：

```text
Accept & Book
```

点击：

```text
Quote
↓
Booking Draft
```

必须自动继承：

- Quote Number
- Customer
- POL
- POD
- Carrier
- Service
- ETD
- Container Type
- Container Quantity
- Freight Price
- Surcharges
- Currency
- Terms

客户只补 Booking 阶段真正缺少的数据。

例如：

```text
Cargo Description
Weight
Volume
Cargo Ready Date
Shipper
Consignee
Special Instructions
```

---

## 17. 状态模型

V1 建议 Quote Status：

```text
PENDING_REVIEW
SENT
ACCEPTED
REJECTED
EXPIRED
CANCELLED
```

流程：

```text
Rate Search
↓
PENDING_REVIEW
↓
SENT
├── ACCEPTED
│      ↓
│   Booking
│
├── REJECTED
│
└── EXPIRED
```

---

## 18. 前端文案统一

### Rate Search

旧：

```text
销售价
```

新：

```text
预计总价
```

旧：

```text
申请报价
```

新：

```text
获取正式报价
```

### Quote Request Dialog

旧：

```text
确认报价申请
```

新：

```text
获取正式报价
```

旧：

```text
提交报价申请
```

新：

```text
提交销售确认
```

---

## 19. 错误处理

提交 Quote Request 前必须重新验证：

```text
Rate exists
Rate status = ACTIVE
Valid From <= current/query date
Valid To >= ETD/query date
Container price exists
Container quantity > 0
```

如果 Rate 在用户查询后已经失效：

```text
该运价已失效，请重新查询最新运价。
```

如果价格已经发生变化：

```text
该运价价格已更新，请确认最新价格后重新提交。
```

不要静默使用新价格。

---

## 20. 并发 / 价格版本检查

Rate Search Result 应返回：

```text
rate_id
rate_version
```

或：

```text
updated_at
```

提交 Quote Request 时检查 Rate 是否被修改。

如果：

```text
search.rate_version != current.rate_version
```

返回：

```text
RATE_CHANGED
```

提示客户重新确认。

---

## 21. API 建议

### 查询 Rate

```http
GET /api/customer/rates/search
```

返回示例：

```json
{
  "rateId": "...",
  "rateVersion": "...",
  "origin": "CNSZX",
  "destination": "USNYC",
  "carrier": "MAEU",
  "service": "Pacific Express",
  "routingType": "DIRECT",
  "etd": "2026-09-05",
  "transitDays": 16,
  "containerType": "40HQ",
  "baseFreight": {
    "amount": 3000,
    "currency": "CNY"
  },
  "surcharges": [],
  "estimatedTotals": [
    {
      "currency": "CNY",
      "amount": 3400
    }
  ],
  "validUntil": "2026-09-06"
}
```

### 创建 Quote Request

```http
POST /api/customer/quotes
```

Request：

```json
{
  "rateId": "...",
  "rateVersion": "...",
  "containerType": "40HQ",
  "quantity": 1
}
```

不要让前端提交：

```text
baseFreight
surcharge
total
```

最终金额必须由后端基于 Rate 重新计算。

---

## 22. 后端计算要求

价格计算必须由后端完成。

禁止：

```text
Frontend Calculate
→ Submit Total
→ Backend Trust Total
```

正确：

```text
Frontend Preview
↓
POST rateId + quantity
↓
Backend Reload Rate
↓
Validate Version
↓
Calculate
↓
Create Quote Snapshot
```

前端计算只用于实时预览，后端金额为最终数据源。

---

## 23. Audit Log

至少记录：

```text
Quote Created
Quote Reviewed
Price Changed
Quote Sent
Quote Accepted
Quote Rejected
Quote Expired
```

如果销售修改价格，应记录：

```text
Old Price
New Price
Changed By
Changed At
```

---

## 24. 本次不做

为控制 V1 范围，本阶段不要扩展：

- Dangerous Goods workflow
- Reefer
- OOG
- LCL
- 自动汇率结算
- 舱位 API
- Carrier 实时运价 API
- 自动审批 Margin
- CRM Approval Workflow
- Contract Customer Tier Pricing

这些可以以后单独设计。

---

## 25. 验收场景

### Case 1：单箱单币种

Rate：

```text
Ocean Freight
CNY 3000 / Container

ISPS
CNY 400 / Container
```

客户：

```text
1 × 40HQ
```

结果：

```text
CNY 3400
```

### Case 2：多箱

客户：

```text
3 × 40HQ
```

费用：

```text
Ocean Freight
3 × 3000
= 9000

ISPS
3 × 400
= 1200

Total
= CNY 10200
```

### Case 3：Per B/L Charge

费用：

```text
Ocean Freight
CNY 3000 / Container

DOC
CNY 450 / B/L
```

客户：

```text
3 × 40HQ
```

正确：

```text
Ocean Freight
9000

DOC
450

Total
9450
```

DOC 不得变成：

```text
1350
```

### Case 4：多币种

```text
Ocean Freight
USD 2000 / Container

THC
CNY 1150 / Container

AMS
USD 35 / BL
```

客户：

```text
2 × 40HQ
```

展示：

```text
USD 4035
CNY 2300
```

禁止直接汇总为一个币种。

### Case 5：Rate 已改变

客户搜索：

```text
CNY 3400
```

运营修改：

```text
CNY 3600
```

客户再提交旧页面。

系统必须：

```text
阻止提交
→ 提示价格已经更新
→ 要求重新确认
```

### Case 6：提交成功

提交后必须：

```text
生成 Quote Number
状态 = PENDING_REVIEW
出现在 Quotes 列表
可以进入 Quote Detail
```

---

## 26. Codex 实施要求

Codex 在修改代码前，先检查：

```text
Rate Model
RatePrice Model
Surcharge Model
Quote Model
QuoteLine Model
Rate Search API
Customer Rate Search Page
Quote Create API
Quote Status Enum
Audit Log
```

第一步只输出：

1. 当前实现分析
2. 现有数据模型能否支持本需求
3. 需要修改的文件
4. 是否需要数据库 Migration
5. 实施步骤
6. 兼容性风险

先不要直接修改代码。

确认方案后再实施。

---

## 27. 优先级

### P0

必须完成：

```text
销售价 → 预计总价
申请报价 → 获取正式报价

charge_unit 正确计费

Quote Snapshot

Quote Number

PENDING_REVIEW

后端重新计算价格

Rate Version Check

提交后进入 Quotes
```

### P1

建议本轮一起完成：

```text
Direct / Via

Free Time

Price Type
BASE_FREIGHT / ALL_IN

Rate Terms

Quote Success Page
```

### P2

后续：

```text
Customer Cargo Confirmation
Margin Approval
Exchange Rate
Advanced Pricing
Special Cargo Workflow
```

---

## 28. 最终目标

本次优化完成后，用户体验应变成：

```text
我查到了一个可用价格
↓
我能看懂这个方案
↓
我确认需要几个柜
↓
系统准确算出预计费用
↓
我一键要求正式报价
↓
销售确认
↓
我收到正式 Quote
↓
我接受
↓
直接 Booking
```

而不是：

```text
查到价格
↓
重新填询价表
↓
等销售人工重新报价
↓
再重新填 Booking
```

系统的核心价值必须体现为：

> 一次录入，数据沿 Rate → Quote → Booking 持续复用。
