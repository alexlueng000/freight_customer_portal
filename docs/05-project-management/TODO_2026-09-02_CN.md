# 2026-09-02 测试报告：运价 Excel 导入 P0-A 验收

> 测试日期：2026-09-02
> 优先级：P0
> 目标：完成真实运价 Excel 导入回放，确认 P0-A 是否达到验收 Gate。
> 当前结论：运价 Excel 导入 P0-A 已通过当前测试。

## 一、今日已完成基线

- 应用、PostgreSQL、Redis、MinIO 和 Worker 已成功启动。
- 运价导入 Worker 数据库集成测试 7/7 通过。
- `01_standard_english_FCL.xlsx` 已完成分析、预览、确认、队列入库和 Rate Search 回放。
- 导入结果：5 条 Rate、15 条 RatePrice，成功 5 条、失败 0 条。
- 客户侧已成功查到 `CNSZX → SGSIN / PIL / 20GP / USD 420`。

## 二、验收回放结果

- [x] 回放 `02_chinese_headers_global_validity.xlsx`：验证中文表头、全局有效期和币种识别。
- [x] 回放 `08_messy_CN_alias_mixed_dates.xlsx`：验证中文别名、港口/船司归一化和混合日期。
- [x] 每个样例都完成以下链路：
  - 上传与工作簿分析；
  - Sheet/表头选择与 Mapping 检查；
  - 标准化预览与 Error/Warning 检查；
  - 用户确认与 BullMQ 异步导入；
  - Worker 事务入库与 Import Job 结果检查；
  - 后台 Rate Search；
  - 将一条有效运价设为 ACTIVE 后执行客户侧 Rate Search。
- [x] 保存验收证据：样例名、预览汇总、Error/Warning、Import Job ID、成功/失败数和查价结果。
- [x] 根据结果更新 `Pilot_P0_优化路线图与进度_CN.md`。

## 三、验收通过标准

- 三类结构明显不同的工作簿已完成回放。
- 无需将客户原始数据重新抄入平台模板。
- Error 可定位到原 Sheet、行和列，且存在 Error 时不写入业务数据。
- 无 Error 时可完成确认、异步队列和整批事务入库。
- 导入后的 Rate、RatePrice 和可用 RateCharge 与预览结果一致。
- 后台和客户侧 Rate Search 返回正确的航线、船司、箱型、币种和价格。
- 任一批次写入失败时整批回滚，不留部分运价。

## 四、验收后决策

- 全部通过：标记 P0-A 验收 Gate 通过，可开始或继续 P0-B Booking 客户侧减负。
- 存在可修正缺口：记录样例、原始单元格、期望结果和实际结果，按 P0/P1 分级。
- 存在数据错写或跨租户问题：立即停止 P0-B，优先修复并重跑全部 P0-A 验收。

## 五、识别链路与 AI 后续建议

当前 Excel 导入识别链路已经通过当前测试，代码边界如下：

- API 入口：`apps/api/src/modules/rates/rates.controller.ts`
- 上传分析与编排：`apps/api/src/modules/rates/rate-imports.service.ts`
- Sheet、表头候选和字段建议：`apps/api/src/modules/rates/rate-import-workbook-analyzer.ts`
- Mapping 后标准化预览、日期/币种/港口/船司/箱型价格校验：`apps/api/src/modules/rates/rate-import-normalizer.ts`
- 确认后事务写库：`apps/worker/src/rate-import.processor.ts`
- 前端导入弹窗和人工确认：`apps/web/app/admin/rates/page.tsx`

后续可以加入 AI 智能识别，但应作为“识别助手”接入分析阶段，而不是绕过人工确认直接写库。建议流程：

```text
规则识别
→ AI 补充识别 Sheet / 表头 / 字段 Mapping / 全局有效期 / 币种 / 多价单元格
→ 用户预览确认
→ 确定性校验
→ Worker 事务写库
```

AI 适合处理真实客户 Excel 中的多 Sheet、说明行、偏移/双层表头、有效期写在标题区、币种写在备注区、`850/1250/1400` 多价写在单元格等复杂情况。无论 AI 识别置信度多高，仍必须保留预览、用户确认、Error 阻止写库、租户隔离、金额/日期/币种/箱型的确定性校验和导入审计。
