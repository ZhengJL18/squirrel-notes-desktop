# 松鼠症笔记（桌面版）

以笔记为中心的 Markdown 课堂笔记软件，内嵌离线语音转写（sherpa-onnx）、说话人分离、DeepSeek 一键生成笔记。**Electron + React 实现**，中文输入体验原生（CodeMirror 6）。

## 功能

- 科目 → 笔记 → 音频 三层组织，全文搜索（FTS5）
- Markdown 编辑器：源码 + 预览切换，LaTeX 公式渲染
- 离线转写：Paraformer / SenseVoice / Whisper 自选，说话人分离 + 热词纠偏
- DeepSeek 一键生成笔记 + 科目热词自进化
- 自动更新（electron-updater + GitHub Releases）

## 开发

```bash
npm install
npm run dev        # 开发模式
npm run build      # 编译
npm run dist       # 打包安装包
```

## 发布

```bash
# 改 package.json 版本号，提交后：
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 自动构建 NSIS 安装包并发布到 GitHub Release，App 内自动更新。

## 技术栈

Electron + Vite + React + TypeScript + CodeMirror 6 + better-sqlite3 + sherpa-onnx-node
