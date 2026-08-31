# 运价 Excel 导入 V2 改造需求

> 目标读者：Codex / 开发人员
> 
> 模块：运营后台 → 运价 → Excel 导入
> 
> 版本：V2

## 1. 背景

当前系统 Excel 导入采用“长表”结构：同一条运价如果存在多个箱型，需要重复多行基础信息，通过相同 `运价编号` 合并为一条运价。

当前模板字段：

1. 运价编号
2. 起运港代码
3. 起运港名称
4. 目的港代码
5. 目的港名称
6. 船司代码
7. 航线服务
8. 生效日期
9. 失效日期
10. 预计开船时间
11. 航程天数
12. 供应商名称
13. 合约号
14. 运价币种
15. 状态
16. 箱型
17. 采购成本
18. 标准售价
19. 价格币种
20. 备注

示例：同一 `RATE-SHA-LAX-001` 需要分别用 20GP、40HQ 两行表示。

这种结构适合数据库，但不符合货代业务人员日常 Excel 维护习惯。现实中更常见的是“一条航线/运价一行，20GP / 40GP / 40HQ 横向展开”。

因此需要改造导入能力：**系统内部数据模型保持结构化，Excel 输入层改为业务友好的宽表，同时兼容旧模板。**

### 1.1 UAT/Pilot 结论：真实客户 Excel 适配是上线阻断项

**优先级：P0 / Pilot Blocker**

真实货代客户长期维护的运价 Excel 往往包含多层表头、合并单元格、多个 Sheet、横向箱型、不同币种、附加费区块、说明行、空白分隔行以及客户自定义字段。客户不会为了使用本系统，先把原有运价重新整理成平台规定模板。

因此，“下载平台模板后重新填写”只能作为新建数据的辅助方式，不能作为 V1 运价导入的主要前提。系统必须优先解决：

```text
客户现有 Excel
→ 选择数据 Sheet / 表头区域
→ 字段与箱型价格映射
→ 数据清洗与标准化
→ 错误和警告预览
→ 用户确认
→ 事务导入
```

产品判断：

- 如果客户需要人工重做 Excel，导入功能等同于不可用。
- 如果系统只支持固定 V1/V2 表头，真实客户仍需要在系统外做大量转换，无法形成迁移价值。
- 如果没有预览和映射确认，复杂工作簿容易造成价格、币种、箱型或附加费错配，属于业务数据风险。
- 所以真实 Excel 兼容、字段 Mapping、导入预览和可复用映射配置均提升为 P0，不得排在普通界面优化之后。

---

## 2. 改造目标

### P0

1. 支持上传真实客户现有 Excel，不要求客户先改造成平台模板。
2. 支持选择数据 Sheet、识别/指定表头行，并忽略标题、说明和空白分隔区域。
3. 提供字段 Mapping，将客户列映射到 POL、POD、Carrier、有效期、币种、箱型成本/售价和附加费等标准字段。
4. 支持保存租户级/供应商级 Mapping Profile，后续同来源文件无需重复配置。
5. 导入前必须展示标准化预览、错误、警告和映射结果，确认后才写库。
6. 新增 V2 宽表模板：一条运价一行，作为推荐模板但不是强制前提。
7. 系统自动把横向箱型价格拆成现有 `Rate + RatePrice[]` 数据结构。
8. 新模板默认继承“运价币种”，不再要求每个箱型重复填写“价格币种”。
9. 支持附加费结构化 Excel 导入，并允许从独立 Sheet 或同表费用区映射。
10. 保持旧版长表模板可继续导入，不能破坏现有数据和接口。
11. 导入前完成字段校验，不允许部分错误数据悄悄入库。
12. 导入结果必须明确展示：成功数、失败数、警告数、具体错误行。

### P1（可在 P0 完成后继续）

1. 支持“仅新增 / 更新已有运价”的高级导入模式。
2. Mapping Profile 的版本管理、复制和共享。
3. 对少数高频船司/供应商格式提供预置 Profile。

---

## 3. 不改的内容

本次不是重做运价数据库。

以下保持现状：

- Rate 主表
- RatePrice / ContainerPrice 结构
- Surcharge / 附加费结构（如当前已有）
- 运价列表
- 手工“新建运价”页面
- 客户端 Rate Search

本次重点只改：

`Excel Template → Parser → Validation → Normalize → Persist`

---

# 4. V2 Excel 模板

工作簿至少包含 2 个 Sheet：

- `运价导入`
- `附加费导入`

建议再增加一个只读说明 Sheet：

- `填写说明`

## 4.1 Sheet：运价导入

一条运价占一行。

推荐字段如下：

| 字段 | 必填 | 示例 | 说明 |
|---|---|---|---|
| 导入编号 | 是 | R001 | 仅用于当前 Excel 内关联附加费，工作簿内唯一；不是系统正式运价编号 |
| 运价编号 | 否 | RATE-SHA-LAX-001 | 为空时由系统生成 |
| 起运港代码 | 是 | CNSHA | UN/LOCODE |
| 起运港名称 | 否 | Shanghai | 有代码时名称可自动补齐 |
| 目的港代码 | 是 | USLAX | UN/LOCODE |
| 目的港名称 | 否 | Los Angeles | 有代码时名称可自动补齐 |
| 船司代码 | 是 | COSCO | 使用系统船司代码 |
| 航线服务 | 否 | Pacific Express | Service / Route |
| 运输方式 | 否 | DIRECT | DIRECT / TRANSSHIP，默认 DIRECT |
| 中转港代码 | 否 | KRPUS | 运输方式为 TRANSSHIP 时可填写 |
| 中转港名称 | 否 | Busan | 可自动补齐 |
| 生效日期 | 是 | 2026-09-01 | YYYY-MM-DD 或合法 Excel 日期 |
| 失效日期 | 是 | 2026-09-30 | 必须 >= 生效日期 |
| ETD | 否 | 2026-09-05 08:00 | 不要求填写 ISO `Z` 格式 |
| 航程天数 | 否 | 18 | 正整数 |
| 供应商名称 | 否 | ABC Logistics | 采购来源 |
| 合约号 | 否 | SC-2026-A | 船司/供应商合约号 |
| 运价币种 | 是 | USD | ISO 4217，默认可由模板填 USD |
| 价格类型 | 否 | BASE | BASE / ALL_IN，默认 BASE |
| 状态 | 否 | ACTIVE | DRAFT / ACTIVE / INACTIVE，默认 DRAFT |
| 20GP采购成本 | 否 | 850 | 最多 4 位小数 |
| 20GP标准售价 | 否 | 980 | 最多 4 位小数 |
| 40GP采购成本 | 否 | 1150 | 最多 4 位小数 |
| 40GP标准售价 | 否 | 1300 | 最多 4 位小数 |
| 40HQ采购成本 | 否 | 1250 | 最多 4 位小数 |
| 40HQ标准售价 | 否 | 1400 | 最多 4 位小数 |
| 45HQ采购成本 | 否 | 1550 | 若系统当前不支持 45HQ，可暂时不放模板 |
| 45HQ标准售价 | 否 | 1700 | 同上 |
| 备注 | 否 | General cargo only | 自由文本 |

### 箱型价格规则

- 一行中可以只填某一种箱型，也可以同时填多个箱型。
- 某个箱型的“采购成本”和“标准售价”都为空：不创建该箱型价格。
- `ACTIVE` 状态下，至少必须存在一个箱型的“标准售价”。
- `DRAFT` 状态允许价格暂不完整。
- 箱型价格币种统一继承 `运价币种`。
- 不再在每个箱型旁重复维护“价格币种”。

### 示例

| 导入编号 | 运价编号 | 起运港代码 | 目的港代码 | 船司代码 | 航线服务 | 生效日期 | 失效日期 | 运价币种 | 状态 | 20GP采购成本 | 20GP标准售价 | 40GP采购成本 | 40GP标准售价 | 40HQ采购成本 | 40HQ标准售价 |
|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|
| R001 | RATE-SHA-LAX-001 | CNSHA | USLAX | COSCO | Pacific Express | 2026-09-01 | 2026-09-30 | USD | ACTIVE | 850 | 980 | 1150 | 1300 | 1250 | 1400 |
| R002 |  | CNNGB | DEHAM | MAEU | Europe Weekly | 2026-09-10 | 2026-10-10 | USD | DRAFT |  |  |  |  | 1750 | 1980 |

系统解析 R001 后应生成：

```text
Rate: 1 条
RatePrice:
- 20GP: cost=850, sell=980, currency=USD
- 40GP: cost=1150, sell=1300, currency=USD
- 40HQ: cost=1250, sell=1400, currency=USD
```

---

# 5. Sheet：附加费导入

不要把多个附加费继续塞进备注字段。

每一个附加费占一行，通过 `导入编号` 关联主运价。

推荐字段：

| 字段 | 必填 | 示例 | 说明 |
|---|---|---|---|
| 导入编号 | 是 | R001 | 必须能在“运价导入”中找到 |
| 费用代码 | 否 | AMS | 如系统有费用字典，优先匹配代码 |
| 费用名称 | 是 | AMS Fee | |
| 采购成本 | 否 | 25 | |
| 标准售价 | 否 | 35 | |
| 币种 | 是 | USD | 可与基础运价不同 |
| 计费单位 | 是 | PER_BL | PER_CONTAINER / PER_SHIPMENT / PER_BL |
| 适用箱型 | 否 | ALL | ALL / 20GP / 40GP / 40HQ / 45HQ |
| 备注 | 否 | US import AMS | |

示例：

| 导入编号 | 费用代码 | 费用名称 | 采购成本 | 标准售价 | 币种 | 计费单位 | 适用箱型 |
|---|---|---|---:|---:|---|---|---|
| R001 | AMS | AMS Fee | 25 | 35 | USD | PER_BL | ALL |
| R001 | DOC | Documentation Fee | 30 | 50 | USD | PER_BL | ALL |
| R001 | THC | Origin THC | 650 | 720 | CNY | PER_CONTAINER | 40HQ |

解析后应该关联至 R001 对应 Rate。

---

# 6. 导入编号与正式运价编号

需要明确区分：

## 导入编号

- 只在当前 Excel 工作簿内使用。
- 用于附加费和主运价建立关联。
- 必填。
- 工作簿内唯一。
- 不写入正式运价编号字段，或仅保存为 import_reference（如有需要）。

## 运价编号

- 系统正式业务编号。
- Excel 可填写，也可为空。
- 为空时调用现有编号生成逻辑，例如：`RATE-20260831-0018`。
- 若填写，需检查与数据库现有编号是否冲突。

---

# 7. 模板识别与向后兼容

Importer 必须支持自动识别 V1 / V2。

## V1 Legacy 特征

存在以下列：

- `箱型`
- `采购成本`
- `标准售价`
- `价格币种`

继续按照现有逻辑：相同运价编号多行合并。

## V2 Wide 特征

存在类似列：

- `20GP采购成本`
- `20GP标准售价`
- `40HQ采购成本`
- `40HQ标准售价`

按“一行一条 Rate”解析。

### 要求

- 不需要用户手工选择“旧模板 / 新模板”。
- 后端根据表头自动识别。
- 无法识别时返回明确错误：`无法识别模板版本，请下载最新模板。`
- 新下载按钮默认下载 V2 模板。
- 旧模板继续可用，但 UI 上标记为“兼容旧版”，不再作为默认模板。

---

# 8. 标准化规则

Parser 不应直接把原始 Excel 内容写库，应先生成统一 DTO：

```ts
interface NormalizedRateImport {
  importRef: string;
  rateNo?: string;
  polCode: string;
  podCode: string;
  carrierCode: string;
  service?: string;
  transportMode: 'DIRECT' | 'TRANSSHIP';
  transitPortCode?: string;
  validFrom: string;
  validTo: string;
  etd?: string;
  transitDays?: number;
  supplierName?: string;
  contractNo?: string;
  currency: string;
  priceType: 'BASE' | 'ALL_IN';
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  prices: Array<{
    containerType: string;
    cost?: number;
    sell?: number;
    currency: string;
  }>;
  surcharges: Array<{
    code?: string;
    name: string;
    cost?: number;
    sell?: number;
    currency: string;
    unit: 'PER_CONTAINER' | 'PER_SHIPMENT' | 'PER_BL';
    containerType?: string;
    remark?: string;
  }>;
  remark?: string;
}
```

V1 和 V2 最终都转换成这个 DTO，再共用后面的校验、保存逻辑。

避免维护两套数据库写入逻辑。

---

# 9. 数据清洗规则

导入时自动处理：

1. 去掉文本前后空格。
2. 港口代码、船司代码、币种转大写。
3. 忽略完全空白行。
4. Excel 数字格式价格转换为 number。
5. 最多保留 4 位小数。
6. 日期兼容：
   - Excel Date Cell
   - `YYYY-MM-DD`
7. ETD 兼容：
   - Excel DateTime
   - `YYYY-MM-DD`
   - `YYYY-MM-DD HH:mm`
8. 不要求业务人员填写 `2026-09-05T08:00:00Z` 这种 ISO UTC 字符串。
9. 名称字段有代码时可从 Master Data 自动补齐。

---

# 10. 校验规则

校验必须发生在写库之前。

## 必填校验

- 导入编号
- POL Code
- POD Code
- Carrier Code
- Valid From
- Valid To
- Currency

## 业务校验

- `validTo >= validFrom`
- POL 与 POD 不能相同
- 航程天数必须 > 0
- 价格不能为负数
- Currency 必须为系统支持币种
- Container Type 必须为系统支持箱型
- `ACTIVE` 运价至少存在一个标准售价
- TRANSSHIP 且填写中转港时，中转港不能等于 POL / POD
- 附加费的 `导入编号` 必须能找到主运价
- `PER_CONTAINER` + 指定箱型时，该箱型应为系统支持箱型

## Master Data 校验

优先用代码作为唯一判断：

- POL Code 必须存在于 Port Master
- POD Code 必须存在于 Port Master
- Carrier Code 必须存在于 Carrier Master

若名称为空：自动补齐名称。

若代码与名称不一致：

- 代码为准
- 返回 Warning，不阻断导入
- 示例：`第 3 行：CNSHA 对应名称为 Shanghai，Excel 中填写为 ShangHai Port，系统将使用 Shanghai。`

---

# 11. 错误处理

禁止出现：部分错误但页面只显示“导入失败”。

需要返回结构化错误：

```ts
interface ImportIssue {
  sheet: string;
  row: number;
  column?: string;
  level: 'ERROR' | 'WARNING';
  code: string;
  message: string;
}
```

例如：

```text
ERROR  运价导入 第4行  目的港代码：USXXX 不存在
ERROR  运价导入 第7行  失效日期：必须晚于或等于生效日期
WARNING 运价导入 第9行 起运港名称：已根据 CNSHA 自动修正为 Shanghai
ERROR  附加费导入 第5行 导入编号：R009 在主表中不存在
```

只要存在 ERROR：

- 不进行正式写库；
- 返回全部能检测到的错误，不要只返回第一条。

只有 WARNING：允许继续导入。

---

# 12. 导入流程

建议流程：

```text
点击 Excel 导入
↓
下载 V2 模板 / 上传文件
↓
解析 Workbook
↓
识别 V1 / V2
↓
Normalize
↓
Validate
↓
展示导入预览
↓
用户确认
↓
事务写入数据库
↓
返回导入结果
```

## 导入预览至少显示

```text
检测到 V2 运价模板

运价：36 条
箱型价格：82 条
附加费：24 条

错误：0
警告：3

[查看警告]
[确认导入]
```

如果暂时不做 Preview UI，后端仍应先完整校验，再一次性事务写入。

---

# 13. 事务要求

一个工作簿作为一次 Import Job。

正式导入必须放在数据库 transaction 中。

若保存阶段出现异常：

- 整个工作簿回滚；
- 不允许出现 36 条成功、2 条因为程序异常没写入，但页面误显示完成。

业务级行错误应在写库前通过 validation 捕获。

---

# 14. 重复数据策略

P0 默认使用：`ONLY_CREATE`。

## Excel 填写了运价编号

若数据库已存在相同 `rateNo`：

```text
ERROR：运价编号 RATE-SHA-LAX-001 已存在。
```

不默认覆盖。

## Excel 未填写运价编号

系统自动生成新编号。

P1 再增加：

```text
Import Mode:
○ 仅新增
○ 更新已有运价
```

更新模式必须明确可更新字段，不能简单 delete + recreate。

---

# 15. Excel 模板体验要求

新模板不是纯空白表。

需要：

1. 第一行固定表头。
2. 冻结首行。
3. 为以下字段增加 Excel 下拉验证（如技术实现成本合理）：
   - 运输方式
   - 运价币种
   - 价格类型
   - 状态
   - 附加费计费单位
   - 适用箱型
4. 日期列使用日期格式。
5. 金额列使用 `0.0000` 或通用数值格式。
6. 至少保留 2 条示例数据。
7. `填写说明` Sheet 说明必填字段、枚举值和示例。
8. 必填字段表头可以带 `*`，但 Parser 识别字段时要兼容有无 `*`。

---

# 16. UI 改造

运价列表页现有 Excel 导入入口保留。

建议改为：

```text
[Excel 导入 ▼]
  下载运价模板
  导入运价 Excel
```

上传后的结果不要只 Toast。

需要弹窗/Drawer 显示：

- 模板版本
- 运价条数
- 箱型价格条数
- 附加费条数
- Error 数
- Warning 数
- 错误明细

成功后：

```text
Excel 运价导入完成
36 条运价
82 个箱型价格
24 个附加费
```

然后刷新列表。

---

# 17. API 建议

如果当前 API 可以改，建议拆为：

```text
POST /api/admin/rates/import/validate
```

输入：xlsx

输出：

```json
{
  "templateVersion": "V2",
  "summary": {
    "rates": 36,
    "prices": 82,
    "surcharges": 24,
    "errors": 0,
    "warnings": 3
  },
  "issues": [],
  "importToken": "..."
}
```

确认：

```text
POST /api/admin/rates/import/commit
```

```json
{
  "importToken": "..."
}
```

如果现阶段不想拆接口，也可以保留单接口，但 Parser / Validator / Persister 必须在代码层分离。

---

# 18. 推荐代码结构

不要把所有 Excel 逻辑堆进 Controller / Route Handler。

建议：

```text
rate-import/
├── detect-template-version.ts
├── parse-v1-long.ts
├── parse-v2-wide.ts
├── parse-surcharges.ts
├── normalize-rate.ts
├── validate-rate-import.ts
├── persist-rate-import.ts
├── rate-import.types.ts
└── rate-import.test.ts
```

统一入口：

```ts
parseWorkbook(file)
  -> detectVersion()
  -> parseV1() / parseV2()
  -> normalize()
  -> validate()
  -> ImportResult
```

---

# 19. 测试用例

Codex 实现时必须补测试，至少覆盖：

### 正常

1. V2 一行只有 20GP。
2. V2 一行同时存在 20GP + 40GP + 40HQ。
3. 两条运价、多条附加费。
4. 基础运价 USD，附加费 CNY。
5. 运价编号为空，系统自动生成。
6. Port Name 为空，根据 Code 自动补齐。
7. V1 旧模板仍正常导入并按 rateNo 合并。

### 错误

8. POL Code 不存在。
9. Carrier Code 不存在。
10. 失效日期早于生效日期。
11. ACTIVE 但所有售价为空。
12. 金额为负数。
13. 附加费引用不存在的导入编号。
14. 同一工作簿出现重复导入编号。
15. 正式运价编号与数据库已有编号冲突。
16. 只有表头、没有数据。
17. 不支持的 Excel 表头。

### 清洗

18. Code 前后存在空格。
19. `cnsHa` 自动转 `CNSHA`。
20. 日期使用 Excel 原生日期单元格。
21. ETD 使用 `2026-09-05 08:00`。
22. 空白行自动忽略。

---

# 20. 验收标准

完成后必须满足：

1. 用户下载的新模板是一条运价一行，而不是一个箱型一行。
2. 一个 V2 Excel 行可以一次导入 20GP / 40GP / 40HQ 多个价格。
3. 导入后数据库仍然按独立箱型价格记录保存。
4. 附加费可以通过第二 Sheet 同时导入，并正确绑定运价。
5. 新模板不要求重复填写箱型价格币种。
6. V1 旧模板继续可以正常导入。
7. Excel 出错时能准确告诉用户 Sheet、行号、字段和原因。
8. 有 ERROR 时不写入任何业务数据。
9. 导入成功后列表立即显示新增运价。
10. 不影响手工新建/编辑运价功能。
11. 不影响客户侧 Rate Search 已有查询逻辑。
12. 所有新解析逻辑有自动化测试。

---

# 21. 实施优先级

建议 Codex 按以下顺序开发，不要一次性重写整个模块：

### Step 1

先阅读现有：

- Rate 数据模型
- RatePrice 数据模型
- Surcharge 数据模型
- 当前 Excel import route/service
- 当前模板生成代码
- Rate No 生成规则
- Port / Carrier master data

输出当前实现分析，不立即改代码。

### Step 2

建立统一 `NormalizedRateImport` DTO，并让旧 V1 Parser 也转换到该 DTO。

确保旧测试通过。

### Step 3

增加 V2 Wide Parser。

### Step 4

增加附加费 Sheet Parser。

### Step 5

增加 Validation + Issues 返回。

### Step 6

更新模板生成器，默认下载 V2。

### Step 7

更新前端导入结果 UI。

### Step 8

补齐自动化测试并回归手工新建、旧 Excel 导入、Rate Search。

---

# 22. 给 Codex 的执行要求

开始编码前：

1. 先搜索并阅读现有运价导入相关代码。
2. 列出将要修改的文件。
3. 说明现有数据模型是否能直接承载 V2；如果不能，先说明原因，不要擅自大改 schema。
4. 尽量复用现有 Rate/Price/Surcharge 创建逻辑。
5. 保持向后兼容。
6. 不要为了本次 Excel 改造重构无关模块。
7. 每完成一个阶段运行 lint / typecheck / tests。
8. 最后给出：修改文件列表、数据兼容说明、测试结果、仍未覆盖的边界情况。
