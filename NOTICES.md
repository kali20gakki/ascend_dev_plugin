# 第三方声明

本仓库中的插件壳（`plugin.json`、`.claude-plugin/`、`scripts/`、`docs/`、`assets/`）采用 MIT
许可证，见 [LICENSE](LICENSE)。

`skills/` 下的技能是 **git submodule**，不适用本仓库许可证；每个 submodule 保留其自身的许可证与
版权。插件仅通过固定的 gitlink 引用它们，具体提交由 `git submodule status` 列出。

| 技能 | 来源 | 许可证 |
| --- | --- | --- |
| `scene-fuzz` | <https://github.com/kali20gakki/sence_fuzz> | 上游仓库无 `LICENSE` 文件（作者 kali20gakki），使用遵循上游条款 |
| `gitcode-cli` | <https://github.com/kali20gakki/gitcode_cli_skill> | MIT |
| `ascend-interface-auditor` | <https://github.com/kali20gakki/Ascend-Interface-Auditor> | MIT |
| `gitcode-code-reviewer` | <https://github.com/kali20gakki/gitcode-code-reviewer> | MIT |
| `gitcode-release-note-generator` | <https://github.com/kali20gakki/gitcode-release-note-generator> | MIT |
| `document-ux-review` | <https://github.com/kali20gakki/document-ux-review> | 上游仓库无 `LICENSE` 文件（作者 kali20gakki），使用遵循上游条款 |

## 商标

Ascend、CANN、GitCode 等名称归各自所有者所有。本仓库是独立的 agent 技能集合，与上述所有者
无隶属或背书关系。
