# 设计镜像清单（en-US）

> 本页是**中文侧入口**：en-US 设计镜像的完整清单（zh 分片 → en 落点映射、未镜像分片的逐条登记、每页 H2 对应关系、en 侧独有小节）在 [英文镜像清单](https://github.com/dependfix/dependfix/blob/master/docs/i18n/en-US/design/mirror-manifest.md) 中维护。
> 为什么拆两页：清单本身面向英文读者（说明哪些设计文档有英文版），但站点要求每个 en 页面都有根 locale 对应页（防语言切换反向 404），故在本目录保留这份入口。
> 阅读中文设计文档请直接看 [专项设计与治理](./governance/index.md) 与 [模块设计](./modules/index.md)。

## 约定

- zh 设计分片与 en 镜像不做逐字等价承诺，只保证**结构可映射 + 无静默缺口**（口径见 [文档规范 §6](../standards/documentation.md)）。
- 新增 / 删除 zh 设计分片或 en 镜像时必须同批更新清单，`pnpm run docs:check:mirror` 会校验三方一致。
